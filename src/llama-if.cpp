#include "arg.h"
#include "common.h"
#include "console.h"
#include "log.h"
#include "sampling.h"
#include "llama-cpp.h"
#include "llama-if.h"
#include "getcwd.h"
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

static double trace_start_time = 0.0;

#define trace(format, ...) do {                                     \
    if (trace_start_time == 0.0) {                                  \
        struct timespec ts;                                         \
    clock_gettime(CLOCK_MONOTONIC, &ts);                            \
        trace_start_time = ts.tv_sec + ts.tv_nsec / 1e9;            \
    }                                                               \
    const char* file = __FILE__;                                    \
    const char* last = strrchr(file, '/');                          \
    if (last != NULL) { file = last + 1; }                          \
    struct timespec ts;                                             \
    clock_gettime(CLOCK_MONOTONIC, &ts);                            \
    double now = ts.tv_sec + ts.tv_nsec / 1e9 - trace_start_time;   \
    fprintf(stderr, "%.6f %s:%d @%s " format, now,                  \
        file, __LINE__, __func__, ##__VA_ARGS__);                   \
} while (0)

static const char * DEFAULT_SYSTEM_MESSAGE = "You are a helpful assistant";

struct context {
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
    std::string                  path_session;
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

static void save_at_readline(struct context& context) {
    context.at_readline.embd_size           = context.embd.size();
    context.at_readline.embd_inp_size       = context.embd_inp.size();
    context.at_readline.session_tokens_size = context.session_tokens.size();
    context.at_readline.n_past              = context.n_past;
    context.at_readline.n_remain            = context.n_remain;
    context.at_readline.n_consumed          = context.n_consumed;
    context.at_readline.n_session_consumed  = context.n_session_consumed;
}

static void restore_at_readline(struct context& context) {
    context.embd.resize(context.at_readline.embd_size);
    context.embd_inp.resize(context.at_readline.embd_inp_size);
    context.session_tokens.resize(context.at_readline.session_tokens_size);
    context.n_past              = context.at_readline.n_past;
    context.n_remain            = context.at_readline.n_remain;
    context.n_consumed          = context.at_readline.n_consumed;
    context.n_session_consumed  = context.at_readline.n_session_consumed;
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

static int parse_params(struct context &context, int argc, char* argv[]) {
    common_params &params = context.params;
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

static int load(struct context &context) {
    LOG_INF("%s: llama backend init\n", __func__);
    context.model = nullptr;
    context.ctx = nullptr;
    context.smpl = nullptr;
    // load the model and apply lora adapter, if any
    LOG_INF("%s: load the model and apply lora adapter, if any\n", __func__);
    context.llama_init = common_init_from_params(context.params);
    context.model = context.llama_init.model.get();
    context.ctx = context.llama_init.context.get();
    if (context.model == NULL) {
        LOG_ERR("%s: error: unable to load model\n", __func__);
        return 1;
    }
    context.vocab = llama_model_get_vocab(context.model);
    context.chat_templates = common_chat_templates_from_model(context.model, context.params.chat_template);
    return 0;
}

static int ggml_init(struct context &context) {
    LOG_INF("%s: llama threadpool init, n_threads = %d\n", __func__, (int)context.params.cpuparams.n_threads);
    context.ggml_reg = ggml_backend_dev_backend_reg(ggml_backend_dev_by_type(GGML_BACKEND_DEVICE_TYPE_CPU));
    auto &reg = context.ggml_reg;
    auto * ggml_threadpool_new_fn = (decltype(ggml_threadpool_new) *) ggml_backend_reg_get_proc_address(reg, "ggml_threadpool_new");
    struct ggml_threadpool_params tpp_batch =
            ggml_threadpool_params_from_cpu_params(context.params.cpuparams_batch);
    struct ggml_threadpool_params tpp =
            ggml_threadpool_params_from_cpu_params(context.params.cpuparams);
    set_process_priority(context.params.cpuparams.priority);
    context.threadpool_batch = NULL;
    if (!ggml_threadpool_params_match(&tpp, &tpp_batch)) {
        context.threadpool_batch = ggml_threadpool_new_fn(&tpp_batch);
        if (!context.threadpool_batch) {
            LOG_ERR("%s: batch threadpool create failed : n_threads %d\n", __func__, tpp_batch.n_threads);
            return 1;
        }
        // Start the non-batch threadpool in the paused state
        tpp.paused = true;
    }
    context.threadpool = ggml_threadpool_new_fn(&tpp);
    if (!context.threadpool) {
        LOG_ERR("%s: threadpool create failed : n_threads %d\n", __func__, tpp.n_threads);
        return 1;
    }
    llama_attach_threadpool(context.ctx, context.threadpool, context.threadpool_batch);
    llama_backend_init();
    llama_numa_init(context.params.numa);
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

static int chat(struct context &context, const char* session, bool existing) {
    context.chat_msgs.clear();
    context.embd.clear();
    context.embd_inp.clear();
    context.session_tokens.clear();
    context.input_tokens.clear();
    context.output_tokens.clear();
    context.output_ss.clear();
    context.assistant_ss.clear();
    context.antiprompt_ids.clear();
    context.is_interacting = false;
    context.input_echo     = false;
    context.display        = false;
    llama_context              * &ctx = context.ctx;
    const llama_model          * &model = context.model;
    common_sampler             * &smpl  = context.smpl;
    common_chat_templates        &chat_templates = context.chat_templates;
    std::vector<common_chat_msg> &chat_msgs      = context.chat_msgs;
    std::vector<llama_token>     &embd_inp       = context.embd_inp;
    common_params                &params         = context.params;
    std::vector<int>             &input_tokens   = context.input_tokens;
    std::vector<int>             &output_tokens  = context.output_tokens;
    std::ostringstream           &output_ss      = context.output_ss;
    context.is_antiprompt        = false;
    context.input_echo           = false;
    context.display              = false;
    context.n_past               = 0;
    context.n_remain             = params.n_predict;
    context.n_consumed           = 0;
    context.n_session_consumed   = 0;
    context.params.n_keep = -1;
    params.interactive_first     = false; // it will be modified later...
    // https://github.com/ggml-org/llama.cpp/issues/1790
    // https://github.com/ggml-org/llama.cpp/issues/1647
    llama_kv_cache_clear(context.ctx);
    int &n_ctx = context.n_ctx;
    n_ctx = llama_n_ctx(ctx);
    int &n_ctx_train = context.n_ctx_train;
    n_ctx_train = llama_model_n_ctx_train(model);
    if (n_ctx > n_ctx_train) {
        LOG_WRN("%s: model was trained on only %d context tokens (%d specified)\n", __func__, n_ctx_train, n_ctx);
    }
    // auto enable conversation mode if chat template is available
    context.has_chat_template = context.chat_templates.has_explicit_template &&
                                context.chat_templates.template_default;
    if (context.params.conversation_mode == COMMON_CONVERSATION_MODE_AUTO) {
        if (context.has_chat_template) {
            LOG_INF("%s: chat template is available, enabling conversation mode (disable it with -no-cnv)\n", __func__);
            context.params.conversation_mode = COMMON_CONVERSATION_MODE_ENABLED;
        } else {
            context.params.conversation_mode = COMMON_CONVERSATION_MODE_DISABLED;
        }
    }
    // in case user force-activate conversation mode (via -cnv) without proper chat template, we show a warning
    if (context.params.conversation_mode && !context.has_chat_template) {
        LOG_WRN("%s: chat template is not available or is not supported. This may cause the model to output suboptimal responses\n", __func__);
    }
    // print chat template example in conversation mode
    if (context.params.conversation_mode) {
        if (context.params.enable_chat_template) {
            LOG_INF("%s: chat template example:\n%s\n", __func__, common_chat_format_example(*context.chat_templates.template_default,
                                            context.params.use_jinja).c_str());
        } else {
            LOG_INF("%s: in-suffix/prefix is specified, chat template will be disabled\n", __func__);
        }
    }
    // print system information
    {
        LOG_INF("\n");
        LOG_INF("%s\n", common_params_get_system_info(context.params).c_str());
        LOG_INF("\n");
    }
    trace("n_ctx: %d\n", (int)n_ctx);
    std::string path_session = prompt_cache_filename(session);
    std::vector<llama_token> &session_tokens = context.session_tokens;
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
    const bool add_bos = llama_vocab_get_add_bos(context.vocab);
    if (!llama_model_has_encoder(model)) {
        GGML_ASSERT(!llama_vocab_get_add_eos(context.vocab));
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
            embd_inp.push_back(llama_vocab_bos(context.vocab));
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
            LOG_INF("%s: using full prompt from session file\n", __func__);
        } else if (n_matching_session_tokens >= embd_inp.size()) {
            LOG_INF("%s: session file has exact match for prompt!\n", __func__);
        } else if (n_matching_session_tokens < (embd_inp.size() / 2)) {
            LOG_WRN("%s: session file has low similarity to prompt (%zu / %zu tokens); will mostly be reevaluated\n",
                    __func__, n_matching_session_tokens, embd_inp.size());
        } else {
            LOG_INF("%s: session file matches %zu / %zu tokens of prompt\n",
                    __func__, n_matching_session_tokens, embd_inp.size());
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
        context.is_interacting = params.interactive_first;
    }
    context.need_to_save_session = !path_session.empty() && n_matching_session_tokens < embd_inp.size();
    // for storing current assistant message, used in conversation mode
    std::ostringstream &assistant_ss  = context.assistant_ss;
    // the first thing we will do is to output the prompt, so set color accordingly
    console::set_display(console::prompt);
    context.display = params.display_prompt;
    std::vector<llama_token> &embd = context.embd;
    // tokenized antiprompts
    std::vector<std::vector<llama_token>> &antiprompt_ids = context.antiprompt_ids;
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
            decoder_start_token_id = llama_vocab_bos(context.vocab);
        }
        embd_inp.clear();
        embd_inp.push_back(decoder_start_token_id);
    }
//  trace("%s:%d context.n_remain: %d\n", __func__, __LINE__, (int)context.n_remain);
    while ((context.n_remain != 0 && !context.is_antiprompt) || params.interactive) {
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
                if (context.n_past + (int) embd.size() >= n_ctx) {
                    if (!params.ctx_shift){
                        LOG_DBG("\n\n%s: context full and context shift is disabled => stopping\n", __func__);
                        break;
                    }
                    if (params.n_predict == -2) {
                        LOG_DBG("\n\n%s: context full and n_predict == -%d => stopping\n", __func__, params.n_predict);
                        break;
                    }
                    const int n_left    = context.n_past - params.n_keep;
                    const int n_discard = n_left / 2;
                    LOG_DBG("context full, swapping: n_past = %d, n_left = %d, n_ctx = %d, n_keep = %d, n_discard = %d\n",
                            context.n_past, n_left, n_ctx, params.n_keep, n_discard);
                    llama_kv_cache_seq_rm (ctx, 0, params.n_keep            , params.n_keep + n_discard);
                    llama_kv_cache_seq_add(ctx, 0, params.n_keep + n_discard, context.n_past, -n_discard);
                    context.n_past -= n_discard;
                    LOG_DBG("after swap: n_past = %d\n", context.n_past);
                    LOG_DBG("embd: %s\n", string_from(ctx, embd).c_str());
                    LOG_DBG("clear session path\n");
                    path_session.clear();
                }
            } else {
                // context extension via Self-Extend
                while (context.n_past >= ga_i + ga_w) {
                    const int ib = (ga_n * ga_i) / ga_w;
                    const int bd = (ga_w / ga_n) * (ga_n - 1);
                    const int dd = (ga_w / ga_n) - ib*bd - ga_w;
                    LOG_DBG("\n");
                    LOG_DBG("shift: [%6d, %6d] + %6d -> [%6d, %6d]\n", ga_i, context.n_past, ib*bd, ga_i + ib*bd, context.n_past + ib*bd);
                    LOG_DBG("div:   [%6d, %6d] / %6d -> [%6d, %6d]\n", ga_i + ib*bd, ga_i + ib*bd + ga_w, ga_n, (ga_i + ib*bd)/ga_n, (ga_i + ib*bd + ga_w)/ga_n);
                    LOG_DBG("shift: [%6d, %6d] + %6d -> [%6d, %6d]\n", ga_i + ib*bd + ga_w, context.n_past + ib*bd, dd, ga_i + ib*bd + ga_w + dd, context.n_past + ib*bd + dd);
                    llama_kv_cache_seq_add(ctx, 0, ga_i,                context.n_past,              ib*bd);
                    llama_kv_cache_seq_div(ctx, 0, ga_i + ib*bd,        ga_i + ib*bd + ga_w, ga_n);
                    llama_kv_cache_seq_add(ctx, 0, ga_i + ib*bd + ga_w, context.n_past + ib*bd,      dd);
                    context.n_past -= bd;
                    ga_i += ga_w / ga_n;
                    LOG_DBG("\nn_past_old = %d, n_past = %d, ga_i = %d\n\n", context.n_past + bd, context.n_past, ga_i);
                }
            }
            // try to reuse a matching prefix from the loaded session instead of re-eval (via n_past)
            if (context.n_session_consumed < (int) session_tokens.size()) {
                size_t i = 0;
                for ( ; i < embd.size(); i++) {
                    if (embd[i] != session_tokens[context.n_session_consumed]) {
//                      LOG_INF("context.n_session_consumed: %d\n", context.n_session_consumed);
                        session_tokens.resize(context.n_session_consumed);
                        break;
                    }
                    context.n_past++;
                    context.n_session_consumed++;
                    if (context.n_session_consumed >= (int) session_tokens.size()) {
                        ++i;
                        break;
                    }
                }
                if (i > 0) {
                    embd.erase(embd.begin(), embd.begin() + i);
                }
            }
//          trace("embd.size(): %d\n", (int) embd.size());
            for (int i = 0; i < (int) embd.size(); i += params.n_batch) {
                int n_eval = (int)embd.size() - i;
                if (n_eval > params.n_batch) {
                    n_eval = params.n_batch;
                }
                if (llama_decode(ctx, llama_batch_get_one(&embd[i], n_eval))) {
                    LOG_ERR("%s : failed to eval\n", __func__);
                    return 1;
                }
                context.n_past += n_eval;
//              trace("context.n_past: %d params.n_batch: %d n_eval: %d to go: %.0f\n",
//                  (int)context.n_past, (int)params.n_batch, n_eval, n_to_go);
                if (context.n_consumed <= embd_inp.size()) { // still processing input
//                  trace("n_consumed: %d embd_inp.size(): %d size_at_readline: %d n_past: %d\n",
//                        (int)context.n_consumed, (int)embd_inp.size(),
//                             context.size_at_readline, context.n_past);
                    if (context.progress < 1.0) {
                        double n = (context.n_consumed  - context.at_readline.embd_inp_size);
                        double d = (embd_inp.size()     - context.at_readline.embd_inp_size);
                        context.progress = n / d;
                        trace("progress: %.6f\n", context.progress);
                        if (llama.progress) { llama.progress(context.progress); }
                    }
                }
//              trace("%s:%d n_past = %d\n", __func__, __LINE__, context.n_past);
                // Display total tokens alongside total time
                if (params.n_print > 0 && context.n_past % params.n_print == 0) {
                    LOG_DBG("\n%s:%d Tokens consumed so far = %d / %d\n",
                            __func__, __LINE__, context.n_past, n_ctx);
                }
//              trace("\n%s:%d Tokens consumed so far = %d / %d\n",
//                      __func__, __LINE__, context.n_past, n_ctx);
            }
            if (!embd.empty() && !path_session.empty()) {
                session_tokens.insert(session_tokens.end(), embd.begin(), embd.end());
                context.n_session_consumed = session_tokens.size();
            }
//          trace("embd.size(): %d\n", (int) embd.size());
        }
        embd.clear();
        if ((int) embd_inp.size() <= context.n_consumed && !context.is_interacting) {
            // optionally save the session on first sample (for faster prompt loading next time)
            if (!path_session.empty() && context.need_to_save_session && !params.prompt_cache_ro) {
                context.need_to_save_session = false;
                trace("\n%s: saving %zd tokens "
                       "to session file '%s'\n", __func__,
                       session_tokens.size(),
                       path_session.c_str());
                llama_state_save_file(ctx, path_session.c_str(), session_tokens.data(), session_tokens.size());
                trace("saved session to %s\n", path_session.c_str());
            }
            const llama_token id = common_sampler_sample(smpl, ctx, -1);
            common_sampler_accept(smpl, id, /* accept_grammar= */ true);
            // LOG_DBG("last: %s\n", string_from(ctx, smpl->prev.to_vector()).c_str());
            embd.push_back(id);
            // echo this to console
            context.input_echo = true;
            // decrement remaining sampling budget
            --context.n_remain;
            LOG_DBG("n_remain: %d\n", context.n_remain);
        } else {
            // some user input remains from prompt or interaction, forward it to processing
            LOG_DBG("embd_inp.size(): %d, n_consumed: %d\n", (int) embd_inp.size(), context.n_consumed);
            while ((int) embd_inp.size() > context.n_consumed) {
                embd.push_back(embd_inp[context.n_consumed]);
                // push the prompt in the sampling context in order to apply repetition penalties later
                // for the prompt, we don't apply grammar rules
                common_sampler_accept(smpl, embd_inp[context.n_consumed], /* accept_grammar= */ false);
                ++context.n_consumed;
                if ((int) embd.size() >= params.n_batch) {
                    break;
                }
            }
        }
        bool interrupted = false;
        if (context.input_echo && context.display) {
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
        if (context.input_echo && (int) embd_inp.size() == context.n_consumed) {
            console::set_display(console::reset);
            context.display = true;
        }
        // if not currently processing queued inputs;
        if ((int)embd_inp.size() <= context.n_consumed) {
            // check for reverse prompt in the last n_prev tokens
            if (!params.antiprompt.empty()) {
                const int n_prev = 32;
                const std::string last_output = common_sampler_prev_str(smpl, ctx, n_prev);
                context.is_antiprompt = false;
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
                            context.is_interacting = true;
                        }
                        context.is_antiprompt = true;
                        break;
                    }
                }
                // check for reverse prompt using special tokens
                llama_token last_token = common_sampler_last(smpl);
                for (std::vector<llama_token> ids : antiprompt_ids) {
                    if (ids.size() == 1 && last_token == ids[0]) {
                        if (params.interactive) {
                            context.is_interacting = true;
                        }
                        context.is_antiprompt = true;
                        break;
                    }
                }
                if (context.is_antiprompt) {
                    LOG_DBG("found antiprompt: %s\n", last_output.c_str());
                }
            }
            // deal with end of generation tokens in interactive mode
            if (llama_vocab_is_eog(context.vocab, common_sampler_last(smpl))) {
                LOG_DBG("found an EOG token\n");
                if (params.interactive) {
                    if (!params.antiprompt.empty()) {
                        // tokenize and inject first reverse prompt
                        const auto first_antiprompt = common_tokenize(ctx, params.antiprompt.front(), false, true);
                        embd_inp.insert(embd_inp.end(), first_antiprompt.begin(), first_antiprompt.end());
                        context.is_antiprompt = true;
                    }
                    if (params.enable_chat_template) {
                        chat_add_and_format("assistant", assistant_ss.str());
                    }
                    trace("%d: <--done--> llama_vocab_is_eog()\n", __LINE__);
                    context.is_interacting = true;
                    llama.output_text("<--done-->");
                    if (!path_session.empty()) {
                        trace("saving %zd tokens to session file '%s'\n",
                               session_tokens.size(),
                               path_session.c_str());
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
                trace("%d: <--done--> interrupted\n", __LINE__);
                llama.output_text("<--done-->");
                context.is_interacting = true;
            }
            if (context.n_past > 0 && context.is_interacting) {
                LOG_DBG("waiting for user input\n");
                if (params.conversation_mode) {
                    LOG("\n> ");
                }
                if (params.input_prefix_bos) {
                    LOG_DBG("adding input prefix BOS token\n");
                    embd_inp.push_back(llama_vocab_bos(context.vocab));
                }
                std::string buffer;
                if (!params.input_prefix.empty() && !params.conversation_mode) {
                    LOG_DBG("appending input prefix: '%s'\n", params.input_prefix.c_str());
                    LOG("%s", params.input_prefix.c_str());
                }
                console::set_display(console::user_input);
                context.display = params.display_prompt;
                const char* line = llama.read_line();
                if (!line) {
                    trace("<--done--> line == null\n");
                    context.is_interacting = true;
                    llama.output_text("<--done-->");
                    trace("<--done--> because line == null\n");
                    trace("ENDS RUNNING THE MODEL\n");
                    break; // ENDS RUNNING THE MODEL
                }
                buffer += line;
                free((void*)line);
//              trace("%s buff: %s\n", __func__, buffer.c_str());
                if (buffer == "<--end-->") {
                    context.is_interacting = true;
                    llama.output_text("<--done-->");
                    trace("%s <--done--> because line == <--end-->\n", __func__);
                    trace("ENDS RUNNING THE MODEL\n");
                    break; // ENDS RUNNING THE MODEL
                } else if (buffer == "<--otr-->") { // off the record
                    buffer = "";
                    restore_at_readline(context);
                    context.is_interacting = true;
                    llama.output_text("<--done-->");
                    trace("%s <--done--> because line == <--end-->\n", __func__);
                }
                // done taking input, reset color
                console::set_display(console::reset);
                context.display = true;
                // Add tokens to embd only if the input buffer is non-empty
                // Entering a empty line lets the user pass control back
                if (buffer.length() > 1) {
                    // append input suffix if any
                    if (!params.input_suffix.empty() && !params.conversation_mode) {
                        LOG_DBG("appending input suffix: '%s'\n", params.input_suffix.c_str());
                        LOG("%s", params.input_suffix.c_str());
                    }
                    LOG_DBG("buffer: '%s'\n", buffer.c_str());
                    save_at_readline(context);
                    context.progress = 0;
                    trace("at_readline.embd_inp_size: %d\n", (int)context.at_readline.embd_inp_size);
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
                    if (context.need_insert_eot && format_chat) {
                        llama_token eot = llama_vocab_eot(context.vocab);
                        embd_inp.push_back(eot == LLAMA_TOKEN_NULL ? llama_vocab_eos(context.vocab) : eot);
                        context.need_insert_eot = false;
                    }
                    embd_inp.insert(embd_inp.end(), line_pfx.begin(), line_pfx.end());
                    embd_inp.insert(embd_inp.end(), line_inp.begin(), line_inp.end());
                    embd_inp.insert(embd_inp.end(), line_sfx.begin(), line_sfx.end());
                    for (size_t i = context.at_readline.embd_inp_size; i < embd_inp.size(); ++i) {
                        const llama_token token = embd_inp[i];
                        output_tokens.push_back(token);
                        output_ss << common_token_to_piece(ctx, token);
                    }
                    // reset assistant message
                    assistant_ss.str("");
                    context.n_remain -= line_inp.size();
                    trace("n_remain: %d embd_inp: %d\n", context.n_remain, (int)embd_inp.size());
                } else {
                    LOG_DBG("empty line, passing control back\n");
                }
                context.input_echo = false; // do not echo this again
            }
            if (context.n_past > 0) {
                if (context.is_interacting) {
                    common_sampler_reset(smpl);
                }
                context.is_interacting = false;
            }
        }
        // end of generation
        if (!embd.empty() && llama_vocab_is_eog(context.vocab, embd.back()) && !(params.interactive)) {
            LOG(" [end of text]\n");
            trace(" [end of text]\n");
            break;
        }
        // In interactive mode, respect the maximum number of tokens and drop back to user input when reached.
        // We skip this logic when n_predict == -1 (infinite) or -2 (stop at context size).
        if (params.interactive && context.n_remain <= 0 && params.n_predict >= 0) {
            context.n_remain = params.n_predict;
            context.is_interacting = true;
            llama.output_text("<--done-->");
            trace("%d: <--done--> context.n_remain <= 0\n", __LINE__);
        }
    }
    if (!path_session.empty()) {
        trace("\n%s: saving final output %zd tokens "
               "to session file '%s'\n", __func__,
               session_tokens.size(),
               path_session.c_str());
        llama_state_save_file(ctx, path_session.c_str(),
                              session_tokens.data(), session_tokens.size());
    }
    LOG("\n\n");
    common_perf_print(ctx, smpl);
    common_sampler_free(smpl);
    return 0;
}

static void ggml_free(struct context &context) {
    llama_detach_threadpool(context.ctx);
    llama_backend_free();
    auto * ggml_threadpool_free_fn = (decltype(ggml_threadpool_free) *)
        ggml_backend_reg_get_proc_address(context.ggml_reg, "ggml_threadpool_free");
    ggml_threadpool_free_fn(context.threadpool);
    ggml_threadpool_free_fn(context.threadpool_batch);
}

static struct context *context;

int llama_load(int argc, char* argv[]) {
    context = new struct context();
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

