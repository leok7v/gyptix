#if 0 // LEGACY code: keepng around for reference only
#include "arg.h"
#include "common.h"
#include "console.h"
#include "log.h"
#include "sampling.h"
#include "llama-cpp.h"
#include "llama-if.h"
#include "getcwd.h"
#include "trace.h"
#include <sys/stat.h>
#include "chat-template.hpp"

#include <cstdio>
#include <cstring>
#include <ctime>
#include <fstream>
#include <iostream>
#include <sstream>
#include <string>
#include <vector>

#if defined (__unix__) || (defined (__APPLE__) && defined (__MACH__))
#include <signal.h>
#include <unistd.h>
#elif defined (_WIN32)
#define WIN32_LEAN_AND_MEAN
#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <windows.h>
#include <signal.h>
#endif

#if defined(_MSC_VER)
#pragma warning(disable: 4244 4267) // possible loss of data
#endif

static const char * DEFAULT_SYSTEM_MESSAGE = "You are a helpful assistant";

struct state {
    ggml_backend_reg_t           ggml_reg         {nullptr};
    struct ggml_threadpool     * threadpool       {nullptr};
    struct ggml_threadpool     * threadpool_batch {nullptr};
    common_init_result           llama_init;
    llama_context              * ctx   {nullptr};
    const llama_model          * model {nullptr};
    common_sampler             * smpl  {nullptr};
    const llama_vocab          * vocab {nullptr};
    common_params                params;
    common_chat_templates        chat_templates;
    std::vector<common_chat_msg> chat_msgs;
    std::vector<llama_token>     embd;
    std::vector<llama_token>     embd_inp;
    std::vector<llama_token>     session_tokens;
    std::vector<llama_token>     input_tokens;
    std::vector<llama_token>     output_tokens;
    std::ostringstream           output_ss;
    std::ostringstream           assistant_ss;
    std::vector<std::vector<llama_token>> antiprompt_ids;
    int n_ctx_train {0};
    int n_ctx {0};
    bool has_chat_template      {false};
    bool is_interacting         {false};
    bool need_insert_eot        {false};
    bool is_antiprompt          {false};
    bool input_echo             {false};
    bool display                {false};
    bool need_to_save_session   {false};
    int n_past                  {0};
    int n_remain                {0};
    int n_consumed              {0};
    int n_session_consumed      {0};
    double progress             {0}; // progress of processin embd_inp
    struct  {
        size_t embd_size            {0};
        size_t embd_inp_size        {0};
        size_t session_tokens_size  {0};
        int n_past                  {0};
        int n_remain                {0};
        int n_consumed              {0};
        int n_session_consumed      {0};
    } at_readline;
};

static void save_at_readline(struct state& state) {
    state.at_readline.embd_size           = state.embd.size();
    state.at_readline.embd_inp_size       = state.embd_inp.size();
    state.at_readline.session_tokens_size = state.session_tokens.size();
    state.at_readline.n_past              = state.n_past;
    state.at_readline.n_remain            = state.n_remain;
    state.at_readline.n_consumed          = state.n_consumed;
    state.at_readline.n_session_consumed  = state.n_session_consumed;
}

static void restore_at_readline(struct state& state) {
    state.embd.resize(state.at_readline.embd_size);
    state.embd_inp.resize(state.at_readline.embd_inp_size);
    state.session_tokens.resize(state.at_readline.session_tokens_size);
    state.n_past              = state.at_readline.n_past;
    state.n_remain            = state.at_readline.n_remain;
    state.n_consumed          = state.at_readline.n_consumed;
    state.n_session_consumed  = state.at_readline.n_session_consumed;
}

static void print_usage(int argc, char ** argv) {
    (void) argc;

    LOG("\nexample usage:\n");
    LOG("\n  text generation:     %s -m your_model.gguf -p \"I believe the meaning of life is\" -n 128\n", argv[0]);
    LOG("\n  chat (conversation): %s -m your_model.gguf -p \"You are a helpful assistant\" -cnv\n", argv[0]);
    LOG("\n");
}

static bool file_exists(const std::string & path) {
    std::ifstream f(path.c_str());
    return f.good();
}

static bool file_is_empty(const std::string & path) {
    std::ifstream f;
    f.exceptions(std::ifstream::failbit | std::ifstream::badbit);
    f.open(path.c_str(), std::ios::in | std::ios::binary | std::ios::ate);
    return f.tellg() == 0;
}

static int parse_params(struct state &state, int argc, char* argv[]) {
    common_params &params = state.params;
    if (!common_params_parse(argc, argv, params, LLAMA_EXAMPLE_MAIN, print_usage)) {
        return 1;
    }
    common_init();
    auto & sparams = params.sampling;
    console::init(params.simple_io, params.use_color);
    atexit([]() { console::cleanup(); });
    if (params.logits_all) {
        LOG_ERR("************\n");
        LOG_ERR("%s: please use the 'perplexity' tool for perplexity calculations\n", __func__);
        LOG_ERR("************\n\n");
        return 0;
    }
    if (params.embedding) {
        LOG_ERR("************\n");
        LOG_ERR("%s: please use the 'embedding' tool for embedding calculations\n", __func__);
        LOG_ERR("************\n\n");
        return 0;
    }
    if (params.n_ctx != 0 && params.n_ctx < 8) {
        LOG_WRN("%s: warning: minimum context size is 8, using minimum size.\n", __func__);
        params.n_ctx = 8;
    }
    if (params.rope_freq_base != 0.0) {
        LOG_WRN("%s: warning: changing RoPE frequency base to %g.\n", __func__, params.rope_freq_base);
    }
    if (params.rope_freq_scale != 0.0) {
        LOG_WRN("%s: warning: scaling RoPE frequency by %g.\n", __func__, params.rope_freq_scale);
    }
    return 0;
}

static int load(struct state &state) {
    LOG_INF("%s: llama backend init\n", __func__);
    state.model = nullptr;
    state.ctx = nullptr;
    state.smpl = nullptr;
    // load the model and apply lora adapter, if any
    LOG_INF("%s: load the model and apply lora adapter, if any\n", __func__);
    state.llama_init = common_init_from_params(state.params);
    state.model = state.llama_init.model.get();
    state.ctx = state.llama_init.context.get();
    if (state.model == NULL) {
        LOG_ERR("%s: error: unable to load model\n", __func__);
        return 1;
    }
    state.vocab = llama_model_get_vocab(state.model);
    state.chat_templates = common_chat_templates_from_model(state.model, state.params.chat_template);
    return 0;
}

static int ggml_init(struct state &state) {
    LOG_INF("%s: llama threadpool init, n_threads = %d\n", __func__, (int)state.params.cpuparams.n_threads);
    state.ggml_reg = ggml_backend_dev_backend_reg(ggml_backend_dev_by_type(GGML_BACKEND_DEVICE_TYPE_CPU));
    auto &reg = state.ggml_reg;
    auto * ggml_threadpool_new_fn = (decltype(ggml_threadpool_new) *) ggml_backend_reg_get_proc_address(reg, "ggml_threadpool_new");
    struct ggml_threadpool_params tpp_batch =
            ggml_threadpool_params_from_cpu_params(state.params.cpuparams_batch);
    struct ggml_threadpool_params tpp =
            ggml_threadpool_params_from_cpu_params(state.params.cpuparams);
    set_process_priority(state.params.cpuparams.priority);
    state.threadpool_batch = NULL;
    if (!ggml_threadpool_params_match(&tpp, &tpp_batch)) {
        state.threadpool_batch = ggml_threadpool_new_fn(&tpp_batch);
        if (!state.threadpool_batch) {
            LOG_ERR("%s: batch threadpool create failed : n_threads %d\n", __func__, tpp_batch.n_threads);
            return 1;
        }
        // Start the non-batch threadpool in the paused state
        tpp.paused = true;
    }
    state.threadpool = ggml_threadpool_new_fn(&tpp);
    if (!state.threadpool) {
        LOG_ERR("%s: threadpool create failed : n_threads %d\n", __func__, tpp.n_threads);
        return 1;
    }
    llama_attach_threadpool(state.ctx, state.threadpool, state.threadpool_batch);
    llama_backend_init();
    llama_numa_init(state.params.numa);
    return 0;
}

static int64_t extract_id(const std::string &input, const std::string &prefix) {
    std::size_t start = input.find(":") + 1;
    std::size_t end = input.find("-->", start);
    if (start != std::string::npos && end != std::string::npos) {
        std::string id_str = input.substr(start, end - start);
        return std::stoll(id_str);
    }
    return 0;
}

static std::string prompt_cache_filename(const char* session) {
    static const char* cwd = get_cwd();
    static char prompts[4 * 1024];
    strcpy(prompts, cwd);
    strcat(prompts, "/prompts");
    mkdir(prompts, S_IRWXU);
    static char prompt_cache[4 * 1024];
    strcpy(prompt_cache, prompts);
    strcat(prompt_cache, "/");
    strcat(prompt_cache, session);
    LOG_INF("%s\n", prompt_cache);
    return std::string(prompt_cache);
}

static void clear(struct state &state) {
    state.chat_msgs.clear();
    state.embd.clear();
    state.embd_inp.clear();
    state.session_tokens.clear();
    state.input_tokens.clear();
    state.output_tokens.clear();
    state.output_ss.clear();
    state.assistant_ss.clear();
    state.antiprompt_ids.clear();
    state.is_interacting       = false;
    state.input_echo           = false;
    state.display              = false;
    state.n_ctx_train          = 0;
    state.n_ctx                = 0;
    state.has_chat_template    = false;
    state.is_interacting       = false;
    state.need_insert_eot      = false;
    state.is_antiprompt        = false;
    state.display              = false;
    state.need_to_save_session = false;
    state.n_past               = 0;
    state.n_remain             = 0;
    state.n_consumed           = 0;
    state.n_session_consumed   = 0;
    state.progress             = 0; // progress of processing embd_inp
    state.n_past               = 0;
    state.n_remain             = state.params.n_predict;
    state.n_consumed           = 0;
    state.n_session_consumed   = 0;
    state.params.n_keep        = -1;
    state.at_readline          = {0};
}

static int load_session(struct state &state, const std::string &filename) {
    trace("attempting to load saved session from '%s'\n",filename.c_str());
    if (!file_exists(filename)) {
        trace("session file does not exist, will create.\n");
    } else if (file_is_empty(filename)) {
        trace("session file is empty. A new session will be initialized.\n");
    } else { // The file exists and is not empty
        state.session_tokens.resize(state.n_ctx);
        size_t n_token_count_out = 0;
        if (!llama_state_load_file(state.ctx, filename.c_str(),
                                   state.session_tokens.data(),
                                   state.session_tokens.capacity(),
                                   &n_token_count_out)) {
            LOG_INF("failed to load session file '%s'\n", filename.c_str());
            return 1;
        }
        state.session_tokens.resize(n_token_count_out);
        trace("loaded a session with prompt size of %d tokens\n",
               (int)state.session_tokens.size());
    }
    return 0;
}

static std::string tokens_to_string(const struct state &state,
        std::vector<llama_token> tokens, int from = 0, int to = -1) {
    if (to < 0) { to = (int)tokens.size(); }
    std::ostringstream ss;
    for (int i = from; i < to; i++) {
        ss << common_token_to_piece(state.ctx, tokens[i]).c_str();
    }
    return ss.str();
}

static std::string add_and_format(struct state &state, const std::string & role,
                                  const std::string & content) {
    common_chat_msg new_msg{role, content};
    std::string formatted = common_chat_format_single(
        *state.chat_templates.template_default,
        state.chat_msgs, new_msg, role == "user",
        state.params.use_jinja);
    state.chat_msgs.push_back({role, content});
    trace("formatted: '%s'\n", formatted.c_str());
    return formatted;
}

static void tokenize_prompt(struct state &state) {
    auto prompt = (state.params.conversation_mode &&
                   state.params.enable_chat_template)
        // format the system prompt in conversation mode
        // (fallback to default if empty)
        ? add_and_format(state, "system", state.params.prompt.empty() ?
                              DEFAULT_SYSTEM_MESSAGE : state.params.prompt)
        // otherwise use the prompt as is
        : state.params.prompt;
    if (state.session_tokens.empty()) {
        // because params.interactive_first is set to true for next session
        trace("tokenize system prompt\n");
        state.embd_inp = common_tokenize(state.ctx, prompt, true, true);
    } else {
        trace("use session tokens\n");
        state.embd_inp = state.session_tokens;
    }
//  trace("prompt: \"%s\"\n", prompt.c_str());
//  trace("tokens: %s\n", string_from(state.ctx, state.embd_inp).c_str());
}

static void dump_session_match(const struct state &state, int n_matching_session_tokens) {
    if (state.params.prompt.empty() && n_matching_session_tokens == state.embd_inp.size()) {
        trace("using full prompt from session file\n");
    } else if (n_matching_session_tokens >= state.embd_inp.size()) {
        trace("session file has exact match for prompt\n");
    } else if (n_matching_session_tokens < (state.embd_inp.size() / 2)) {
        trace("session file has low similarity to prompt (%u / %u tokens);"
               " will mostly be reevaluated\n",
               n_matching_session_tokens, (int)state.embd_inp.size());
    } else {
        trace("session file matches %zu / %zu tokens of prompt\n",
                n_matching_session_tokens, state.embd_inp.size());
    }
}

static void dump_interactive_info(const struct state &state) {
    if (state.params.interactive) {
        trace("interactive mode on.\n");
        if (!state.params.antiprompt.empty()) {
            for (const auto & antiprompt : state.params.antiprompt) {
                trace("Reverse prompt: '%s'\n", antiprompt.c_str());
                if (state.params.verbose_prompt) {
                    auto tmp = common_tokenize(state.ctx, antiprompt, false, true);
                    for (int i = 0; i < (int) tmp.size(); i++) {
                        trace("%6d -> '%s'\n", tmp[i],
                            common_token_to_piece(state.ctx, tmp[i]).c_str());
                    }
                }
            }
        }
        if (state.params.input_prefix_bos) {
            trace("Input prefix with BOS\n");
        }
        if (!state.params.input_prefix.empty()) {
            trace("Input prefix: '%s'\n", state.params.input_prefix.c_str());
            if (state.params.verbose_prompt) {
                auto tmp = common_tokenize(state.ctx, state.params.input_prefix, true, true);
                for (int i = 0; i < (int) tmp.size(); i++) {
                    trace("%6d -> '%s'\n", tmp[i],
                        common_token_to_piece(state.ctx, tmp[i]).c_str());
                }
            }
        }
        if (!state.params.input_suffix.empty()) {
            trace("Input suffix: '%s'\n", state.params.input_suffix.c_str());
            if (state.params.verbose_prompt) {
                auto tmp = common_tokenize(state.ctx, state.params.input_suffix, false, true);
                for (int i = 0; i < (int) tmp.size(); i++) {
                    trace("%6d -> '%s'\n", tmp[i],
                        common_token_to_piece(state.ctx, tmp[i]).c_str());
                }
            }
        }
    }
}

static void dump_prompt(const struct state &state) {
    if (state.params.verbose_prompt) {
        trace("prompt: '%s'\n", state.params.prompt.c_str());
        trace("number of tokens in prompt = %u\n", (int)state.embd_inp.size());
        for (int i = 0; i < (int) state.embd_inp.size(); i++) {
            trace("%6d -> '%s'\n", state.embd_inp[i],
                  common_token_to_piece(state.ctx, state.embd_inp[i]).c_str());
        }
        const bool add_bos = llama_vocab_get_add_bos(state.vocab);
        if (state.params.n_keep > add_bos) {
            trace("static prompt based on n_keep: '%s'\n",
                   tokens_to_string(state, state.embd_inp, 0,
                                    state.params.n_keep).c_str());
        }
    }
}

static int decode(struct state &state) {
//  trace("embd.size(): %d\n", (int)state.embd.size());
    for (int i = 0; i < (int)state.embd.size(); i += state.params.n_batch) {
        int n_eval = (int)state.embd.size() - i;
        if (n_eval > state.params.n_batch) {
            n_eval = state.params.n_batch;
        }
        if (llama_decode(state.ctx, llama_batch_get_one(&state.embd[i], n_eval))) {
            trace("failed to eval\n");
            return 1;
        }
        state.n_past += n_eval;
//      trace("context.n_past: %d params.n_batch: %d n_eval: %d\n",
//            (int)state.n_past, (int)state.params.n_batch, n_eval);
        if (state.n_consumed <= state.embd_inp.size()) { // still processing input
            if (state.progress < 1.0) {
                double n = (state.n_consumed  - state.at_readline.embd_inp_size);
                double d = (state.embd_inp.size() - state.at_readline.embd_inp_size);
                state.progress = n / d;
                trace("progress: %.6f\n", state.progress);
                if (llama.progress) { llama.progress(state.progress); }
            }
        }
//      trace("n_past = %d\n", state.n_past);
        // Display total tokens alongside total time
        if (state.params.n_print > 0 && state.n_past % state.params.n_print == 0) {
            trace("Tokens consumed so far = %d / %d\n", state.n_past, state.n_ctx);
        }
//      trace("Tokens consumed so far = %d / %d\n", state.n_past, state.n_ctx);
    }
    return 0;
}

static bool infinite_text_generation_via_context_shifting(struct state &state) {
    // if we run out of context:
    // - take the n_keep first tokens from the original prompt (via n_past)
    // - take half of the last (n_ctx - n_keep) tokens and recompute the logits in batches
    if (!state.params.ctx_shift){
        trace("context full and context shift is disabled => stopping\n");
        return true;
    }
    if (state.params.n_predict == -2) {
        trace("context full and n_predict == -%d => stopping\n",
              state.params.n_predict);
        return true;
    }
    const int n_left    = state.n_past - state.params.n_keep;
    const int n_discard = n_left / 2;
    trace("context full, swapping: n_past = %d, n_left = %d, n_ctx = %d, "
          "n_keep = %d, n_discard = %d\n",
          state.n_past, n_left, state.n_ctx, state.params.n_keep, n_discard);
    llama_kv_cache_seq_rm (state.ctx, 0, state.params.n_keep, state.params.n_keep + n_discard);
    llama_kv_cache_seq_add(state.ctx, 0, state.params.n_keep + n_discard, state.n_past, -n_discard);
    state.n_past -= n_discard;
    trace("after swap: n_past = %d\n", state.n_past);
    trace("embd: %s\n", string_from(state.ctx, state.embd).c_str());
    return false;
}

static void context_extension_via_self_extend(struct state &state, int &ga_i) {
    const int ga_n = state.params.grp_attn_n;
    const int ga_w = state.params.grp_attn_w;
    while (state.n_past >= ga_i + ga_w) {
        const int ib = (ga_n * ga_i) / ga_w;
        const int bd = (ga_w / ga_n) * (ga_n - 1);
        const int dd = (ga_w / ga_n) - ib*bd - ga_w;
        trace("shift: [%6d, %6d] + %6d -> [%6d, %6d]\n",
                ga_i, state.n_past, ib*bd, ga_i + ib*bd, state.n_past + ib * bd);
        trace("div:   [%6d, %6d] / %6d -> [%6d, %6d]\n",
                ga_i + ib*bd, ga_i + ib*bd + ga_w, ga_n,
                (ga_i + ib*bd)/ga_n, (ga_i + ib*bd + ga_w)/ga_n);
        trace("shift: [%6d, %6d] + %6d -> [%6d, %6d]\n",
                ga_i + ib*bd + ga_w, state.n_past + ib*bd, dd,
                ga_i + ib*bd + ga_w + dd, state.n_past + ib*bd + dd);
        llama_kv_cache_seq_add(state.ctx, 0, ga_i, state.n_past, ib * bd);
        llama_kv_cache_seq_div(state.ctx, 0, ga_i + ib*bd, ga_i + ib * bd + ga_w, ga_n);
        llama_kv_cache_seq_add(state.ctx, 0, ga_i + ib*bd + ga_w, state.n_past + ib * bd, dd);
        state.n_past -= bd;
        ga_i += ga_w / ga_n;
        trace("n_past_old = %d, n_past = %d, ga_i = %d\n\n",
              state.n_past + bd, state.n_past, ga_i);
    }
}

static int chat(struct state &state, const char* session_id, bool existing) {
    clear(state);
    assert(!state.params.prompt_cache_ro); // not read only cache
//  params.interactive_first     = false; // it will be modified later...
    // https://github.com/ggml-org/llama.cpp/issues/1790
    // https://github.com/ggml-org/llama.cpp/issues/1647
    llama_kv_cache_clear(state.ctx);
    state.n_ctx = llama_n_ctx(state.ctx);
    state.n_ctx_train = llama_model_n_ctx_train(state.model);
    if (state.n_ctx > state.n_ctx_train) {
        trace("model was trained on only %d context tokens (%d specified)\n",
               state.n_ctx_train, state.n_ctx);
    }
    state.has_chat_template = state.chat_templates.has_explicit_template &&
                              state.chat_templates.template_default;
    if (state.params.conversation_mode == COMMON_CONVERSATION_MODE_AUTO) {
        if (state.has_chat_template) {
            state.params.conversation_mode = COMMON_CONVERSATION_MODE_ENABLED;
        } else {
            state.params.conversation_mode = COMMON_CONVERSATION_MODE_DISABLED;
        }
    }
    std::string path_session = prompt_cache_filename(session_id);
    std::vector<llama_token> &session_tokens = state.session_tokens;
    assert(!path_session.empty());
    if (load_session(state, path_session) != 0) { return 1; }
    const bool add_bos = llama_vocab_get_add_bos(state.vocab);
    if (!llama_model_has_encoder(state.model)) {
        GGML_ASSERT(!llama_vocab_get_add_eos(state.vocab));
    }
    LOG_DBG("n_ctx: %d, add_bos: %d\n", state.n_ctx, add_bos);
    tokenize_prompt(state);
    // Should not run without any tokens
    if (state.embd_inp.empty()) {
        if (add_bos) {
            state.embd_inp.push_back(llama_vocab_bos(state.vocab));
            trace("embd_inp was considered empty and bos was added: %s\n",
                  string_from(state.ctx, state.embd_inp).c_str());
        } else {
            trace("input is empty\n");
            return -1;
        }
    }
    if ((int)state.embd_inp.size() > state.n_ctx - 4) {
        trace("prompt is too long (%d tokens, max %d)\n",
              (int)state.embd_inp.size(), state.n_ctx - 4);
        return 1;
    }
    // debug message about similarity of saved session, if applicable
    size_t n_matching_session_tokens = 0;
    if (!session_tokens.empty()) {
        for (llama_token id : session_tokens) {
            if (n_matching_session_tokens >= state.embd_inp.size() ||
                id != state.embd_inp[n_matching_session_tokens]) {
                break;
            }
            n_matching_session_tokens++;
        }
        dump_session_match(state, n_matching_session_tokens);
        assert(n_matching_session_tokens == state.embd_inp.size());

        // Strange... XXX if we `inherited` any kv seq it is definitely not
        // n_matching_session_tokens size, right?

        // remove any "future" tokens that we might have inherited from
        // the previous session
        trace("remove any `future` tokens that we might have inherited\n");
        llama_kv_cache_seq_rm(state.ctx, -1, n_matching_session_tokens, -1);
    }
    trace("recalculate the cached logits (check): embd_inp.size() %u, "
            "n_matching_session_tokens %u, embd_inp.size() %u, "
            "session_tokens.size() %u\n",
         (int)state.embd_inp.size(), n_matching_session_tokens,
         (int)state.embd_inp.size(), (int)session_tokens.size());
    // if we will use the cache for the full prompt without reaching
    // the end of the cache, force reevaluation of the last token to
    // recalculate the cached logits
    if (!state.embd_inp.empty() &&
        n_matching_session_tokens == state.embd_inp.size() &&
        session_tokens.size() > state.embd_inp.size()) {
        trace("recalculate the cached logits session_tokens.resize(%d)\n",
            (int)state.embd_inp.size() - 1);
        session_tokens.resize(state.embd_inp.size() - 1);
    }
    // number of tokens to keep when resetting context
    if (state.params.n_keep < 0 ||
        state.params.n_keep > (int) state.embd_inp.size()) {
        state.params.n_keep = (int)state.embd_inp.size();
    } else {
        state.params.n_keep += add_bos; // always keep the BOS token
    }
    if (state.params.conversation_mode) {
        state.params.interactive_first = true;
    }
    // enable interactive mode if interactive start is specified
    if (state.params.interactive_first) {
        state.params.interactive = true;
    }
    dump_prompt(state);
    dump_interactive_info(state);
    state.smpl = common_sampler_init(state.model, state.params.sampling);
    if (!state.smpl) {
        trace("%s: failed to initialize sampling subsystem\n");
        return 1;
    }
    trace("sampler seed: %u\n",     common_sampler_get_seed(state.smpl));
    trace("sampler params: \n%s\n", state.params.sampling.print().c_str());
    trace("sampler chain: %s\n",    common_sampler_print(state.smpl).c_str());
//  trace("generate: n_ctx = %d, n_batch = %d, n_predict = %d, n_keep = %d\n",
//         n_ctx, params.n_batch, params.n_predict, params.n_keep);
    // group-attention state
    // number of grouped KV tokens so far (used only if params.grp_attn_n > 1)
    int ga_i = 0;
    const int ga_n = state.params.grp_attn_n;
    const int ga_w = state.params.grp_attn_w;
    if (ga_n != 1) {
        trace("self-extend: n_ctx_train = %d, grp_attn_n = %d, grp_attn_w = %d\n",
              state.n_ctx_train, ga_n, ga_w);
        assert(ga_n > 0);         // grp_attn_n must be positive
        assert(ga_w % ga_n == 0); // grp_attn_w must be a multiple of grp_attn_n
        // n_ctx_train must be a multiple of grp_attn_w
        assert(state.n_ctx_train % ga_w == 0);
        // n_ctx must be at least n_ctx_train * grp_attn_n
        assert(state.n_ctx >= state.n_ctx_train * ga_n);
    }
    if (state.params.interactive) {
        state.is_interacting = state.params.interactive_first;
    }
    state.need_to_save_session = !path_session.empty() &&
        n_matching_session_tokens < state.embd_inp.size();
    // for storing current assistant message, used in conversation mode
    // the first thing we will do is to output the prompt, so set color accordingly
    state.display = state.params.display_prompt;
    // tokenized antiprompts
    std::vector<std::vector<llama_token>> &antiprompt_ids = state.antiprompt_ids;
    antiprompt_ids.reserve(state.params.antiprompt.size());
    for (const std::string & antiprompt : state.params.antiprompt) {
        antiprompt_ids.emplace_back(::common_tokenize(state.ctx,
                                    antiprompt, false, true));
    }
    if (llama_model_has_encoder(state.model)) {
        assert(false); // NO ENCODER SUPPORT YET
        int enc_input_size = state.embd_inp.size();
        llama_token * enc_input_buf = state.embd_inp.data();
        if (llama_encode(state.ctx, llama_batch_get_one(enc_input_buf, enc_input_size))) {
            LOG_ERR("%s : failed to eval\n", __func__);
            return 1;
        }
        llama_token decoder_start_token_id = llama_model_decoder_start_token(state.model);
        if (decoder_start_token_id == LLAMA_TOKEN_NULL) {
            decoder_start_token_id = llama_vocab_bos(state.vocab);
        }
        state.embd_inp.clear();
        state.embd_inp.push_back(decoder_start_token_id);
    }
    trace("context.n_remain: %d\n", (int)state.n_remain);
    while ((state.n_remain != 0 && !state.is_antiprompt) || state.params.interactive) {
        // predict
        if (!state.embd.empty()) {
            // Note: (n_ctx - 4) here is to match the logic for commandline prompt handling via
            // --prompt or --file which uses the same value.
            int max_embd_size = state.n_ctx - 4;
            // Ensure the input doesn't exceed the context size by truncating embd if necessary.
            if ((int) state.embd.size() > max_embd_size) {
                const int skipped_tokens = (int) state.embd.size() - max_embd_size;
                state.embd.resize(max_embd_size);
                trace("<<input too long: skipped %d token%s>>", skipped_tokens,
                      skipped_tokens != 1 ? "s" : "");
            }
            if (ga_n == 1) {
                if (state.n_past + (int) state.embd.size() >= state.n_ctx) {
                    if (infinite_text_generation_via_context_shifting(state)) {
                        break; // context full and shift is disabled => stop
                    }
                    trace("clear session path\n");
                    path_session.clear();
                }
            } else {
                context_extension_via_self_extend(state, ga_i);
            }
            // try to reuse a matching prefix from the loaded session instead
            // of re-eval (via n_past):
//          trace("try to reuse a matching prefix from the loaded session instead of re-eval (via n_past)\n");
//          trace("n_session_consumed: %d session_tokens.size(): %d\n",
//                context.n_session_consumed, (int)session_tokens.size());
            if (state.n_session_consumed < (int) session_tokens.size()) {
                size_t i = 0;
                for ( ; i < state.embd.size(); i++) {
                    if (state.embd[i] != session_tokens[state.n_session_consumed]) {
//                      LOG_INF("context.n_session_consumed: %d\n", context.n_session_consumed);
                        session_tokens.resize(state.n_session_consumed);
                        break;
                    }
                    state.n_past++;
                    state.n_session_consumed++;
                    if (state.n_session_consumed >= (int) session_tokens.size()) {
                        ++i;
                        break;
                    }
                }
                if (i > 0) {
                    trace("embd.erase(%d)\n", (int)i);
                    state.embd.erase(state.embd.begin(), state.embd.begin() + i);
                }
            }
            if (decode(state) != 0) { return 1; }
            if (!state.embd.empty() && !path_session.empty()) {
                session_tokens.insert(session_tokens.end(), state.embd.begin(), state.embd.end());
                state.n_session_consumed = session_tokens.size();
            }
//          trace("embd.size(): %d\n", (int) state.embd.size());
        }
        state.embd.clear();
//      trace("embd.clear()\n");
        if ((int)state.embd_inp.size() <= state.n_consumed && !state.is_interacting) {
            // optionally save the session on first sample (for faster prompt loading next time)
            if (!path_session.empty() && state.need_to_save_session && !state.params.prompt_cache_ro) {
                state.need_to_save_session = false;
//              trace("saving %d tokens to '%s'\n", (int)session_tokens.size(), path_session.c_str());
                llama_state_save_file(state.ctx, path_session.c_str(),
                    session_tokens.data(), session_tokens.size());
//              trace("saved session to %s\n", path_session.c_str());
            }
            const llama_token id = common_sampler_sample(state.smpl, state.ctx, -1);
            common_sampler_accept(state.smpl, id, /* accept_grammar= */ true);
            // LOG_DBG("last: %s\n", string_from(ctx, smpl->prev.to_vector()).c_str());
            state.embd.push_back(id);
            // echo this to console
            state.input_echo = true;
            // decrement remaining sampling budget
            --state.n_remain;
            LOG_DBG("n_remain: %d\n", state.n_remain);
        } else {
            // some user input remains from prompt or interaction, forward it to processing
            LOG_DBG("embd_inp.size(): %d, n_consumed: %d\n", (int) state.embd_inp.size(), state.n_consumed);
            while ((int) state.embd_inp.size() > state.n_consumed) {
                state.embd.push_back(state.embd_inp[state.n_consumed]);
                // push the prompt in the sampling context in order to apply repetition penalties later
                // for the prompt, we don't apply grammar rules
                common_sampler_accept(state.smpl, state.embd_inp[state.n_consumed], /* accept_grammar= */ false);
                ++state.n_consumed;
/* XXX: This is WRONG!
                if ((int) embd.size() >= params.n_batch) {
                    break;
                }
*/
            }
        }
        bool interrupted = false;
        if (state.input_echo && state.display) {
            for (auto id : state.embd) {
                const std::string token_str = common_token_to_piece(state.ctx, id, state.params.special);
//              LOG_INF("token_str.c_str(): %s\n", token_str.c_str());
                if (!llama.output_text(token_str.c_str())) {
                    interrupted  = true;
                    break;
                }
                // Record Displayed Tokens To Log
                // Note: Generated tokens are created one by one hence this check
                if (state.embd.size() > 1) {
                    // Incoming Requested Tokens
                    state.input_tokens.push_back(id);
                } else {
                    // Outgoing Generated Tokens
                    state.output_tokens.push_back(id);
//                  output_ss << token_str;
                }
            }
        }
        // reset color to default if there is no pending user input
        if (state.input_echo && (int) state.embd_inp.size() == state.n_consumed) {
            state.display = true;
        }
        // if not currently processing queued inputs;
        if ((int)state.embd_inp.size() <= state.n_consumed) {
            // check for reverse prompt in the last n_prev tokens
            if (!state.params.antiprompt.empty()) {
                const int n_prev = 32;
                const std::string last_output = common_sampler_prev_str(state.smpl, state.ctx, n_prev);
                state.is_antiprompt = false;
                // Check if each of the reverse prompts appears at the end of the output.
                // If we're not running interactively, the reverse prompt might be tokenized with some following characters
                // so we'll compensate for that by widening the search window a bit.
                for (std::string & antiprompt : state.params.antiprompt) {
                    size_t extra_padding = state.params.interactive ? 0 : 2;
                    size_t search_start_pos = last_output.length() > static_cast<size_t>(antiprompt.length() + extra_padding)
                        ? last_output.length() - static_cast<size_t>(antiprompt.length() + extra_padding)
                        : 0;
                    if (last_output.find(antiprompt, search_start_pos) != std::string::npos) {
                        if (state.params.interactive) {
                            state.is_interacting = true;
                            trace("context.is_interacting = true;\n");
                        }
                        state.is_antiprompt = true;
                        break;
                    }
                }
                // check for reverse prompt using special tokens
                llama_token last_token = common_sampler_last(state.smpl);
                for (std::vector<llama_token> ids : antiprompt_ids) {
                    if (ids.size() == 1 && last_token == ids[0]) {
                        if (state.params.interactive) {
                            state.is_interacting = true;
                            trace("context.is_interacting = true;\n");
                        }
                        state.is_antiprompt = true;
                        break;
                    }
                }
                if (state.is_antiprompt) {
                    LOG_DBG("found antiprompt: %s\n", last_output.c_str());
                }
            }
            // XXX ignore EOG inside loaded broken sessions
            bool eog = llama_vocab_is_eog(state.vocab, common_sampler_last(state.smpl));
            bool is_eog = state.n_session_consumed == (int)state.session_tokens.size() ?
                eog : false;
            if (eog && !is_eog) {
                trace("IGNORE: found an EOG token inside loaded session\n");
            }
            // deal with end of generation tokens in interactive mode
            if (is_eog) {
                LOG_DBG("found an EOG token\n");
                trace("found an EOG token embd.size(): %d\n", (int)state.embd.size());
                if (state.params.interactive) {
                    if (!state.params.antiprompt.empty()) {
                        // tokenize and inject first reverse prompt
                        const auto first_antiprompt = common_tokenize(state.ctx, state.params.antiprompt.front(), false, true);
                        state.embd_inp.insert(state.embd_inp.end(), first_antiprompt.begin(), first_antiprompt.end());
                        state.is_antiprompt = true;
                    }
                    if (state.params.enable_chat_template) {
                        add_and_format(state, "assistant", state.assistant_ss.str());
                    }
                    trace("<--done--> llama_vocab_is_eog()\n");
                    state.is_interacting = true;
                    trace("context.is_interacting = true;\n");
                    llama.output_text("<--done-->");
                    assert(state.embd.size() <= 1); // and it is EOG
                    state.embd.clear();
                    if (!path_session.empty()) {
                        trace("saving %d tokens to '%s'\n",
                               (int)session_tokens.size(), path_session.c_str());
                        llama_state_save_file(state.ctx, path_session.c_str(),
                                              session_tokens.data(), session_tokens.size());
                    }
                    LOG("\n");
                }
            }
            // if current token is not EOG, we add it to current assistant message
            if (state.params.conversation_mode) {
                const auto id = common_sampler_last(state.smpl);
                state.assistant_ss << common_token_to_piece(state.ctx, id, false);
            }
            if (interrupted) {
                trace("<--done--> interrupted\n");
                llama.output_text("<--done-->");
                state.is_interacting = true;
                trace("context.is_interacting = true;\n");
            }
            if (state.n_past > 0 && state.is_interacting) {
                trace("embd.size(): %d context.n_past: %d\n", (int)state.embd.size(), state.n_past);
                trace("waiting for user input\n");
                if (state.params.input_prefix_bos) {
                    LOG_DBG("adding input prefix BOS token\n");
                    state.embd_inp.push_back(llama_vocab_bos(state.vocab));
                }
                std::string buffer;
                if (!state.params.input_prefix.empty() && !state.params.conversation_mode) {
                    LOG_DBG("appending input prefix: '%s'\n", state.params.input_prefix.c_str());
                    LOG("%s", state.params.input_prefix.c_str());
                }
                state.display = state.params.display_prompt;
                assert(state.embd.size() <= 1); // and it is EOG
                state.embd.clear();
                const char* line = llama.read_line();
                if (!line) {
//                  trace("<--done--> line == null\n");
                    state.is_interacting = true;
                    trace("context.is_interacting = true;\n");
                    llama.output_text("<--done-->");
//                  trace("<--done--> because line == null\n");
//                  trace("ENDS RUNNING THE MODEL\n");
                    break; // ENDS RUNNING THE MODEL
                }
                buffer += line;
                free((void*)line);
//              trace("%s buff: %s\n", __func__, buffer.c_str());
                if (buffer == "<--end-->") {
                    state.is_interacting = true;
                    trace("context.is_interacting = true;\n");
                    llama.output_text("<--done-->");
//                  trace("<--done--> because line == <--end-->\n");
//                  trace("ENDS RUNNING THE MODEL\n");
                    break; // ENDS RUNNING THE MODEL
                } else if (buffer == "<--otr-->") { // off the record
                    buffer = "";
                    restore_at_readline(state);
                    llama.output_text("<--done-->");
                    trace("<--done--> because line == <--otr-->\n");
                    state.is_interacting = true;
                    trace("context.is_interacting = true;\n");
                    trace("embd.size(): %d\n", (int)state.embd.size());
                    trace("embd_inp.size(): %d\n", (int)state.embd_inp.size());
                }
                state.display = true;
                // Add tokens to embd only if the input buffer is non-empty
                // Entering a empty line lets the user pass control back
                if (buffer.length() > 1) {
                    // append input suffix if any
                    if (!state.params.input_suffix.empty() &&
                        !state.params.conversation_mode) {
                        LOG_DBG("appending input suffix: '%s'\n", state.params.input_suffix.c_str());
                        LOG("%s", state.params.input_suffix.c_str());
                    }
                    LOG_DBG("buffer: '%s'\n", buffer.c_str());
                    save_at_readline(state);
                    state.progress = 0;
//                  trace("at_readline.embd_inp_size: %d\n", (int)context.at_readline.embd_inp_size);
                    if (state.params.escape) {
                        string_process_escapes(buffer);
                    }
                    bool format_chat = state.params.conversation_mode &&
                                       state.params.enable_chat_template;
                    std::string user_inp = format_chat
                        ? add_and_format(state, "user", std::move(buffer))
                        : std::move(buffer);
                    // user_inp: something like:
                    // "\n<|start_of_role|>user<|end_of_role|>buffer<|end_of_text|>\n
                    //    <|start_of_role|>assistant<|end_of_role|>\n"
                    // TODO: one inconvenient of current chat template
                    // implementation is that we can't distinguish between
                    // user input and special tokens (prefix/postfix)
                    const auto line_pfx = common_tokenize(state.ctx, state.params.input_prefix, false, true);
                    const auto line_inp = common_tokenize(state.ctx, user_inp,            false, format_chat);
                    const auto line_sfx = common_tokenize(state.ctx, state.params.input_suffix, false, true);
                    LOG_DBG("input tokens: %s\n", string_from(state.ctx, line_inp).c_str());
                    // if user stop generation mid-way, we must add EOT to finish model's last response
                    if (state.need_insert_eot && format_chat) {
                        llama_token eot = llama_vocab_eot(state.vocab);
                        state.embd_inp.push_back(eot == LLAMA_TOKEN_NULL ? llama_vocab_eos(state.vocab) : eot);
                        state.need_insert_eot = false;
                    }
                    state.embd_inp.insert(state.embd_inp.end(), line_pfx.begin(), line_pfx.end());
                    state.embd_inp.insert(state.embd_inp.end(), line_inp.begin(), line_inp.end());
                    state.embd_inp.insert(state.embd_inp.end(), line_sfx.begin(), line_sfx.end());
                    for (size_t i = state.at_readline.embd_inp_size; i < state.embd_inp.size(); ++i) {
                        const llama_token token = state.embd_inp[i];
                        state.output_tokens.push_back(token);
                        state.output_ss << common_token_to_piece(state.ctx, token);
                    }
                    // reset assistant message
                    state.assistant_ss.str("");
                    state.n_remain -= line_inp.size();
//                  trace("n_remain: %d embd_inp: %d\n", context.n_remain, (int)embd_inp.size());
                } else {
                    LOG_DBG("empty line, passing control back\n");
                }
                state.input_echo = false; // do not echo this again
            }
            if (state.n_past > 0) {
                if (state.is_interacting) {
                    common_sampler_reset(state.smpl);
                }
                state.is_interacting = false;
//              trace("context.is_interacting = false;\n");
            }
        }
        // end of generation
        if (!state.embd.empty() && llama_vocab_is_eog(state.vocab, state.embd.back()) && !(state.params.interactive)) {
            LOG(" [end of text]\n");
            trace(" [end of text]\n");
            break;
        }
        // In interactive mode, respect the maximum number of tokens and drop back to user input when reached.
        // We skip this logic when n_predict == -1 (infinite) or -2 (stop at context size).
        if (state.params.interactive && state.n_remain <= 0 && state.params.n_predict >= 0) {
            state.n_remain = state.params.n_predict;
            state.is_interacting = true;
            trace("context.is_interacting = true;\n");
            llama.output_text("<--done-->");
            trace("%d: <--done--> context.n_remain <= 0\n", __LINE__);
        }
    }
    if (!path_session.empty()) {
        trace("saving final output %d tokens to '%s'\n",
               (int)session_tokens.size(), path_session.c_str());
        llama_state_save_file(state.ctx, path_session.c_str(),
                              session_tokens.data(), session_tokens.size());
    }
    LOG("\n\n");
    common_perf_print(state.ctx, state.smpl);
    common_sampler_free(state.smpl);
    return 0;
}

static void ggml_free(struct state &state) {
    llama_detach_threadpool(state.ctx);
    llama_backend_free();
    auto * ggml_threadpool_free_fn = (decltype(ggml_threadpool_free) *)
        ggml_backend_reg_get_proc_address(state.ggml_reg, "ggml_threadpool_free");
    ggml_threadpool_free_fn(state.threadpool);
    ggml_threadpool_free_fn(state.threadpool_batch);
}

static struct state *context;

int llama_load(int argc, char* argv[]) {
    context = new struct state();
    if (!context) {
        return 1;
    }
    if (parse_params(*context, argc, argv) != 0) {
        return 1;
    }
    if (load(*context) != 0) {
        return 1;
    }
    if (ggml_init(*context) != 0) {
        return 1;
    }
    return 0;
}

int llama_run(const char* session, bool existing) {
    int r = 0;
    LOG_INF(">>>chat\n");
    try {
        r = chat(*context, session, existing);
    } catch (...) {
        fprintf(stderr, "exception in chat()\n");
        // Oops...
    }
    LOG_INF("<<<chat return: %d\n", r);
    return r;
}

void llama_fini(void) {
    ggml_free(*context);
    delete context;
}

struct llama_if llama = {
    .load = llama_load,
    .run  = llama_run,
    .fini = llama_fini,
    .read_line   = 0,
    .output_text = 0,
    .progress    = 0,
};

// ***********************************************************************

static int chat_legacy(struct state &state, const char* session, bool existing) {
    clear(state);
    llama_context              * &ctx = state.ctx;
    const llama_model          * &model = state.model;
    common_sampler             * &smpl  = state.smpl;
    common_chat_templates        &chat_templates = state.chat_templates;
    std::vector<common_chat_msg> &chat_msgs      = state.chat_msgs;
    std::vector<llama_token>     &embd_inp       = state.embd_inp;
    common_params                &params         = state.params;
    std::vector<int>             &input_tokens   = state.input_tokens;
    std::vector<int>             &output_tokens  = state.output_tokens;
    std::ostringstream           &output_ss      = state.output_ss;
    state.is_antiprompt        = false;
    state.input_echo           = false;
    state.display              = false;
    state.n_past               = 0;
    state.n_remain             = params.n_predict;
    state.n_consumed           = 0;
    state.n_session_consumed   = 0;
    state.params.n_keep        = -1;
//  params.interactive_first     = false; // it will be modified later...
    // https://github.com/ggml-org/llama.cpp/issues/1790
    // https://github.com/ggml-org/llama.cpp/issues/1647
    llama_kv_cache_clear(state.ctx);
    int &n_ctx = state.n_ctx;
    n_ctx = llama_n_ctx(ctx);
    int &n_ctx_train = state.n_ctx_train;
    n_ctx_train = llama_model_n_ctx_train(model);
    if (n_ctx > n_ctx_train) {
        LOG_WRN("%s: model was trained on only %d context tokens (%d specified)\n", __func__, n_ctx_train, n_ctx);
    }
    // auto enable conversation mode if chat template is available
    state.has_chat_template = state.chat_templates.has_explicit_template &&
                                state.chat_templates.template_default;
    if (state.params.conversation_mode == COMMON_CONVERSATION_MODE_AUTO) {
        if (state.has_chat_template) {
            LOG_INF("%s: chat template is available, enabling conversation mode (disable it with -no-cnv)\n", __func__);
            state.params.conversation_mode = COMMON_CONVERSATION_MODE_ENABLED;
        } else {
            state.params.conversation_mode = COMMON_CONVERSATION_MODE_DISABLED;
        }
    }
    // in case user force-activate conversation mode (via -cnv) without proper chat template, we show a warning
    if (state.params.conversation_mode && !state.has_chat_template) {
        LOG_WRN("%s: chat template is not available or is not supported. This may cause the model to output suboptimal responses\n", __func__);
    }
    // print chat template example in conversation mode
    if (state.params.conversation_mode) {
        if (state.params.enable_chat_template) {
            LOG_INF("%s: chat template example:\n%s\n", __func__, common_chat_format_example(*state.chat_templates.template_default,
                                            state.params.use_jinja).c_str());
        } else {
            LOG_INF("%s: in-suffix/prefix is specified, chat template will be disabled\n", __func__);
        }
    }
    // print system information
    {
        LOG_INF("\n");
        LOG_INF("%s\n", common_params_get_system_info(state.params).c_str());
        LOG_INF("\n");
    }
//  trace("n_ctx: %d\n", (int)n_ctx);
    std::string path_session = prompt_cache_filename(session);
    std::vector<llama_token> &session_tokens = state.session_tokens;
    if (!path_session.empty()) {
        LOG_INF("%s: attempting to load saved session from '%s'\n", __func__, path_session.c_str());
        if (!file_exists(path_session)) {
            LOG_INF("%s: session file does not exist, will create.\n", __func__);
        } else if (file_is_empty(path_session)) {
            LOG_INF("%s: The session file is empty. A new session will be initialized.\n", __func__);
        } else {
            // The file exists and is not empty
            session_tokens.resize(n_ctx);
            size_t n_token_count_out = 0;
            if (!llama_state_load_file(ctx, path_session.c_str(),
                                       session_tokens.data(),
                                       session_tokens.capacity(),
                                       &n_token_count_out)) {
                LOG_INF("%s: failed to load session file '%s'\n", __func__,
                        path_session.c_str());
                return 1;
            }
            session_tokens.resize(n_token_count_out);
            trace("%s: loaded a session with prompt size of %d tokens\n",
                   __func__, (int)session_tokens.size());
        }
    }
    const bool add_bos = llama_vocab_get_add_bos(state.vocab);
    if (!llama_model_has_encoder(model)) {
        GGML_ASSERT(!llama_vocab_get_add_eos(state.vocab));
    }
    LOG_DBG("n_ctx: %d, add_bos: %d\n", n_ctx, add_bos);
    auto chat_add_and_format = [&chat_msgs, &chat_templates, &params](const std::string & role, const std::string & content) {
        common_chat_msg new_msg{role, content};
        auto formatted = common_chat_format_single(*chat_templates.template_default,
                                                   chat_msgs, new_msg, role == "user",
                                                   params.use_jinja);
        chat_msgs.push_back({role, content});
        LOG_DBG("formatted: '%s'\n", formatted.c_str());
        return formatted;
    };
    {
        auto prompt = (params.conversation_mode && params.enable_chat_template)
            // format the system prompt in conversation mode (fallback to default if empty)
            ? chat_add_and_format("system", params.prompt.empty() ? DEFAULT_SYSTEM_MESSAGE : params.prompt)
            // otherwise use the prompt as is
            : params.prompt;
/*      THIS IS WRONG:
        if (params.interactive_first || !params.prompt.empty() || session_tokens.empty()) {
            LOG_INF("tokenize the prompt\n");
            embd_inp = common_tokenize(ctx, prompt, true, true);
        } else {
            LOG_INF("use session tokens\n");
            embd_inp = session_tokens;
        }
*/
        if (session_tokens.empty()) { // because params.interactive_first is set to true for next session
            LOG_INF("tokenize the prompt\n");
            embd_inp = common_tokenize(ctx, prompt, true, true);
        } else {
            LOG_INF("use session tokens\n");
            embd_inp = session_tokens;
        }
        LOG_DBG("prompt: \"%s\"\n", prompt.c_str());
        LOG_DBG("tokens: %s\n", string_from(ctx, embd_inp).c_str());
    }
    // Should not run without any tokens
    if (embd_inp.empty()) {
        if (add_bos) {
            embd_inp.push_back(llama_vocab_bos(state.vocab));
            LOG_WRN("embd_inp was considered empty and bos was added: %s\n", string_from(ctx, embd_inp).c_str());
        } else {
            LOG_ERR("input is empty\n");
            return -1;
        }
    }
    // Tokenize negative prompt
    if ((int) embd_inp.size() > n_ctx - 4) {
        LOG_ERR("%s: prompt is too long (%d tokens, max %d)\n", __func__, (int) embd_inp.size(), n_ctx - 4);
        return 1;
    }
    // debug message about similarity of saved session, if applicable
    size_t n_matching_session_tokens = 0;
    if (!session_tokens.empty()) {
        for (llama_token id : session_tokens) {
            if (n_matching_session_tokens >= embd_inp.size() || id != embd_inp[n_matching_session_tokens]) {
                break;
            }
            n_matching_session_tokens++;
        }
        if (params.prompt.empty() && n_matching_session_tokens == embd_inp.size()) {
            trace("using full prompt from session file\n");
        } else if (n_matching_session_tokens >= embd_inp.size()) {
            trace("session file has exact match for prompt\n");
        } else if (n_matching_session_tokens < (embd_inp.size() / 2)) {
            trace("session file has low similarity to prompt (%zu / %zu tokens); will mostly be reevaluated\n",
                   n_matching_session_tokens, embd_inp.size());
        } else {
            trace("session file matches %zu / %zu tokens of prompt\n",
                    n_matching_session_tokens, embd_inp.size());
        }
        // remove any "future" tokens that we might have inherited from the previous session
        llama_kv_cache_seq_rm(ctx, -1, n_matching_session_tokens, -1);
    }
    LOG_DBG("recalculate the cached logits (check): embd_inp.size() %zu, n_matching_session_tokens %zu, embd_inp.size() %zu, session_tokens.size() %zu\n",
         embd_inp.size(), n_matching_session_tokens, embd_inp.size(), session_tokens.size());
    // if we will use the cache for the full prompt without reaching the end of the cache, force
    // reevaluation of the last token to recalculate the cached logits
    if (!embd_inp.empty() && n_matching_session_tokens == embd_inp.size() && session_tokens.size() > embd_inp.size()) {
        LOG_DBG("recalculate the cached logits (do): session_tokens.resize( %zu )\n", embd_inp.size() - 1);

        session_tokens.resize(embd_inp.size() - 1);
    }
    // number of tokens to keep when resetting context
    if (params.n_keep < 0 || params.n_keep > (int) embd_inp.size()) {
        params.n_keep = (int)embd_inp.size();
    } else {
        params.n_keep += add_bos; // always keep the BOS token
    }
    if (params.conversation_mode) {
        params.interactive_first = true;
    }
    // enable interactive mode if interactive start is specified
    if (params.interactive_first) {
        params.interactive = true;
    }
    if (params.verbose_prompt) {
        LOG_INF("%s: prompt: '%s'\n", __func__, params.prompt.c_str());
        LOG_INF("%s: number of tokens in prompt = %zu\n", __func__, embd_inp.size());
        for (int i = 0; i < (int) embd_inp.size(); i++) {
            LOG_INF("%6d -> '%s'\n", embd_inp[i], common_token_to_piece(ctx, embd_inp[i]).c_str());
        }
        if (params.n_keep > add_bos) {
            LOG_INF("%s: static prompt based on n_keep: '", __func__);
            for (int i = 0; i < params.n_keep; i++) {
                LOG_CNT("%s", common_token_to_piece(ctx, embd_inp[i]).c_str());
            }
            LOG_CNT("'\n");
        }
        LOG_INF("\n");
    }
    if (params.interactive) {
        LOG_INF("%s: interactive mode on.\n", __func__);
        if (!params.antiprompt.empty()) {
            for (const auto & antiprompt : params.antiprompt) {
                LOG_INF("Reverse prompt: '%s'\n", antiprompt.c_str());
                if (params.verbose_prompt) {
                    auto tmp = common_tokenize(ctx, antiprompt, false, true);
                    for (int i = 0; i < (int) tmp.size(); i++) {
                        LOG_INF("%6d -> '%s'\n", tmp[i], common_token_to_piece(ctx, tmp[i]).c_str());
                    }
                }
            }
        }
        if (params.input_prefix_bos) {
            LOG_INF("Input prefix with BOS\n");
        }
        if (!params.input_prefix.empty()) {
            LOG_INF("Input prefix: '%s'\n", params.input_prefix.c_str());
            if (params.verbose_prompt) {
                auto tmp = common_tokenize(ctx, params.input_prefix, true, true);
                for (int i = 0; i < (int) tmp.size(); i++) {
                    LOG_INF("%6d -> '%s'\n", tmp[i], common_token_to_piece(ctx, tmp[i]).c_str());
                }
            }
        }
        if (!params.input_suffix.empty()) {
            LOG_INF("Input suffix: '%s'\n", params.input_suffix.c_str());
            if (params.verbose_prompt) {
                auto tmp = common_tokenize(ctx, params.input_suffix, false, true);
                for (int i = 0; i < (int) tmp.size(); i++) {
                    LOG_INF("%6d -> '%s'\n", tmp[i], common_token_to_piece(ctx, tmp[i]).c_str());
                }
            }
        }
    }
    auto & sparams = params.sampling;
    smpl = common_sampler_init(model, sparams);
    if (!smpl) {
        LOG_ERR("%s: failed to initialize sampling subsystem\n", __func__);
        return 1;
    }
    LOG_INF("sampler seed: %u\n",     common_sampler_get_seed(smpl));
    LOG_INF("sampler params: \n%s\n", sparams.print().c_str());
    LOG_INF("sampler chain: %s\n",    common_sampler_print(smpl).c_str());
//  trace("generate: n_ctx = %d, n_batch = %d, n_predict = %d, n_keep = %d\n",
//         n_ctx, params.n_batch, params.n_predict, params.n_keep);
    // group-attention state
    // number of grouped KV tokens so far (used only if params.grp_attn_n > 1)
    int ga_i = 0;
    const int ga_n = params.grp_attn_n;
    const int ga_w = params.grp_attn_w;
    if (ga_n != 1) {
        GGML_ASSERT(ga_n > 0                    && "grp_attn_n must be positive");                     // NOLINT
        GGML_ASSERT(ga_w % ga_n == 0            && "grp_attn_w must be a multiple of grp_attn_n");     // NOLINT
      //GGML_ASSERT(n_ctx_train % ga_w == 0     && "n_ctx_train must be a multiple of grp_attn_w");    // NOLINT
      //GGML_ASSERT(n_ctx >= n_ctx_train * ga_n && "n_ctx must be at least n_ctx_train * grp_attn_n"); // NOLINT
        LOG_INF("self-extend: n_ctx_train = %d, grp_attn_n = %d, grp_attn_w = %d\n", n_ctx_train, ga_n, ga_w);
    }
    LOG_INF("\n");
    if (params.interactive) {
        state.is_interacting = params.interactive_first;
    }
    state.need_to_save_session = !path_session.empty() && n_matching_session_tokens < embd_inp.size();
    // for storing current assistant message, used in conversation mode
    std::ostringstream &assistant_ss  = state.assistant_ss;
    // the first thing we will do is to output the prompt, so set color accordingly
    console::set_display(console::prompt);
    state.display = params.display_prompt;
    std::vector<llama_token> &embd = state.embd;
    // tokenized antiprompts
    std::vector<std::vector<llama_token>> &antiprompt_ids = state.antiprompt_ids;
    antiprompt_ids.reserve(params.antiprompt.size());
    for (const std::string & antiprompt : params.antiprompt) {
        antiprompt_ids.emplace_back(::common_tokenize(ctx, antiprompt, false, true));
    }
    if (llama_model_has_encoder(model)) {
        int enc_input_size = embd_inp.size();
        llama_token * enc_input_buf = embd_inp.data();
        if (llama_encode(ctx, llama_batch_get_one(enc_input_buf, enc_input_size))) {
            LOG_ERR("%s : failed to eval\n", __func__);
            return 1;
        }
        llama_token decoder_start_token_id = llama_model_decoder_start_token(model);
        if (decoder_start_token_id == LLAMA_TOKEN_NULL) {
            decoder_start_token_id = llama_vocab_bos(state.vocab);
        }
        embd_inp.clear();
        embd_inp.push_back(decoder_start_token_id);
    }
    trace("context.n_remain: %d\n", (int)state.n_remain);
    while ((state.n_remain != 0 && !state.is_antiprompt) || params.interactive) {
        // predict
        if (!embd.empty()) {
            // Note: (n_ctx - 4) here is to match the logic for commandline prompt handling via
            // --prompt or --file which uses the same value.
            int max_embd_size = n_ctx - 4;
            // Ensure the input doesn't exceed the context size by truncating embd if necessary.
            if ((int) embd.size() > max_embd_size) {
                const int skipped_tokens = (int) embd.size() - max_embd_size;
                embd.resize(max_embd_size);
                console::set_display(console::error);
                LOG_WRN("<<input too long: skipped %d token%s>>", skipped_tokens, skipped_tokens != 1 ? "s" : "");
                console::set_display(console::reset);
            }
            if (ga_n == 1) {
                // infinite text generation via context shifting
                // if we run out of context:
                // - take the n_keep first tokens from the original prompt (via n_past)
                // - take half of the last (n_ctx - n_keep) tokens and recompute the logits in batches
                if (state.n_past + (int) embd.size() >= n_ctx) {
                    if (!params.ctx_shift){
                        LOG_DBG("\n\n%s: context full and context shift is disabled => stopping\n", __func__);
                        break;
                    }
                    if (params.n_predict == -2) {
                        LOG_DBG("\n\n%s: context full and n_predict == -%d => stopping\n", __func__, params.n_predict);
                        break;
                    }
                    const int n_left    = state.n_past - params.n_keep;
                    const int n_discard = n_left / 2;
                    LOG_DBG("context full, swapping: n_past = %d, n_left = %d, n_ctx = %d, n_keep = %d, n_discard = %d\n",
                            state.n_past, n_left, n_ctx, params.n_keep, n_discard);
                    llama_kv_cache_seq_rm (ctx, 0, params.n_keep            , params.n_keep + n_discard);
                    llama_kv_cache_seq_add(ctx, 0, params.n_keep + n_discard, state.n_past, -n_discard);
                    state.n_past -= n_discard;
                    LOG_DBG("after swap: n_past = %d\n", state.n_past);
                    LOG_DBG("embd: %s\n", string_from(ctx, embd).c_str());
                    LOG_DBG("clear session path\n");
                    path_session.clear();
                }
            } else {
                // context extension via Self-Extend
                while (state.n_past >= ga_i + ga_w) {
                    const int ib = (ga_n * ga_i) / ga_w;
                    const int bd = (ga_w / ga_n) * (ga_n - 1);
                    const int dd = (ga_w / ga_n) - ib*bd - ga_w;
                    LOG_DBG("\n");
                    LOG_DBG("shift: [%6d, %6d] + %6d -> [%6d, %6d]\n", ga_i, state.n_past, ib*bd, ga_i + ib*bd, state.n_past + ib*bd);
                    LOG_DBG("div:   [%6d, %6d] / %6d -> [%6d, %6d]\n", ga_i + ib*bd, ga_i + ib*bd + ga_w, ga_n, (ga_i + ib*bd)/ga_n, (ga_i + ib*bd + ga_w)/ga_n);
                    LOG_DBG("shift: [%6d, %6d] + %6d -> [%6d, %6d]\n", ga_i + ib*bd + ga_w, state.n_past + ib*bd, dd, ga_i + ib*bd + ga_w + dd, state.n_past + ib*bd + dd);
                    llama_kv_cache_seq_add(ctx, 0, ga_i,                state.n_past,              ib*bd);
                    llama_kv_cache_seq_div(ctx, 0, ga_i + ib*bd,        ga_i + ib*bd + ga_w, ga_n);
                    llama_kv_cache_seq_add(ctx, 0, ga_i + ib*bd + ga_w, state.n_past + ib*bd,      dd);
                    state.n_past -= bd;
                    ga_i += ga_w / ga_n;
                    LOG_DBG("\nn_past_old = %d, n_past = %d, ga_i = %d\n\n", state.n_past + bd, state.n_past, ga_i);
                }
            }
            // try to reuse a matching prefix from the loaded session instead of re-eval (via n_past)
//          trace("try to reuse a matching prefix from the loaded session instead of re-eval (via n_past)\n");
//          trace("n_session_consumed: %d session_tokens.size(): %d\n", context.n_session_consumed, (int)session_tokens.size());
            if (state.n_session_consumed < (int) session_tokens.size()) {
                size_t i = 0;
                for ( ; i < embd.size(); i++) {
                    if (embd[i] != session_tokens[state.n_session_consumed]) {
//                      LOG_INF("context.n_session_consumed: %d\n", context.n_session_consumed);
                        session_tokens.resize(state.n_session_consumed);
                        break;
                    }
                    state.n_past++;
                    state.n_session_consumed++;
                    if (state.n_session_consumed >= (int) session_tokens.size()) {
                        ++i;
                        break;
                    }
                }
                if (i > 0) {
                    trace("embd.erase(%d)\n", (int)i);
                    embd.erase(embd.begin(), embd.begin() + i);
                }
            }
            trace("embd.size(): %d\n", (int) embd.size());
            for (int i = 0; i < (int)embd.size(); i += params.n_batch) {
                int n_eval = (int)embd.size() - i;
                if (n_eval > params.n_batch) {
                    n_eval = params.n_batch;
                }
                if (llama_decode(ctx, llama_batch_get_one(&embd[i], n_eval))) {
                    LOG_ERR("%s : failed to eval\n", __func__);
                    return 1;
                }
                state.n_past += n_eval;
                trace("context.n_past: %d params.n_batch: %d n_eval: %d\n",
                    (int)state.n_past, (int)params.n_batch, n_eval);
                if (state.n_consumed <= embd_inp.size()) { // still processing input
                    if (state.progress < 1.0) {
                        double n = (state.n_consumed  - state.at_readline.embd_inp_size);
                        double d = (embd_inp.size()     - state.at_readline.embd_inp_size);
                        state.progress = n / d;
                        trace("progress: %.6f\n", state.progress);
                        if (llama.progress) { llama.progress(state.progress); }
                    }
                }
//              trace("%s:%d n_past = %d\n", __func__, __LINE__, context.n_past);
                // Display total tokens alongside total time
                if (params.n_print > 0 && state.n_past % params.n_print == 0) {
                    LOG_DBG("\n%s:%d Tokens consumed so far = %d / %d\n",
                            __func__, __LINE__, state.n_past, n_ctx);
                }
//              trace("\n%s:%d Tokens consumed so far = %d / %d\n",
//                      __func__, __LINE__, context.n_past, n_ctx);
            }
            if (!embd.empty() && !path_session.empty()) {
                session_tokens.insert(session_tokens.end(), embd.begin(), embd.end());
                state.n_session_consumed = session_tokens.size();
            }
            trace("embd.size(): %d\n", (int) embd.size());
        }
        embd.clear();
        if ((int) embd_inp.size() <= state.n_consumed && !state.is_interacting) {
            // optionally save the session on first sample (for faster prompt loading next time)
            if (!path_session.empty() && state.need_to_save_session && !params.prompt_cache_ro) {
                state.need_to_save_session = false;
//              trace("saving %d tokens to '%s'\n", (int)session_tokens.size(), path_session.c_str());
                llama_state_save_file(ctx, path_session.c_str(), session_tokens.data(), session_tokens.size());
//              trace("saved session to %s\n", path_session.c_str());
            }
            const llama_token id = common_sampler_sample(smpl, ctx, -1);
            common_sampler_accept(smpl, id, /* accept_grammar= */ true);
            // LOG_DBG("last: %s\n", string_from(ctx, smpl->prev.to_vector()).c_str());
            embd.push_back(id);
            // echo this to console
            state.input_echo = true;
            // decrement remaining sampling budget
            --state.n_remain;
            LOG_DBG("n_remain: %d\n", state.n_remain);
        } else {
            // some user input remains from prompt or interaction, forward it to processing
            LOG_DBG("embd_inp.size(): %d, n_consumed: %d\n", (int) embd_inp.size(), state.n_consumed);
            while ((int) embd_inp.size() > state.n_consumed) {
                embd.push_back(embd_inp[state.n_consumed]);
                // push the prompt in the sampling context in order to apply repetition penalties later
                // for the prompt, we don't apply grammar rules
                common_sampler_accept(smpl, embd_inp[state.n_consumed], /* accept_grammar= */ false);
                ++state.n_consumed;
/* XXX: This is WRONG!
                if ((int) embd.size() >= params.n_batch) {
                    break;
                }
*/
            }
        }
        bool interrupted = false;
        if (state.input_echo && state.display) {
            for (auto id : embd) {
                const std::string token_str = common_token_to_piece(ctx, id, params.special);
//              LOG_INF("token_str.c_str(): %s\n", token_str.c_str());
                if (!llama.output_text(token_str.c_str())) {
                    interrupted  = true;
                    break;
                }
                // Record Displayed Tokens To Log
                // Note: Generated tokens are created one by one hence this check
                if (embd.size() > 1) {
                    // Incoming Requested Tokens
                    input_tokens.push_back(id);
                } else {
                    // Outgoing Generated Tokens
                    output_tokens.push_back(id);
//                  output_ss << token_str;
                }
            }
        }
        // reset color to default if there is no pending user input
        if (state.input_echo && (int) embd_inp.size() == state.n_consumed) {
            console::set_display(console::reset);
            state.display = true;
        }
        // if not currently processing queued inputs;
        if ((int)embd_inp.size() <= state.n_consumed) {
            // check for reverse prompt in the last n_prev tokens
            if (!params.antiprompt.empty()) {
                const int n_prev = 32;
                const std::string last_output = common_sampler_prev_str(smpl, ctx, n_prev);
                state.is_antiprompt = false;
                // Check if each of the reverse prompts appears at the end of the output.
                // If we're not running interactively, the reverse prompt might be tokenized with some following characters
                // so we'll compensate for that by widening the search window a bit.
                for (std::string & antiprompt : params.antiprompt) {
                    size_t extra_padding = params.interactive ? 0 : 2;
                    size_t search_start_pos = last_output.length() > static_cast<size_t>(antiprompt.length() + extra_padding)
                        ? last_output.length() - static_cast<size_t>(antiprompt.length() + extra_padding)
                        : 0;
                    if (last_output.find(antiprompt, search_start_pos) != std::string::npos) {
                        if (params.interactive) {
                            state.is_interacting = true;
                            trace("context.is_interacting = true;\n");
                        }
                        state.is_antiprompt = true;
                        break;
                    }
                }
                // check for reverse prompt using special tokens
                llama_token last_token = common_sampler_last(smpl);
                for (std::vector<llama_token> ids : antiprompt_ids) {
                    if (ids.size() == 1 && last_token == ids[0]) {
                        if (params.interactive) {
                            state.is_interacting = true;
                            trace("context.is_interacting = true;\n");
                        }
                        state.is_antiprompt = true;
                        break;
                    }
                }
                if (state.is_antiprompt) {
                    LOG_DBG("found antiprompt: %s\n", last_output.c_str());
                }
            }
            // XXX ignore EOG inside loaded broken sessions
            bool eog = llama_vocab_is_eog(state.vocab, common_sampler_last(smpl));
            bool is_eog = state.n_session_consumed == (int)state.session_tokens.size() ?
                eog : false;
            if (eog && !is_eog) {
                trace("IGNORE: found an EOG token inside loaded session\n");
            }
            // deal with end of generation tokens in interactive mode
            if (is_eog) {
                LOG_DBG("found an EOG token\n");
                trace("found an EOG token embd.size(): %d\n", (int)embd.size());
                if (params.interactive) {
                    if (!params.antiprompt.empty()) {
                        // tokenize and inject first reverse prompt
                        const auto first_antiprompt = common_tokenize(ctx, params.antiprompt.front(), false, true);
                        embd_inp.insert(embd_inp.end(), first_antiprompt.begin(), first_antiprompt.end());
                        state.is_antiprompt = true;
                    }
                    if (params.enable_chat_template) {
                        chat_add_and_format("assistant", assistant_ss.str());
                    }
                    trace("<--done--> llama_vocab_is_eog()\n");
                    state.is_interacting = true;
                    trace("context.is_interacting = true;\n");
                    llama.output_text("<--done-->");
                    assert(embd.size() <= 1); // and it is EOG
                    embd.clear();
                    if (!path_session.empty()) {
                        trace("saving %d tokens to '%s'\n",
                               (int)session_tokens.size(), path_session.c_str());
                        llama_state_save_file(ctx, path_session.c_str(),
                                              session_tokens.data(), session_tokens.size());
                    }
                    LOG("\n");
                }
            }
            // if current token is not EOG, we add it to current assistant message
            if (params.conversation_mode) {
                const auto id = common_sampler_last(smpl);
                assistant_ss << common_token_to_piece(ctx, id, false);
            }
            if (interrupted) {
                trace("<--done--> interrupted\n");
                llama.output_text("<--done-->");
                state.is_interacting = true;
                trace("context.is_interacting = true;\n");
            }
            if (state.n_past > 0 && state.is_interacting) {
                trace("embd.size(): %d context.n_past: %d\n", (int)embd.size(), state.n_past);
                trace("waiting for user input\n");
                if (params.input_prefix_bos) {
                    LOG_DBG("adding input prefix BOS token\n");
                    embd_inp.push_back(llama_vocab_bos(state.vocab));
                }
                std::string buffer;
                if (!params.input_prefix.empty() && !params.conversation_mode) {
                    LOG_DBG("appending input prefix: '%s'\n", params.input_prefix.c_str());
                    LOG("%s", params.input_prefix.c_str());
                }
                console::set_display(console::user_input);
                state.display = params.display_prompt;
                assert(embd.size() <= 1); // and it is EOG
                embd.clear();
                const char* line = llama.read_line();
                if (!line) {
//                  trace("<--done--> line == null\n");
                    state.is_interacting = true;
                    trace("context.is_interacting = true;\n");
                    llama.output_text("<--done-->");
//                  trace("<--done--> because line == null\n");
//                  trace("ENDS RUNNING THE MODEL\n");
                    break; // ENDS RUNNING THE MODEL
                }
                buffer += line;
                free((void*)line);
//              trace("%s buff: %s\n", __func__, buffer.c_str());
                if (buffer == "<--end-->") {
                    state.is_interacting = true;
                    trace("context.is_interacting = true;\n");
                    llama.output_text("<--done-->");
//                  trace("<--done--> because line == <--end-->\n");
//                  trace("ENDS RUNNING THE MODEL\n");
                    break; // ENDS RUNNING THE MODEL
                } else if (buffer == "<--otr-->") { // off the record
                    buffer = "";
                    restore_at_readline(state);
                    llama.output_text("<--done-->");
                    trace("<--done--> because line == <--otr-->\n");
                    state.is_interacting = true;
                    trace("context.is_interacting = true;\n");
                    trace("embd.size(): %d\n", (int)embd.size());
                    trace("embd_inp.size(): %d\n", (int)embd_inp.size());
                }
                // done taking input, reset color
                console::set_display(console::reset);
                state.display = true;
                // Add tokens to embd only if the input buffer is non-empty
                // Entering a empty line lets the user pass control back
                if (buffer.length() > 1) {
                    // append input suffix if any
                    if (!params.input_suffix.empty() && !params.conversation_mode) {
                        LOG_DBG("appending input suffix: '%s'\n", params.input_suffix.c_str());
                        LOG("%s", params.input_suffix.c_str());
                    }
                    LOG_DBG("buffer: '%s'\n", buffer.c_str());
                    save_at_readline(state);
                    state.progress = 0;
//                  trace("at_readline.embd_inp_size: %d\n", (int)context.at_readline.embd_inp_size);
                    if (params.escape) {
                        string_process_escapes(buffer);
                    }
                    bool format_chat = params.conversation_mode && params.enable_chat_template;
                    std::string user_inp = format_chat
                        ? chat_add_and_format("user", std::move(buffer))
                        : std::move(buffer);
                    // user_inp: something like:
                    // "\n<|start_of_role|>user<|end_of_role|>buffer<|end_of_text|>\n
                    //    <|start_of_role|>assistant<|end_of_role|>\n"
                    // TODO: one inconvenient of current chat template
                    // implementation is that we can't distinguish between
                    // user input and special tokens (prefix/postfix)
                    const auto line_pfx = common_tokenize(ctx, params.input_prefix, false, true);
                    const auto line_inp = common_tokenize(ctx, user_inp,            false, format_chat);
                    const auto line_sfx = common_tokenize(ctx, params.input_suffix, false, true);
                    LOG_DBG("input tokens: %s\n", string_from(ctx, line_inp).c_str());
                    // if user stop generation mid-way, we must add EOT to finish model's last response
                    if (state.need_insert_eot && format_chat) {
                        llama_token eot = llama_vocab_eot(state.vocab);
                        embd_inp.push_back(eot == LLAMA_TOKEN_NULL ? llama_vocab_eos(state.vocab) : eot);
                        state.need_insert_eot = false;
                    }
                    embd_inp.insert(embd_inp.end(), line_pfx.begin(), line_pfx.end());
                    embd_inp.insert(embd_inp.end(), line_inp.begin(), line_inp.end());
                    embd_inp.insert(embd_inp.end(), line_sfx.begin(), line_sfx.end());
                    for (size_t i = state.at_readline.embd_inp_size; i < embd_inp.size(); ++i) {
                        const llama_token token = embd_inp[i];
                        output_tokens.push_back(token);
                        output_ss << common_token_to_piece(ctx, token);
                    }
                    // reset assistant message
                    assistant_ss.str("");
                    state.n_remain -= line_inp.size();
//                  trace("n_remain: %d embd_inp: %d\n", context.n_remain, (int)embd_inp.size());
                } else {
                    LOG_DBG("empty line, passing control back\n");
                }
                state.input_echo = false; // do not echo this again
            }
            if (state.n_past > 0) {
                if (state.is_interacting) {
                    common_sampler_reset(smpl);
                }
                state.is_interacting = false;
                trace("context.is_interacting = false;\n");
            }
        }
        // end of generation
        if (!embd.empty() && llama_vocab_is_eog(state.vocab, embd.back()) && !(params.interactive)) {
            LOG(" [end of text]\n");
            trace(" [end of text]\n");
            break;
        }
        // In interactive mode, respect the maximum number of tokens and drop back to user input when reached.
        // We skip this logic when n_predict == -1 (infinite) or -2 (stop at context size).
        if (params.interactive && state.n_remain <= 0 && params.n_predict >= 0) {
            state.n_remain = params.n_predict;
            state.is_interacting = true;
            trace("context.is_interacting = true;\n");
            llama.output_text("<--done-->");
            trace("%d: <--done--> context.n_remain <= 0\n", __LINE__);
        }
    }
    if (!path_session.empty()) {
        trace("saving final output %d tokens to '%s'\n",
               (int)session_tokens.size(), path_session.c_str());
        llama_state_save_file(ctx, path_session.c_str(),
                              session_tokens.data(), session_tokens.size());
    }
    LOG("\n\n");
    common_perf_print(ctx, smpl);
    common_sampler_free(smpl);
    return 0;
}
#endif
