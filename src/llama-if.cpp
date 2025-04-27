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

typedef std::vector<llama_token> llama_tokens_t;
typedef std::vector<llama_tokens_t> array_of_llama_tokens_t;

enum {
    mode_input = 0,
    mode_generating = 1,
    mode_otr = 2
};

static const char* modes[] = { "input", "generating", "otr" };

struct state {
    ggml_backend_reg_t           ggml_reg         {nullptr};
    struct ggml_threadpool     * threadpool       {nullptr};
    struct ggml_threadpool     * threadpool_batch {nullptr};
    common_init_result           llama_init;
    std::string                  filename;
    llama_context              * ctx   {nullptr};
    const llama_model          * model {nullptr};
    common_sampler             * smpl  {nullptr};
    const llama_vocab          * vocab {nullptr};
    common_params                params;
    common_chat_templates        templates;
    std::vector<common_chat_msg> messages;
    llama_tokens_t               tokens;
    llama_tokens_t               input;
    llama_tokens_t               session_tokens;
    size_t n_tokens_saved       {0}; // last saved session_tokens.size()
    int  n_ctx                  {0};
    int  mode                  {-1}; // unknown
    int  n_sys_prompt_tokens    {0}; // keep at the head off session_tokens
    int  n_past                 {0}; // total tokens currently in KV‑cache
    int  ga_i                   {0};
    bool has_chat_template      {false};
    bool is_interacting         {false};
    bool need_insert_eot        {false};
    bool interrupted            {false};
};

static void print_usage(int argc, char ** argv) {
    (void)argc; (void)argv;
}

static bool file_exists(const std::string & path) {
    std::ifstream f(path.c_str());
    return f.good();
}

static double now() { // in seconds()
    struct timespec ts;
    timespec_get(&ts, TIME_UTC);
    return ts.tv_sec + ts.tv_nsec / 1e9;
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
        llama.error("unable to load model");
        return 1;
    }
    state.vocab = llama_model_get_vocab(state.model);
    state.templates = common_chat_templates_from_model(state.model,
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
    llama_attach_threadpool(state.ctx, state.threadpool,
                            state.threadpool_batch);
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

static std::string& prompt_cache_folder() {
    static std::string prompts;
    if (prompts.empty()) {
        const char* cwd = get_cwd();
        prompts = std::string(cwd) + "/prompts";
//      trace("%s\n", prompts.c_str());
        if (mkdir(prompts.c_str(), S_IRWXU) != 0 && errno != EEXIST) {
            trace("failed to create prompts folder: %s\n", prompts.c_str());
            llama.error("failed to create prompts folder: %s\n");
            prompts = "";
        }
    }
    return prompts;
}

static std::string filename(const char* session) {
    std::string& prompts = prompt_cache_folder();
    if (prompts.empty()) { return ""; }
    return prompts + "/" + std::string(session);
}

static double filesize(const char* fn) {
    struct stat st = {};
    if (stat(fn, &st) == 0) {
        return (double)st.st_size;
    } else {
        trace("error: stat failed on '%s'\n", fn);
        return 0;
    }
}

static void clear(struct state &state) {
    state.messages.clear();
    state.tokens.clear();
    state.input.clear();
    state.session_tokens.clear();
    state.n_tokens_saved       = 0;
    state.is_interacting       = false;
    state.n_ctx                = 0;
    state.mode                 = -1; // unknown
    state.n_sys_prompt_tokens  = 0;
    state.n_past               = 0;
    state.ga_i                 = 0;
    state.has_chat_template    = false;
    state.is_interacting       = false;
    state.need_insert_eot      = false;
}

const char* field_n_sys_prompt_tokens = "\"n_sys_prompt_tokens\": ";

static void read_int(const std::string &json, const char* key, int &field) {
    auto pos = json.find(key);
    if (pos != std::string::npos) {
        int v = -1;
        if (sscanf(json.c_str() + pos + strlen(key), "%d", &v) == 1) {
            field = v;
        } else {
            trace("warning: .meta is missing %s\n", key);
        }
    }
}

static void load_meta(struct state &state) {
    std::ifstream meta{ state.filename + ".meta" };
    if (!meta) {
        trace("warning: .meta not found\n");
        return;
    }
    std::ostringstream data;
    data << meta.rdbuf();
    std::string json = data.str();
    read_int(json,field_n_sys_prompt_tokens, state.n_sys_prompt_tokens);
}

static int load_session(struct state &state) {
    const char* fn = state.filename.c_str();
    trace("attempting to load saved session from '%s'\n", fn);
    if (!file_exists(state.filename)) {
        trace("file does not exist, will create: %s\n", fn);
    } else if (file_is_empty(state.filename)) {
        trace("session file is empty. A new session will be initialized.\n");
    } else { // The file exists and is not empty
        state.session_tokens.resize(state.n_ctx);
        size_t n_token_count_out = 0;
        if (!llama_state_load_file(state.ctx, fn,
                                   state.session_tokens.data(),
                                   state.session_tokens.capacity(),
                                   &n_token_count_out)) {
            trace("failed to load session file '%s'\n", fn);
            return 1;
        }
        assert(n_token_count_out > 0);
        llama.info.logits_bytes = filesize(fn);
        state.session_tokens.resize(n_token_count_out); // truncate
        state.n_tokens_saved = n_token_count_out;
        state.n_sys_prompt_tokens = -1;
        load_meta(state);
        trace("loaded a session %d tokens (sys prompt: %d)\n",
               (int)state.session_tokens.size(), state.n_sys_prompt_tokens);
    }
    return 0;
}

static void save_meta(const struct state &state) {
    std::ofstream meta{ state.filename + ".meta" };
    meta
      << "{\n"
      << field_n_sys_prompt_tokens << state.n_sys_prompt_tokens
      // don't forget coma newline when there are more fields: ",\n"
      << "\n}";
    if (meta.fail()) {
        trace("error: failed to save metadata");
    }
}

static void save_session(struct state &state) {
    size_t n = (int)state.session_tokens.size();
    assert(n <= state.n_ctx - 4);
    trace("session_tokens.size(): %d n_tokens_saved: %d\n",
          (int)n, (int)state.n_tokens_saved);
    assert(n >= state.n_tokens_saved);
    if (n > state.n_tokens_saved) {
        const char* fn = state.filename.c_str();
        trace("saving %d tokens to '%s'\n", (int)n, fn);
        bool b = llama_state_save_file(state.ctx, fn,
                                       state.session_tokens.data(), n);
        if (b) {
            trace("saved %d tokens to %s\n", (int)n, fn);
            state.n_tokens_saved = n;
            llama.info.logits_bytes = filesize(fn);
            save_meta(state);
        } else {
            trace("error: failed to save session\n");
            llama.error("failed to save chat state");
        }
    } else {
        trace("session did not change: won't be saved\n");
    }
}

static std::string tokens_to_string(const struct state &state,
        const llama_tokens_t &tokens, int from = 0, int to = -1) {
    if (to < 0) { to = (int)tokens.size(); }
    std::ostringstream ss;
    for (int i = from; i < to; i++) {
        ss << common_token_to_piece(state.ctx, tokens[i]).c_str();
    }
    return ss.str();
}

static std::string add_and_format(struct state &state, const std::string & role,
                                  const std::string & content) {
    common_chat_msg message{role, content};
    std::string formatted = common_chat_format_single(
        *state.templates.template_default,
        state.messages, message, role == "user",
        state.params.use_jinja);
    state.messages.push_back({role, content});
//  trace("formatted: '%s'\n", formatted.c_str());
    return formatted;
}

static int tokenize_prompt(struct state &state, llama_tokens_t &p) {
//  trace("tokenize system prompt\n");
    // format the system prompt in conversation mode
    // (fallback to default if empty)
    auto prompt = state.params.enable_chat_template
        ? add_and_format(state, "system", state.params.prompt.empty() ?
                              DEFAULT_SYSTEM_MESSAGE : state.params.prompt)
        // otherwise use the prompt as is
        : state.params.prompt;
    p = common_tokenize(state.ctx, prompt, true, true);
    // Should not run without any tokens
    if (p.empty()) {
        if (llama_vocab_get_add_bos(state.vocab)) {
            p.push_back(llama_vocab_bos(state.vocab));
            trace("input was considered empty but bos was added: %s\n",
                  string_from(state.ctx, p).c_str());
        } else {
            trace("input is empty\n");
            llama.error("missing system prompt");
            return 1;
        }
    }
    // we will not save sessions that only contain system prompt
//  trace("prompt: \"%s\"\n", prompt.c_str());
//  trace("tokens: %s\n", string_from(state.ctx, p).c_str());
    return 0;
}

static void dump_interactive_info(const struct state &state) {
    trace("interactive mode on.\n");
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

static void dump_prompt(const struct state &state) {
    if (state.params.verbose_prompt) {
        trace("prompt: '%s'\n", state.params.prompt.c_str());
        trace("number of tokens in prompt = %u\n", (int)state.input.size());
        for (int i = 0; i < (int)state.input.size(); i++) {
            trace("%6d -> '%s'\n", state.input[i],
                  common_token_to_piece(state.ctx, state.input[i]).c_str());
        }
    }
}

static void info(struct state &state) {
    const int n = (int)state.session_tokens.size();
    const double g = llama.info.generated;
    llama.info.context_tokens = state.n_ctx;
    llama.info.session_tokens = n;
    llama.info.tps = llama.info.time < __DBL_EPSILON__ ?
        0 :  g / llama.info.time;
    llama.info.average_token = n == 0 ? 0 : llama.info.sum / (double)g;
/*
    trace("context_tokens: %d session_tokens: %d logits: %.1fMB\n",
          llama.info.context_tokens, n,
          llama.info.logits_bytes / (1024.0 * 1024.0));
    trace("generated: %.0f tps: %.1f avg: %.1f progress: %f time: %.3fs\n",
          llama.info.generated, llama.info.tps,
          llama.info.average_token, llama.info.progress,
          llama.info.time);
*/
}

/*
    context_extension_via_self_extend()
    Theory of operation
    
    When you run a model on more tokens than it was originally trained
    for (n_ctx > n_ctx_train), you can’t simply shove all past
    key/value pairs into one giant cache. Instead, “group attention”
    splits the long context into ga_n interleaved groups of
    width ga_w/ga_n.
    
    Each iteration here:
    Select a window of ga_w tokens starting at ga_i.
    Copy that window’s KV entries to the current tail of the cache (seq_add).

    Divide (downsample) those entries by ga_n so that only every ga_n‑th
    key/value pair remains (seq_div). That enforces the group‑attention
    pattern (each head only attends within its group).

    Fix alignment by a small extra shift (dd).

    Discard the oldest bd tokens from the effective context state.n_past -= bd.

    By repeating this, you “slide” the attention window across the entire
    past sequence, compressing older tokens in a grouped fashion so that
    the model still attends locally yet can see far beyond its
    original context size.
*/


static void context_extension_via_self_extend(struct state &state) {
    /*
     ga_i   the current “group‑attention” index or offset into the past context.
            It starts at 0 and increments by one group‑window each iteration.
            Passed by reference so the caller can continue using the updated
            offset.
            
     ga_n   the number of attention groups. If > 1, we partition long
            contexts into ga_n interleaved streams.
            
     ga_w   the group‑window width, i.e. how many tokens per group before
            we shift. Must be a multiple of ga_n (ensures even splits).
            
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
    int &ga_i = state.ga_i;
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
        // replicates ib × bd tokens’ worth of KV entries, moving them
        // from positions [ga_i, ga_i+…] into the end at state.n_past.
        llama_kv_cache_seq_div(state.ctx, 0, ga_i + ib * bd,
                               ga_i + ib * bd + ga_w, ga_n);
        // within the newly‑added window of size ga_w, it downsamples
        // every ga_n‑th KV entry (i.e. group‑attention division),
        // effectively compressing that slice by a factor of ga_n
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
      beyond the first keep, then recompute logits on the remaining
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
    keep                     number of tokens to preserve at front
    state.n_past             total tokens currently in KV‑cache
    n_left                   = state.n_past – keep, tokens beyond keep
    n_discard                = n_left / 2, half the excess to drop
    keep                     = keep + n_discard, new split point
*/

static bool infinite_text_generation_via_context_shifting(struct state &state) {
    assert(0 <= state.mode && state.mode <= 2);
    // called only when (state.n_past + batch) >= state.n_ctx - 4
    // if we run out of context:
    // - take the n_sys_prompt_tokens first tokens from the original prompt
    // - take half of the last (n_ctx - keep) tokens and
    //                          recompute the logits in batches
    // return true if we cannot shift
    assert(state.params.ctx_shift);
    if (!state.params.ctx_shift){
        trace("context full and context shift is disabled => stopping\n");
        return true;
    }
    assert(state.params.n_predict == -1); // expected inifinite
    if (state.params.n_predict == -2) {
        trace("context full and n_predict == -%d => stopping\n",
              state.params.n_predict);
        return true;
    }
    const int tokens = (int)state.tokens.size();
    const int keep = state.n_sys_prompt_tokens;
    assert(tokens > 0);
    // +1 space for at least one extra token after decode:
    const int overflow = (state.n_past + tokens + 1) - keep;
    if (overflow <= 0) { return false; }
#ifndef LLAMA_DISCARD_HALF //
    const int discard = (overflow + 1) / 2; // how many to drop
#else // true sliding window
    const int discard = std::min(overflow, tokens);
#endif
    assert(discard > 0);
    trace("shifting: total: %d keep: %d discard: %d\n",
          state.n_past + tokens, keep, discard);
    // 1) drop [keep .. old n_past)
    llama_kv_cache_seq_rm(
      state.ctx, /*seq_id*/ 0,
      /*p0*/      keep,
      /*p1*/      keep + discard
    );
    llama_kv_cache_seq_add(
      state.ctx, /*seq_id*/ 0,
      /*p0*/      keep + discard,
      /*p1*/      state.n_past,
      /*delta*/  -discard
    );
    // shrink n_past by exactly what we dropped
    state.n_past -= discard;
    trace("after shift: n_past=%d\n", state.n_past);
    // Now trim session_tokens to match the shorter context window:
    // erase the same block of tokens [keep .. keep+n_discard)
    if (state.mode != mode_otr && // off the record does not affect session
        (int)state.session_tokens.size() > keep + discard) {
        state.session_tokens.erase(
            state.session_tokens.begin() + keep,
            state.session_tokens.begin() + keep + discard
        );
        state.n_tokens_saved = keep; // everything after changed
        trace("state.session_tokens.size(): %d\n", (int)state.session_tokens.size());
    }
    return false;
}

static bool group_attention(struct state &state) {
    if (state.params.grp_attn_n == 1) {
        // future KV cache size after decoding of tokens
        const int kv = state.n_past + (int)state.tokens.size();
        if (kv >= state.n_ctx - 4) {
            if (infinite_text_generation_via_context_shifting(state)) {
                trace("Context Overflow");
                llama.error("Context Overflow");
                return false;
            }
        }
    } else {
        context_extension_via_self_extend(state);
    }
    return true;
}

static int decode_batch(struct state &state, struct llama_batch batch) {
    while (llama.in_background()) { llama.wait_foreground(); }
    for (;;) {
        assert(batch.n_tokens > 0); // because llama_decode() failes otherwise
        group_attention(state);
        int r = llama_decode(state.ctx, batch);
        if (r == 0) {
            return 0;
        } else {
            trace("llama_decode() %d\n", r);
            if (!llama.in_background()) {
                llama.error("failed to decode token"); // fatal in foreground
                return r;
            }
        }
        while (llama.in_background()) { llama.wait_foreground(); }
    }
}

static int decode(struct state &state) {
//  trace("tokens.size(): %d\n", (int)state.tokens.size());
    assert(0 <= state.mode && state.mode <= 2);
    int max_size = state.n_ctx - 4;
    // Ensure the input doesn't exceed the context size by truncating tokens.
    if ((int)state.tokens.size() > max_size) {
        const int skipped_tokens = (int)state.tokens.size() - max_size;
        state.tokens.resize(max_size);
        trace("input too long: skipped %d tokens", skipped_tokens);
    }
    bool report_progress = state.mode == mode_generating &&
        (int)state.tokens.size() > state.params.n_batch * 4;
    for (int i = 0; i < (int)state.tokens.size(); i += state.params.n_batch) {
        int n = (int)state.tokens.size() - i;
        if (n > state.params.n_batch) { n = state.params.n_batch; }
        auto batch = llama_batch_get_one(&state.tokens[i], n);
        int r = decode_batch(state, batch);
        if (r != 0) {
            trace("error: failed to decode tokens error: %d "
                  "mode: %s i: %d size:%d\n",
                  r, modes[state.mode], i, (int)state.tokens.size());
            // TODO: non-fatal warning here
            return r;
        }
        llama.info.generated += n;
        if (report_progress) {
            const double nominator = (double)(i + n);
            const double denominator = (double)state.tokens.size();
            llama.info.progress = denominator == 0 ?
                0 : nominator / denominator;
//          trace("progress: %.6f i:%d n_eval:%d state.tokens.size():%d\n",
//                 progress, i, n_eval, (int)state.tokens.size());
            info(state);
            if (llama.progress) { llama.progress(llama.info.progress); }
        }
        state.n_past += n;
    }
    llama.info.progress = 1.0;
    if (report_progress && llama.progress) { llama.progress(1.0); }
    return 0;
}

static void insert_user_input(struct state &state, std::string &input) {
    bool format = state.params.enable_chat_template;
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
    const auto line_pfx = common_tokenize(state.ctx, pfx, false, true);
    const auto line_inp = common_tokenize(state.ctx, user_input, false, format);
    const auto line_sfx = common_tokenize(state.ctx, sfx, false, true);
//  trace("input tokens: %s\n", string_from(state.ctx, line_inp).c_str());
    // if user stop generation mid-way, add EOT to finish model's last response
    if (state.need_insert_eot && format) {
        llama_token eot = llama_vocab_eot(state.vocab);
        state.input.push_back(eot == LLAMA_TOKEN_NULL ?
            llama_vocab_eos(state.vocab) : eot);
        state.need_insert_eot = false;
    }
    auto &inp = state.input;
    inp.insert(inp.end(), line_pfx.begin(), line_pfx.end());
    inp.insert(inp.end(), line_inp.begin(), line_inp.end());
    inp.insert(inp.end(), line_sfx.begin(), line_sfx.end());
//  trace("input: %d\n", (int)inp.size());
}

static int decode_input(struct state &state) { // also handle empty input
    if (state.input.size() == 0) { return 0; }
    state.mode = mode_input;
    common_sampler_reset(state.smpl);
    double start = now();
    for (auto t : state.input) {
        common_sampler_accept(state.smpl, t, /*accept_grammar=*/false);
    }
    state.tokens = std::move(state.input);
    int r = decode(state);
    if (r != 0) { return r; }
    state.session_tokens.insert(
        state.session_tokens.end(),
        state.tokens.begin(),
        state.tokens.end()
    );
    state.tokens.clear();
    llama.info.time += now() - start;
    return 0;
}

static bool generate(struct state &state) {
    double start = now();
    common_sampler_reset(state.smpl);
    state.mode = mode_generating;
    for (;;) {
        const llama_token id = common_sampler_sample(state.smpl, state.ctx, -1);
        common_sampler_accept(state.smpl, id, /*accept_grammar=*/true);
        state.tokens = { id };
        int r = decode(state);
        if (r != 0) {
            llama.info.time += now() - start;
            llama.error("Error: failed to decode tokens");
            return false;
        }
        // end‐of‐generation handling
        const bool is_eog = llama_vocab_is_eog(state.vocab, id);
        if (!is_eog) {
            std::string s = common_token_to_piece(state.ctx, id,
                                                  state.params.special);
            if (s.length() > 0) {
                state.interrupted = !llama.output(s.c_str());
                llama.info.sum += s.length();
            }
        }
        state.tokens.clear();
        // push to session history
        state.session_tokens.push_back(id);
        if (is_eog || state.interrupted) {
            llama.output("<--done-->");
            state.is_interacting = true;
            if (is_eog) {
                save_session(state);
            }
            llama.info.time += now() - start;
            return true; // done
        }
    }
}

static int init_chat(struct state &state) {
    clear(state);
    llama_kv_cache_clear(state.ctx);
    state.n_ctx = llama_n_ctx(state.ctx);
    int n_ctx_train = llama_model_n_ctx_train(state.model);
    llama.info.context_tokens = state.n_ctx;
    if (state.n_ctx > n_ctx_train) {
        trace("model was trained on only %d context tokens (%d specified)\n",
               n_ctx_train, state.n_ctx);
        llama.error("context is too large");
        return 1;
    }
    const bool add_bos = llama_vocab_get_add_bos(state.vocab);
//  trace("n_ctx: %d, add_bos: %d\n", state.n_ctx, add_bos);
    if (!llama_model_has_encoder(state.model)) {
        assert(!llama_vocab_get_add_eos(state.vocab));
    }
    state.has_chat_template = state.templates.has_explicit_template &&
                              state.templates.template_default;
    assert(state.has_chat_template); // MUST HAVE
    if (state.params.conversation_mode == COMMON_CONVERSATION_MODE_AUTO) {
        if (state.has_chat_template) {
            state.params.conversation_mode = COMMON_CONVERSATION_MODE_ENABLED;
        } else {
            assert(false);
            state.params.conversation_mode = COMMON_CONVERSATION_MODE_DISABLED;
        }
    }
    state.smpl = common_sampler_init(state.model, state.params.sampling);
    if (!state.smpl) {
        trace("%failed to initialize sampling subsystem\n");
        llama.error("failed to initialize sampling subsystem");
        return 1;
    } else {
//      trace("seed: %u\n",     common_sampler_get_seed(state.smpl));
//      trace("params: \n%s\n", state.params.sampling.print().c_str());
//      trace("chain: %s\n",    common_sampler_print(state.smpl).c_str());
    }
    // always used with "-i" and "-cnv"
    assert(state.params.conversation_mode);
    assert(state.params.interactive);
    // number of tokens to predict
    // (default: -1, -1 = infinity, -2 = until context filled)
    assert(state.params.n_predict == -1); // expecting infinity
//  dump_interactive_info(state);
    const int ga_n = state.params.grp_attn_n;
    const int ga_w = state.params.grp_attn_w;
    if (ga_n != 1) {
        trace("self-extend: n_ctx_train = %d, grp_attn_n = %d, "
              "grp_attn_w = %d\n",
              n_ctx_train, ga_n, ga_w);
        assert(ga_n > 0);         // ga_n must be positive
        assert(ga_w % ga_n == 0); // ga_w must be a multiple of ga_n
        // n_ctx_train must be a multiple of grp_attn_w
        assert(n_ctx_train % ga_w == 0);
        // n_ctx must be at least n_ctx_train * grp_attn_n
        assert(state.n_ctx >= n_ctx_train * ga_n);
    }
    return 0;
}

static int process_system_propmt(struct state &state) {
//  dump_prompt(state);
    if (llama_model_has_encoder(state.model)) {
        assert(false); // NO ENCODER SUPPORT YET
        const int size = state.input.size();
        llama_token * data = state.input.data();
        if (llama_encode(state.ctx, llama_batch_get_one(data, size))) {
            trace("%s : failed to eval\n", __func__);
            return 1;
        }
        llama_token decoder_start_token_id =
            llama_model_decoder_start_token(state.model);
        if (decoder_start_token_id == LLAMA_TOKEN_NULL) {
            decoder_start_token_id = llama_vocab_bos(state.vocab);
        }
        state.input.clear();
        state.input.push_back(decoder_start_token_id);
    }
    if (decode_input(state) != 0) { return 1; }
    state.n_tokens_saved = (int)state.session_tokens.size();
    state.n_sys_prompt_tokens = (int)state.session_tokens.size();
    trace("n_sys_prompt_tokens: %d\n", state.n_sys_prompt_tokens);
    return 0;
}

static int process_loaded_session(struct state &state,
                                  int system_prompt_tokens) {
    if ((int)state.session_tokens.size() > state.n_ctx - 4) {
        trace("session is too long (%d tokens, max %d)\n",
              (int)state.session_tokens.size(), state.n_ctx - 4);
        llama.error("session is too long"); // fatal
        return 1;
    }
    trace("n_sys_prompt_tokens: %d\n", state.n_sys_prompt_tokens);
    if (state.n_sys_prompt_tokens < 0) {
        // special case, older sessions for which the system prompt
        // token count was not saved and thus unknown. Mitigation is
        // an assumption that session was saved with the same system
        // prompt:
        state.n_sys_prompt_tokens = system_prompt_tokens;
        trace("n_sys_prompt_tokens:= %d\n", state.n_sys_prompt_tokens);
    }
    llama_token last = state.session_tokens.back();
    state.session_tokens.pop_back();
    state.n_past = (int)state.session_tokens.size();
    common_sampler_accept(state.smpl, last, /*accept_grammar=*/false);
    state.tokens = { last };
    state.mode = mode_input;
    if (decode(state) != 0) {
        llama.error("Error: failed to decode session last token");
        return 1;
    }
    state.n_past++;
    state.session_tokens.push_back(last);
    state.tokens.clear();
    // remove any "future" tokens that we might have inherited from
    // the previous session...
//  trace("remove any `future` tokens that we might have inherited\n");
    // seq_id: -1 means widlcard clear from ALL sequences
    llama_kv_cache_seq_rm(state.ctx, -1, state.session_tokens.size(), -1);
//  llama_kv_cache_seq_rm() removes tail after session_tokens.size()
    return 0;
}

static bool off_the_record(struct state &state, const std::string &input) {
    if (input.rfind("[otr", 0) != 0) { return false; }
    assert(state.messages.size() > 0); // must already have messages
    assert(state.tokens.size() == 0);
    assert(state.input.size() == 0);
    int otr_max = state.n_ctx - 4;
    size_t colon = input.find(':');
    size_t close = input.find(']');
    assert(close != std::string::npos);
    if (colon != std::string::npos && colon < close) {
        otr_max = std::stoi(input.substr(colon+1, close-(colon+1)));
    }
    size_t start = close + 1;
    size_t end   = input.rfind("[/otr]");
    assert(end  != std::string::npos);
    std::string body = input.substr(start, end - start);
//  trace("body: %s\n", body.c_str());
    state.mode = mode_otr;
    insert_user_input(state, const_cast<std::string&>(body));
    for (auto t : state.input) {
        common_sampler_accept(state.smpl, t, false); // grammar: false
    }
    state.tokens = std::move(state.input);
    int r = decode(state);
    if (r != 0) { return 1; }
    // not inserting decoded tokens into session, just throw them away:
    state.tokens.clear();
    std::ostringstream ss;
    for (int i = 0; i < otr_max && r == 0; i++) {
        llama_token id = common_sampler_sample(state.smpl, state.ctx, -1);
        common_sampler_accept(state.smpl, id, true); // grammar: true
        state.tokens = {id};
        r = decode(state);
        if (r != 0) {
            trace("warning: failed to decode tokens error: %d "
                  "i: %d otr_max: %d\n", r, i, (int)otr_max);
            break;
        }
        state.n_past++;
        ss << common_token_to_piece(state.ctx, id, /*special:*/false);
        if (llama_vocab_is_eog(state.vocab, id)) {
            break;
        }
    }
    std::string s = ss.str();
    llama.output(s.c_str());
    llama.info.sum += s.length();
//  llama.error("error test");  // DEBUG: uncomment to test errors to UI
    llama.output("<--done-->");
    assert(r == 0);
    r = init_chat(state);
    assert(r == 0);
    r = load_session(state);
    assert(r == 0);
    process_loaded_session(state, state.n_sys_prompt_tokens);
    assert(r == 0);
    return r == 0;
}

static bool read_user_input(struct state &state) {
    for (;;) {
//      trace("waiting for llama.input()\n");
        info(state);
        const char* str = llama.input();
        bool end = !str || strcmp(str, "<--end-->") == 0;
        std::string text = end ? "" : str;
        free((void*)str);
        if (end) {
            llama.output("<--done-->");
//          trace("line is null or <--end-->\n");
            return false;
        }
        if (state.params.escape) { string_process_escapes(text); }
        if (off_the_record(state, text)) {
            // will do llama.input() again
        } else {
            insert_user_input(state, text);
            state.is_interacting = false;
            return true;
        }
    }
}

static int chat(struct state &state, const char* session_id, bool existing) {
    int r = init_chat(state);
    if (r != 0) { return r; }
    // Always tokenize system prompt even if we are going to load session.
    // The reason: we need to know system_prompt.size() in case meta is
    // missing...
    llama_tokens_t system_prompt;
    if (tokenize_prompt(state, system_prompt) != 0) { return 1; }
   // loading session or using system prompt (exclusive)
    state.filename = filename(session_id);
    if (state.filename.empty())   { return 1; }
    if (load_session(state) != 0) { return 1; }
    if (state.session_tokens.empty()) {
        // this is new session - need to decode system prompt:
        state.input = std::move(system_prompt);
        r = process_system_propmt(state);
    } else { // NOT EMPTY: state.session_tokens
        r = process_loaded_session(state, (int)system_prompt.size());
    }
    if (r != 0) { return r; }
    llama.info.session_tokens = state.n_tokens_saved;
//  trace("generate: n_ctx = %d, n_batch = %d, n_predict = %d, \n",
//         state.n_ctx, state.params.n_batch,
//         state.params.n_predict);
    state.interrupted = false;
    state.is_interacting = true;
    bool done = false;
    while (state.is_interacting && !done) {
        if (!read_user_input(state)) {
            done = true;
        } else {
            assert(!state.is_interacting);
            if (decode_input(state) != 0) { return 1; }
            if (!generate(state)) { done = true; }
            trace("messages: %d session_tokens: %d\n",
                (int)state.messages.size(),
                (int)state.session_tokens.size());
        }
    }
//  trace("saving final output of %d tokens\n",
//        (int)state.session_tokens.size());
    save_session(state);
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
    By popping the last token back into state.tokens and running it through
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

