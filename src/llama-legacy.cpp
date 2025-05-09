#if 0
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
    double progress             {0}; // progress of processin embd_inp
    struct {
        size_t embd_size            {0};
        size_t embd_inp_size        {0};
        size_t session_tokens_size  {0};
        int n_past                  {0};
        int n_remain                {0};
        int n_consumed              {0};
    } saved;
};

static void save_state(struct state& state) {
    state.saved.embd_size           = state.embd.size();
    state.saved.embd_inp_size       = state.embd_inp.size();
    state.saved.session_tokens_size = state.session_tokens.size();
    state.saved.n_past              = state.n_past;
    state.saved.n_remain            = state.n_remain;
    state.saved.n_consumed          = state.n_consumed;
}

static void restore_state(struct state& state) {
    state.embd.resize(state.saved.embd_size);
    state.embd_inp.resize(state.saved.embd_inp_size);
    state.session_tokens.resize(state.saved.session_tokens_size);
    state.n_past              = state.saved.n_past;
    state.n_remain            = state.saved.n_remain;
    state.n_consumed          = state.saved.n_consumed;
}

static void print_usage(int argc, char ** argv) {
    (void)argc; (void)argv;
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
    common_params &p = state.params;
    if (!common_params_parse(argc, argv, p, LLAMA_EXAMPLE_MAIN, print_usage)) {
        return 1;
    }
    common_init();
    auto & sparams = p.sampling;
    console::init(p.simple_io, p.use_color);
    atexit([]() { console::cleanup(); });
    if (p.logits_all) {
        trace("please use the 'perplexity' tool for perplexity calculations\n");
        return 0;
    }
    if (p.embedding) {
        trace("please use the 'embedding' tool for embedding calculations\n");
        return 0;
    }
    if (p.n_ctx != 0 && p.n_ctx < 8) {
        trace("warning: minimum context size is 8, using minimum size.\n");
        p.n_ctx = 8;
    }
    if (p.rope_freq_base != 0.0) {
        trace("warning: changing RoPE frequency to %g.\n", p.rope_freq_base);
    }
    if (p.rope_freq_scale != 0.0) {
        trace("warning: scaling RoPE frequency by %g.\n", p.rope_freq_scale);
    }
    return 0;
}

static int load(struct state &state) {
    state.model = nullptr;
    state.ctx = nullptr;
    state.smpl = nullptr;
    state.llama_init = common_init_from_params(state.params);
    state.model = state.llama_init.model.get();
    state.ctx = state.llama_init.context.get();
    if (state.model == NULL) {
        trace("error: unable to load model\n");
        return 1;
    }
    state.vocab = llama_model_get_vocab(state.model);
    state.chat_templates = common_chat_templates_from_model(state.model,
                                state.params.chat_template);
    return 0;
}

static int ggml_init(struct state &state) {
//  trace("llama threadpool init, n_threads = %d\n",
//        (int)state.params.cpuparams.n_threads);
    state.ggml_reg = ggml_backend_dev_backend_reg(
            ggml_backend_dev_by_type(GGML_BACKEND_DEVICE_TYPE_CPU));
    auto &reg = state.ggml_reg;
    auto * ggml_threadpool_new_fn = (decltype(ggml_threadpool_new)*)
            ggml_backend_reg_get_proc_address(reg, "ggml_threadpool_new");
    struct ggml_threadpool_params tpp_batch =
            ggml_threadpool_params_from_cpu_params(state.params.cpuparams_batch);
    struct ggml_threadpool_params tpp =
            ggml_threadpool_params_from_cpu_params(state.params.cpuparams);
    set_process_priority(state.params.cpuparams.priority);
    state.threadpool_batch = NULL;
    if (!ggml_threadpool_params_match(&tpp, &tpp_batch)) {
        state.threadpool_batch = ggml_threadpool_new_fn(&tpp_batch);
        if (!state.threadpool_batch) {
            trace("batch threadpool create failed : n_threads %d\n",
                tpp_batch.n_threads);
            return 1;
        }
        // Start the non-batch threadpool in the paused state
        tpp.paused = true;
    }
    state.threadpool = ggml_threadpool_new_fn(&tpp);
    if (!state.threadpool) {
        trace("threadpool create failed : n_threads %d\n", tpp.n_threads);
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

static std::string prompt_cache_folder(const char* session) {
    static std::string prompt_cache;
    if (prompt_cache.empty()) {
        const char* cwd = get_cwd();
        std::string prompts = std::string(cwd) + "/prompts";
//      trace("%s\n", prompts.c_str());
        prompt_cache = prompts + "/" + std::string(session);
    }
    return prompt_cache;
}

static void clear(struct state &state) {
    state.chat_msgs.clear();
    state.embd.clear();
    state.embd_inp.clear();
    state.session_tokens.clear();
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
    state.n_consumed           = 0;
    state.progress             = 0; // progress of processing embd_inp
    state.n_past               = 0;
    state.n_remain             = state.params.n_predict;
    state.params.n_keep        = -1;
    state.saved          = {0};
}

static int load_session(struct state &state, const std::string &filename) {
//  trace("attempting to load saved session from '%s'\n",filename.c_str());
    if (!file_exists(filename)) {
//      trace("file does not exist, will create: %s\n", filename.c_str());
    } else if (file_is_empty(filename)) {
        trace("session file is empty. A new session will be initialized.\n");
    } else { // The file exists and is not empty
        state.session_tokens.resize(state.n_ctx);
        size_t n_token_count_out = 0;
        if (!llama_state_load_file(state.ctx, filename.c_str(),
                                   state.session_tokens.data(),
                                   state.session_tokens.capacity(),
                                   &n_token_count_out)) {
            trace("failed to load session file '%s'\n", filename.c_str());
            return 1;
        }
        state.session_tokens.resize(n_token_count_out); // truncate
//      trace("loaded a session with prompt size of %d tokens\n",
//             (int)state.session_tokens.size());
    }
    return 0;
}

static void save_session(struct state &state, const std::string &filename) {
    assert(!filename.empty()); // in chat() usecase we always have a filename
    if (!state.need_to_save_session) {
//      trace("no need to save session because it has not been changed\n");
    } else {
//      trace("saving %d tokens to '%s'\n", (int)state.session_tokens.size(),
//                                               filename.c_str());
        bool b = llama_state_save_file(state.ctx, filename.c_str(),
            state.session_tokens.data(), state.session_tokens.size());
        if (b) {
//          trace("saved session to %s\n", filename.c_str());
            state.need_to_save_session = false;
        } else {
            trace("error: failed to save session\n");
            llama.error("failed to save chat state");
        }
    }
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
//  trace("formatted: '%s'\n", formatted.c_str());
    return formatted;
}

static int tokenize_prompt(struct state &state) {
    assert(state.embd.size() == 0);
    assert(state.embd_inp.size() == 0);
    // format the system prompt in conversation mode
    // (fallback to default if empty)
    auto prompt = (state.params.conversation_mode &&
                   state.params.enable_chat_template)
        ? add_and_format(state, "system", state.params.prompt.empty() ?
                              DEFAULT_SYSTEM_MESSAGE : state.params.prompt)
        // otherwise use the prompt as is
        : state.params.prompt;
    if (state.session_tokens.empty()) {
        // because params.interactive_first is set to true for next session
//      trace("tokenize system prompt\n");
        state.embd_inp = common_tokenize(state.ctx, prompt, true, true);
        // Should not run without any tokens
        if (state.embd_inp.empty()) {
            if (llama_vocab_get_add_bos(state.vocab)) {
                state.embd_inp.push_back(llama_vocab_bos(state.vocab));
                trace("embd_inp was considered empty but bos was added: %s\n",
                      string_from(state.ctx, state.embd_inp).c_str());
            } else {
                trace("input is empty\n");
                return -1;
            }
        }
    } else {
        const int n = (int)state.session_tokens.size();
        trace("use session %d tokens\n", n);
        assert(state.session_tokens.size() > 0);
        // don’t re‐tokenize, just advance the n_past counter.
        // We still want to decode last session token, see
        // "Last Session Token Decoding" discussion at the end of this file
        state.n_past = n - 1;
        const auto last_token = state.session_tokens[n - 1];
        common_sampler_accept(state.smpl, last_token, /*accept_grammar=*/false);
        state.embd.push_back(last_token);
        state.session_tokens.pop_back();
    }
//  trace("prompt: \"%s\"\n", prompt.c_str());
//  trace("tokens: %s\n", string_from(state.ctx, state.embd_inp).c_str());
    return 0;
}

static void dump_interactive_info(const struct state &state) {
    if (state.params.interactive) {
        trace("interactive mode on.\n");
        if (!state.params.antiprompt.empty()) {
            for (const auto & antiprompt : state.params.antiprompt) {
                trace("Reverse prompt: '%s'\n", antiprompt.c_str());
                if (state.params.verbose_prompt) {
                    auto t = common_tokenize(state.ctx, antiprompt, false, true);
                    for (int i = 0; i < (int)t.size(); i++) {
                        trace("%6d -> '%s'\n", t[i],
                            common_token_to_piece(state.ctx, t[i]).c_str());
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
                auto t = common_tokenize(state.ctx, state.params.input_prefix,
                                         true, true);
                for (int i = 0; i < (int)t.size(); i++) {
                    trace("%6d -> '%s'\n", t[i],
                        common_token_to_piece(state.ctx, t[i]).c_str());
                }
            }
        }
        if (!state.params.input_suffix.empty()) {
            trace("Input suffix: '%s'\n", state.params.input_suffix.c_str());
            if (state.params.verbose_prompt) {
                auto t = common_tokenize(state.ctx, state.params.input_suffix,
                                         false, true);
                for (int i = 0; i < (int)t.size(); i++) {
                    trace("%6d -> '%s'\n", t[i],
                        common_token_to_piece(state.ctx, t[i]).c_str());
                }
            }
        }
    }
}

static void dump_prompt(const struct state &state) {
    if (state.params.verbose_prompt) {
        trace("prompt: '%s'\n", state.params.prompt.c_str());
        trace("number of tokens in prompt = %u\n", (int)state.embd_inp.size());
        for (int i = 0; i < (int)state.embd_inp.size(); i++) {
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
/*
            state.progress = (double)(i + n_eval) / (double)state.embd.size();
            trace("progress: %.6f i:%d n_eval:%d state.embd.size():%d\n",
                  state.progress, i, n_eval, (int)state.embd.size());
*/
        state.n_past += n_eval;
        trace("embd_inp.size(): %d embd.size(): %d n_past: %d n_consumed: %d "
              "session_tokens.size(): %d state.is_interacting: %d\n",
              (int)state.embd_inp.size(), (int)state.embd.size(),
              state.n_past, state.n_consumed,
              (int)state.session_tokens.size(), state.is_interacting);
        if (llama.progress) { llama.progress(state.progress); }
    }
    return 0;
}

/*
    context_extension_via_self_extend()
    Theory of operation
    
    When you run a model on more tokens than it was originally trained
    for (n_ctx > n_ctx_train), you can’t simply shove all past
    key/value pairs into one giant cache. Instead, “group attention”
    splits the long context into ga_n interleaved groups of
    width ga_w/ga_n.
    
    Each iteration here:
    Select a window of ga_w tokens starting at ga_i.
    Copy that window’s KV entries to the current tail of the cache (seq_add).

    Divide (downsample) those entries by ga_n so that only every ga_n‑th
    key/value pair remains (seq_div). That enforces the group‑attention
    pattern (each head only attends within its group).

    Fix alignment by a small extra shift (dd).

    Discard the oldest bd tokens from the effective context (state.n_past -= bd).

    By repeating this, you “slide” the attention window across the entire
    past sequence, compressing older tokens in a grouped fashion so that
    the model still attends locally yet can see far beyond its
    original context size.
*/


static void context_extension_via_self_extend(struct state &state, int &ga_i) {
    /*
     ga_i   the current “group‑attention” index or offset into the past context.
            It starts at 0 and increments by one group‑window each iteration.
            Passed by reference so the caller can continue using the updated
            offset.
            
     ga_n   the number of attention groups. If > 1, we partition long
            contexts into ga_n interleaved streams.
            
     ga_w   the group‑window width, i.e. how many tokens per group before
            we shift. Must be a multiple of ga_n (ensures even splits).
            
     ib     the integer block count that tells us how many whole blocks
            of size (ga_w/ga_n) fit into the already‑shifted portion.
            Used to scale how much KV data to copy.
            
     bd     the block‑discard length – how many tokens worth of KV entries
            we’ll remove from state.n_past each iteration. It’s exactly one
            window minus one group, so the context shrinks by that many
            tokens after we redistribute.
            
     dd     the delta‑displacement, a small correction so that after the
            two KV moves and the division, everything lines up precisely.
    */
    const int ga_n = state.params.grp_attn_n;
    const int ga_w = state.params.grp_attn_w;
    while (state.n_past >= ga_i + ga_w) {
        const int ib = (ga_n * ga_i) / ga_w;
        const int bd = (ga_w / ga_n) * (ga_n - 1);
        const int dd = (ga_w / ga_n) - ib * bd - ga_w;
        trace("shift: [%6d, %6d] + %6d -> [%6d, %6d]\n",
                ga_i, state.n_past, ib * bd, ga_i + ib * bd,
                state.n_past + ib * bd);
        trace("div:   [%6d, %6d] / %6d -> [%6d, %6d]\n",
                ga_i + ib * bd, ga_i + ib * bd + ga_w, ga_n,
                (ga_i + ib * bd)/ga_n, (ga_i + ib * bd + ga_w)/ga_n);
        trace("shift: [%6d, %6d] + %6d -> [%6d, %6d]\n",
                ga_i + ib * bd + ga_w, state.n_past + ib * bd, dd,
                ga_i + ib * bd + ga_w + dd, state.n_past + ib * bd + dd);
        llama_kv_cache_seq_add(state.ctx, 0, ga_i, state.n_past, ib * bd);
        // replicates ib × bd tokens’ worth of KV entries, moving them
        // from positions [ga_i, ga_i+…] into the end at state.n_past.
        llama_kv_cache_seq_div(state.ctx, 0, ga_i + ib * bd,
                               ga_i + ib * bd + ga_w, ga_n);
        // within the newly‑added window of size ga_w, it downsamples
        // every ga_n‑th KV entry (i.e. group‑attention division),
        // effectively compressing that slice by a factor of ga_n
        llama_kv_cache_seq_add(state.ctx, 0, ga_i + ib * bd + ga_w,
                               state.n_past + ib * bd, dd);
        // makes one final tiny shift of dd entries so all tokens remain
        // aligned after the division.
        state.n_past -= bd;  // context shrinks by the discarded block
        ga_i += ga_w / ga_n; // move to next group‑window
        trace("n_past_old = %d, n_past = %d, ga_i = %d\n\n",
              state.n_past + bd, state.n_past, ga_i);
    }
}

/*
    infinite_text_generation_via_context_shifting()
    Theory of operation

    When the model’s past‑token count exceeds its context window:
    – If context shifting is enabled, we drop half of the excess tokens
      beyond the first n_keep, then recompute logits on the remaining
      context in batches so generation can continue with a “slid” window.

    Each run:
    • Compute how many tokens lie beyond the kept prompt (n_left).
    • Discard half of those (n_discard).
    • Remove them from the KV‑cache.
    • Shift the tail of the context back into view by adding negative
      offset (–n_discard).
    • Update n_past accordingly.

    state.params.ctx_shift   whether automatic context shifting is on
    state.params.n_predict   the overall generation budget
    state.params.n_keep      number of tokens to preserve at front
    state.n_past             total tokens currently in KV‑cache
    n_left                   = state.n_past – n_keep, tokens beyond keep
    n_discard                = n_left / 2, half the excess to drop
    keep                     = n_keep + n_discard, new split point
*/

static bool infinite_text_generation_via_context_shifting(struct state &state) {
    // if we run out of context:
    // - take the n_keep first tokens from the original prompt (via n_past)
    // - take half of the last (n_ctx - n_keep) tokens and
    //                          recompute the logits in batches
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
    const int keep = state.params.n_keep + n_discard;
    llama_kv_cache_seq_rm (state.ctx, 0, state.params.n_keep, keep);
    llama_kv_cache_seq_add(state.ctx, 0, keep, state.n_past, -n_discard);
    state.n_past -= n_discard;
    trace("after swap: n_past = %d\n", state.n_past);
    trace("embd: %s\n", string_from(state.ctx, state.embd).c_str());
    return false;
}


static void insert_user_input(struct state &state, std::string &input) {
    bool format = state.params.conversation_mode &&
                  state.params.enable_chat_template;
    std::string user_input = format
        ? add_and_format(state, "user", std::move(input))
        : std::move(input);
    // user_inp: something like:
    // "\n<|start_of_role|>user<|end_of_role|>buffer<|end_of_text|>\n
    //    <|start_of_role|>assistant<|end_of_role|>\n"
    // TODO: one inconvenient of current chat template
    // implementation is that we can't distinguish between
    // user input and special tokens (prefix/postfix)
    const auto &pfx = state.params.input_prefix;
    const auto &sfx = state.params.input_suffix;
    if (!pfx.empty() && !state.params.conversation_mode) {
        trace("input prefix: '%s'\n", pfx.c_str());
    }
    if (!sfx.empty() && !state.params.conversation_mode) {
        trace("input suffix: '%s'\n", sfx.c_str());
    }
    const auto line_pfx = common_tokenize(state.ctx, pfx, false, true);
    const auto line_inp = common_tokenize(state.ctx, user_input, false, format);
    const auto line_sfx = common_tokenize(state.ctx, sfx, false, true);
//  trace("input tokens: %s\n", string_from(state.ctx, line_inp).c_str());
    // if user stop generation mid-way, add EOT to finish model's last response
    if (state.need_insert_eot && format) {
        llama_token eot = llama_vocab_eot(state.vocab);
        state.embd_inp.push_back(eot == LLAMA_TOKEN_NULL ?
            llama_vocab_eos(state.vocab) : eot);
        state.need_insert_eot = false;
        state.need_to_save_session = true;
    }
    auto &inp = state.embd_inp;
    inp.insert(inp.end(), line_pfx.begin(), line_pfx.end());
    inp.insert(inp.end(), line_inp.begin(), line_inp.end());
    inp.insert(inp.end(), line_sfx.begin(), line_sfx.end());
    state.n_remain -= line_inp.size();
//  trace("n_remain: %d embd_inp: %d\n", state.n_remain, (int)inp.size());
}

static bool off_the_record(struct state &state, const std::string &input) {
    if (input.rfind("[otr", 0) != 0) { return false; }
    int otr_max = state.n_ctx - 4;
    size_t colon = input.find(':');
    size_t close = input.find(']');
    if (colon != std::string::npos && colon < close) {
        otr_max = std::stoi(input.substr(colon+1, close-(colon+1)));
    }
    size_t start = close + 1;
    size_t end   = input.rfind("[/otr]");
    std::string body = input.substr(start, end - start);
//  trace("body: %s\n", body.c_str());
    save_state(state);
    int kv_start = state.n_past;
    state.embd_inp.clear();
    state.n_consumed = 0;
    state.embd.clear();
    insert_user_input(state, const_cast<std::string&>(body));
    while (state.n_consumed < (int)state.embd_inp.size()) {
        // grab next user‐token
        llama_token tok = state.embd_inp[state.n_consumed++];
        common_sampler_accept(state.smpl, tok, /*grammar=*/false);
        // decode into KV cache
        llama_decode(state.ctx, llama_batch_get_one(&tok, 1));
        state.n_past++;
    }
    std::string s;
    for (int i = 0; i < otr_max; i++) {
        llama_token id = common_sampler_sample(state.smpl, state.ctx, -1);
        common_sampler_accept(state.smpl, id, /*grammar=*/true);
        llama_decode(state.ctx, llama_batch_get_one(&id, 1));
        state.n_past++;
        s += common_token_to_piece(state.ctx, id, state.params.special);
        if (llama_vocab_is_eog(state.vocab, id)) {
            break;
        }
    }
    llama.output(s.c_str());
//  llama.error("error test");  // DEBUG: uncomment to test errors to UI
    llama.output("<--done-->");
    restore_state(state);
    llama_kv_cache_seq_rm(state.ctx,
        /*layer:*/0, /*from:*/kv_start, /*to:*/kv_start + (int)s.size());
    return true;
}

static int chat(struct state &state, const char* session_id, bool existing) {
    clear(state);
    assert(!state.params.prompt_cache_ro); // not read only cache
//  params.interactive_first = false; // it will be modified later...
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
    std::string filename = prompt_cache_folder(session_id);
    assert(!filename.empty());
    if (load_session(state, filename) != 0) { return 1; }
    const bool add_bos = llama_vocab_get_add_bos(state.vocab);
    if (!llama_model_has_encoder(state.model)) {
        assert(!llama_vocab_get_add_eos(state.vocab));
    }
//  trace("n_ctx: %d, add_bos: %d\n", state.n_ctx, add_bos);
    if ((int)state.embd_inp.size() > state.n_ctx - 4) {
        trace("prompt is too long (%d tokens, max %d)\n",
              (int)state.embd_inp.size(), state.n_ctx - 4);
        return 1;
    }
    state.smpl = common_sampler_init(state.model, state.params.sampling);
    if (!state.smpl) {
        trace("%s: failed to initialize sampling subsystem\n");
        return 1;
    }
    if (tokenize_prompt(state) != 0) { return 0; }
    // debug message about similarity of saved session, if applicable
    if (!state.session_tokens.empty()) {
        // remove any "future" tokens that we might have inherited from
        // the previous session...
        trace("remove any `future` tokens that we might have inherited\n");
        llama_kv_cache_seq_rm(state.ctx, -1, state.session_tokens.size(), -1);
        // llama_kv_cache_seq_rm() removes everything after session_tokens.size()
    }
    // number of tokens to keep when resetting context
    if (state.params.n_keep < 0 ||
        state.params.n_keep > (int)state.embd_inp.size()) {
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
//  dump_prompt(state);
//  dump_interactive_info(state);
//  trace("sampler seed: %u\n",     common_sampler_get_seed(state.smpl));
//  trace("sampler params: \n%s\n", state.params.sampling.print().c_str());
//  trace("sampler chain: %s\n",    common_sampler_print(state.smpl).c_str());
//  trace("generate: n_ctx = %d, n_batch = %d, n_predict = %d, n_keep = %d\n",
//         state.n_ctx, state.params.n_batch,
//         state.params.n_predict, state.params.n_keep);
    // group-attention state
    // number of grouped KV tokens so far (used only if params.grp_attn_n > 1)
    int ga_i = 0;
    const int ga_n = state.params.grp_attn_n;
    const int ga_w = state.params.grp_attn_w;
    if (ga_n != 1) {
        trace("self-extend: n_ctx_train = %d, grp_attn_n = %d, "
              "grp_attn_w = %d\n",
              state.n_ctx_train, ga_n, ga_w);
        assert(ga_n > 0);         // ga_n must be positive
        assert(ga_w % ga_n == 0); // ga_w must be a multiple of ga_n
        // n_ctx_train must be a multiple of grp_attn_w
        assert(state.n_ctx_train % ga_w == 0);
        // n_ctx must be at least n_ctx_train * grp_attn_n
        assert(state.n_ctx >= state.n_ctx_train * ga_n);
    }
    if (state.params.interactive) {
        state.is_interacting = state.params.interactive_first;
    }
    state.need_to_save_session = false;
    state.display = state.params.display_prompt;
    // tokenized antiprompts
    auto antiprompt_ids = state.antiprompt_ids;
    antiprompt_ids.reserve(state.params.antiprompt.size());
    for (const std::string & antiprompt : state.params.antiprompt) {
        antiprompt_ids.emplace_back(::common_tokenize(state.ctx,
                                    antiprompt, false, true));
    }
    if (llama_model_has_encoder(state.model)) {
        assert(false); // NO ENCODER SUPPORT YET
        const int input_size = state.embd_inp.size();
        llama_token * input_data = state.embd_inp.data();
        if (llama_encode(state.ctx,
                        llama_batch_get_one(input_data, input_size))) {
            trace("%s : failed to eval\n", __func__);
            return 1;
        }
        llama_token decoder_start_token_id =
            llama_model_decoder_start_token(state.model);
        if (decoder_start_token_id == LLAMA_TOKEN_NULL) {
            decoder_start_token_id = llama_vocab_bos(state.vocab);
        }
        state.embd_inp.clear();
        state.embd_inp.push_back(decoder_start_token_id);
    }
//  trace("state.n_remain: %d\n", (int)state.n_remain);
    while ((state.n_remain != 0 && !state.is_antiprompt) ||
            state.params.interactive) {
        // predict
        if (!state.embd.empty()) {
            // Note: (n_ctx - 4) here is to match the logic for commandline
            // prompt handling --prompt or --file which uses the same value.
            int max_embd_size = state.n_ctx - 4;
            // Ensure the input doesn't exceed the context size by
            // truncating embd if necessary.
            if ((int)state.embd.size() > max_embd_size) {
                const int skipped = (int)state.embd.size() - max_embd_size;
                state.embd.resize(max_embd_size);
                trace("<<input too long: skipped %d token%s>>", skipped,
                      skipped != 1 ? "s" : "");
            }
            if (ga_n == 1) {
                if (state.n_past + (int)state.embd.size() >= state.n_ctx) {
                    if (infinite_text_generation_via_context_shifting(state)) {
                        llama.error("Context Overflow");
                        state.need_to_save_session = false;
                        // context full, shift is disabled => stop w/o saving
                        break;
                    }
                }
            } else {
                context_extension_via_self_extend(state, ga_i);
            }
            trace("PREDICT?\n");
            if (decode(state) != 0) { return 1; }
            if (!state.embd.empty() && !filename.empty()) {
                auto b = state.embd.begin();
                auto e = state.embd.end();
                state.session_tokens.insert(state.session_tokens.end(), b, e);
            }
//          trace("embd.size(): %d\n", (int)state.embd.size());
        }
        state.embd.clear();
//      trace("embd.clear()\n");
        if ((int)state.embd_inp.size() <= state.n_consumed &&
            !state.is_interacting) {
            // optionally save the session on first sample
            // (for faster prompt loading next time)
            /*
            if (state.need_to_save_session && !state.params.prompt_cache_ro) {
                save_session(state, filename);
            }
            */
            const llama_token id = common_sampler_sample(state.smpl,
                                                         state.ctx, -1);
            common_sampler_accept(state.smpl, id, /* accept_grammar= */ true);
            state.embd.push_back(id);
            // echo this to console
            state.input_echo = true;
            // decrement remaining sampling budget
            state.n_remain--;
//          trace("n_remain: %d\n", state.n_remain);
        } else {
            // some user input remains from prompt or interaction:
//          trace("embd_inp.size(): %d, n_consumed: %d\n",
//                (int)state.embd_inp.size(), state.n_consumed);
            int k = 0;
            while ((int)state.embd_inp.size() > state.n_consumed) {
                state.embd.push_back(state.embd_inp[state.n_consumed]);
                // push the prompt in the sampling context in order to apply
                // repetition penalties later for the prompt, we don't apply
                // grammar rules
                common_sampler_accept(state.smpl,
                                      state.embd_inp[state.n_consumed],
                /* accept_grammar= */ false);
                state.n_consumed++;
                k++;
            }
            trace("state.embd.pushed_back() %d tokens from embd_inp\n", k);
            k = 0;
        }
        bool interrupted = false;
        if (state.input_echo && state.display) {
            for (auto id : state.embd) {
                const std::string token_str = common_token_to_piece(state.ctx,
                      id, state.params.special);
//              trace("token_str.c_str(): %s\n", token_str.c_str());
                if (!llama.output(token_str.c_str())) {
                    interrupted  = true;
                    break;
                }
            }
        }
        if (state.input_echo && (int)state.embd_inp.size() == state.n_consumed) {
            state.display = true;
        }
        // if not currently processing queued inputs
        if ((int)state.embd_inp.size() <= state.n_consumed) {
            // check for reverse prompt in the last n_prev tokens
            if (!state.params.antiprompt.empty()) {
                const int n_prev = 32;
                const std::string last_output = common_sampler_prev_str(
                        state.smpl, state.ctx, n_prev);
                state.is_antiprompt = false;
                // Check if each of the reverse prompts appears at the end of
                // the output. If we're not running interactively, the reverse
                // prompt might be tokenized with some following characters so
                // we'll compensate for that by widening search window.
                for (std::string & antiprompt : state.params.antiprompt) {
                    size_t extra_padding = state.params.interactive ? 0 : 2;
                    int with_extra = (int)(antiprompt.length() + extra_padding);
                    int len = (int)last_output.length();
                    size_t search_start_pos = len > with_extra ?
                        len - with_extra : 0;
                    if (last_output.find(antiprompt, search_start_pos) !=
                                         std::string::npos) {
                        if (state.params.interactive) {
                            state.is_interacting = true;
                            trace("state.is_interacting = true;\n");
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
                            trace("state.is_interacting = true;\n");
                        }
                        state.is_antiprompt = true;
                        break;
                    }
                }
                if (state.is_antiprompt) {
                    trace("found antiprompt: %s\n", last_output.c_str());
                }
            }
            bool is_eog = llama_vocab_is_eog(state.vocab,
                            common_sampler_last(state.smpl));
            // deal with end of generation tokens in interactive mode
            if (is_eog) {
//              trace("found an EOG token embd.size(): %d\n",
//                     (int)state.embd.size());
                if (state.params.interactive) {
                    if (!state.params.antiprompt.empty()) {
                        // tokenize and inject first reverse prompt
                        const auto first_antiprompt = common_tokenize(state.ctx,
                            state.params.antiprompt.front(), false, true);
                        state.embd_inp.insert(state.embd_inp.end(),
                            first_antiprompt.begin(), first_antiprompt.end());
                        state.is_antiprompt = true;
                    }
//                  trace("<--done--> llama_vocab_is_eog()\n");
                    state.is_interacting = true;
//                  trace("state.is_interacting = true;\n");
                    llama.output("<--done-->");
                    assert(state.embd.size() <= 1); // and it is EOG
                    state.embd.clear();
                    save_session(state, filename);
                }
            }
            if (interrupted) {
                trace("<--done--> interrupted\n");
                llama.output("<--done-->");
                state.is_interacting = true;
                state.need_insert_eot = true;
                trace("state.is_interacting = true;\n");
                continue;
            }
            if (state.n_past > 0 && state.is_interacting) {
//              trace("embd.size(): %d context.n_past: %d\n",
//                    (int)state.embd.size(), state.n_past);
                state.need_to_save_session = false;
//              trace("waiting for user input\n");
                if (state.params.input_prefix_bos) {
                    trace("adding input prefix BOS token\n");
                    state.embd_inp.push_back(llama_vocab_bos(state.vocab));
                }
                state.display = state.params.display_prompt;
                assert(state.embd.size() <= 1); // and it is EOG
                state.embd.clear();
                const char* str = llama.input();
                if (!str || strcmp(str, "<--end-->") == 0) {
//                  trace("<--done--> line == null\n");
                    llama.output("<--done-->");
//                  trace("<--done--> because line == null\n");
//                  trace("ENDS RUNNING THE MODEL\n");
                    break; // ENDS RUNNING THE MODEL
                }
                std::string text = str;
                free((void*)str);
//              trace("%s buff: %s\n", __func__, buffer.c_str());
                if (off_the_record(state, text)) { continue; }
                state.display = true;
                // Add tokens to embd only if the input buffer is non-empty
                // Entering a empty line lets the user pass control back
                if (text.length() > 1) {
//                  trace("input: '%s'\n", text.c_str());
                    state.need_to_save_session = true;
                    save_state(state);
                    state.progress = 0;
                    if (state.params.escape) { string_process_escapes(text); }
                    insert_user_input(state, text);
                } else {
                    trace("empty line, passing control back\n");
                }
                state.input_echo = false; // do not echo this again
            }
            if (state.n_past > 0) {
                if (state.is_interacting) { common_sampler_reset(state.smpl); }
                state.is_interacting = false;
//              trace("state.is_interacting = false;\n");
            }
        }
        // end of generation
        const bool is_eog = !state.embd.empty() &&
                llama_vocab_is_eog(state.vocab, state.embd.back());
        if (is_eog && !(state.params.interactive)) {
            trace(" [end of text]\n");
            break;
        }
        // In interactive mode, respect the maximum number of tokens and
        // drop back to user input when reached. We skip this logic when
        // n_predict == -1 (infinite) or -2 (stop at context size).
        if (state.params.interactive && state.n_remain <= 0 &&
                                        state.params.n_predict >= 0) {
            state.n_remain = state.params.n_predict;
            state.is_interacting = true;
//          trace("state.is_interacting = true;\n");
            llama.output("<--done-->");
//          trace("<--done--> context.n_remain <= 0\n");
        }
    }
//  trace("saving final output of %d tokens\n",
//        (int)state.session_tokens.size());
    save_session(state, filename);
    common_perf_print(state.ctx, state.smpl);
    common_sampler_free(state.smpl);
    return 0;
}

static void ggml_free(struct state &state) {
    llama_detach_threadpool(state.ctx);
    llama_backend_free();
    auto * ggml_threadpool_free_fn = (decltype(ggml_threadpool_free)*)
        ggml_backend_reg_get_proc_address(state.ggml_reg,
                                         "ggml_threadpool_free");
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
    #if DEBUG // do not catch exceptions in debug
        r = chat(*context, session, existing);
    #else
        try {
            r = chat(*context, session, existing);
        } catch (...) {
            fprintf(stderr, "exception in chat()\n");
            // Oops...
        }
    #endif
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
    .input    = 0,
    .output   = 0,
    .progress = 0,
};


/*
    # Last Session Token Decoding
    
    Practical reasons why one would want to force a fresh decode
    of that last prompt token instead of blindly re‑using the “cached” logits:

    Sampler state (repetition penalties, n‑gram block, etc.)
    
    The common_sampler keeps an internal buffer of “previous tokens” and
    their logits so it can apply penalties (repetition, n‑gram blocking,
    grammar rules, etc.). When you load a session from disk you restore
    the KV‑cache (so attention keys/values are in place) but you don’t
    automatically repopulate the sampler’s prev logits or penalty history.
    By popping the last token back into state.embd and running it through
    llama_decode(), you guarantee that the sampler sees exactly that token
    again—updating its prev buffer—so that all your penalties and filters
    kick in correctly on the very next sample.

    Correct next‑step distribution
    
    Even if you never change sampling parameters mid‑session, you still
    need a fresh logit vector for “where are we in the distribution right
    now?” to hand off to common_sampler_sample(). If you re‑use an old
    cached logit you’d either have to store and reload that vector
    (which llama.cpp doesn’t currently do) or risk sampling from stale data.

    Parameter changes
    
    If you tweak temperature, top‑k, tail free sampling, or any other
    hyperparameter between runs (or even between prompt/instruction mode
    and chat mode), re‑evaluating the last token ensures that those new
    settings are applied to its logit. Otherwise you’d resume with the
    old logit, ignoring your new parameters for that first step.

    Streaming/progress callbacks
    If you show a progress bar or log token‑by‑token probabilities,
    you need a call to llama_decode() to drive those callbacks for that
    last prompt token as well.
    

*/

#endif
