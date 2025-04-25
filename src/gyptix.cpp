#include <assert.h>
#include <dirent.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <pthread.h>
#include <time.h>
#include <unistd.h>
#include <mach-o/dyld.h> // For _NSGetExecutablePath

#include <string>
#include <ctime>

#include "gyptix.h"
#include "getcwd.h"
#include "llama-if.h"
#include "trace.h"
#include "git_hash.h"

extern "C" {

#define countof(a) (sizeof(a) / sizeof((a)[0]))

static char* args[1024] = { 0 };
static char** argv = args;

enum {
    event_none      = 0,
    event_quit      = 1,
    event_question  = 2,
    event_answer    = 3,
    event_interrupt = 4
};

static int event = 0;

static pthread_mutex_t lock = PTHREAD_MUTEX_INITIALIZER;
static pthread_cond_t  cond = PTHREAD_COND_INITIALIZER;
static pthread_t       thread;

static char*       question;
static std::string answer;
static std::string message; // last error message

static bool answering   = false;
static bool running     = false;
static bool existing    = false;
static bool quit        = false;
static bool interrupted = false;
static char* session_id = nullptr;

static void sleep_for_ns(long nsec) {
    struct timespec delay = { nsec / 1000000000, nsec % 1000000000 };
    pselect(0, NULL, NULL, NULL, &delay, NULL);
}

static bool validUTF8(const std::string& s) {
    const unsigned char* p = reinterpret_cast<const unsigned char*>(s.data());
    size_t len = s.size(), i = 0;
    while (i < len) {
        if (p[i] <= 0x7F) { i++; continue; } // ASCII (1 byte)
        size_t seq_len;
        if ((p[i] & 0xE0) == 0xC0) { seq_len = 2; }  // 110xxxxx -> 2-byte
        else if ((p[i] & 0xF0) == 0xE0) { seq_len = 3; } // 1110xxxx -> 3-byte
        else if ((p[i] & 0xF8) == 0xF0) { seq_len = 4; } // 11110xxx -> 4-byte
        else return false; // Invalid leading byte
        if (i + seq_len > len) return false; // Truncated sequence
        for (size_t j = 1; j < seq_len; j++) {
            if ((p[i + j] & 0xC0) != 0x80) return false; // Not a valid continuation byte
        }
        i += seq_len;
    }
    return true;
}

#if defined(__aarch64__) || defined(__arm64__)
    #define APPLE_SILICON 1
#else
    #define APPLE_SILICON 0
#endif

/*
 https://www.ibm.com/granite/docs/models/granite/
 ### system prompt for regular multi-turn conversations
 Today's Date: December 14, 2024.
 You are Granite, developed by IBM. You are a helpful AI assistant.
 
 ### system prompt for function-calling tasks
 Knowledge Cutoff Date: April 2024.
 Today's Date: December 16, 2024.
 You are Granite, developed by IBM.
 You are a helpful AI assistant with access to the following tools.
 When a tool is required to answer the user's query,
 respond with <|tool_call|> followed by a JSON list of tools used.
 If a tool does not exist in the provided list of tools,
 notify the user that you do not have the ability to fulfill the request.
 
 ### system prompt for RAG generation tasks
 Knowledge Cutoff Date: April 2024.
 Today's Date: December 16, 2024.
 You are Granite, developed by IBM. Write the response to the user's
 input by strictly aligning with the facts in the provided documents.
 If the information needed to answer the question is not available
 in the documents, inform the user that the question cannot be answered
 based on the available data.
 
 ### tools
 <|start_of_role|>system<|end_of_role|>Knowledge Cutoff Date: April 2024.
 Today's Date: December 16, 2024.
 You are Granite, developed by IBM. You are a helpful AI assistant with
 access to the following tools. When a tool is required to answer the
 user's query, respond with <|tool_call|> followed by a JSON list of tools used.
 If a tool does not exist in the provided list of tools, notify the user
 that you do not have the ability to fulfill the request.<|end_of_text|>

 <|start_of_role|>tools<|end_of_role|>[
     {
         "name": "c4",
         "description": "C compiler. Compiles and executes minimalistic subset of C language.
                 supports
                 char, int, and pointer types only
                 if, while, return, and expression statements only
                         ",
         "arguments": {
             "code": {
                 "description": "C source code to compile and execute"
             }
         }
     }
 ]<|end_of_text|>
 <|start_of_role|>user<|end_of_role|>What's the current weather in New York?<|end_of_text|>
 <|start_of_role|>assistant<|end_of_role|>

  https://github.com/rswier/c4

 https://www.ibm.com/granite/docs/models/granite/#retrieval-augmented-generation-(rag)
 
 <|start_of_role|>documents<|end_of_role|>Document 0
 Bridget Jones is a binge drinking and chain smoking thirty-something British woman trying to keep her love life in order while also dealing with her job as a publisher. When she attends a Christmas party with her parents, they try to set her up with their neighbours' son, Mark. After being snubbed by Mark, she starts to fall for her boss Daniel, a handsome man who begins to send her suggestive e-mails that leads to a dinner date. Daniel reveals that he and Mark attended college together, in that time Mark had an affair with his fiancée. Bridget decides to get a new job as a TV presenter after finding Daniel being frisky with a colleague. At a dinner party, she runs into Mark who expresses his affection for her, Daniel claims he wants Bridget back, the two fight over her and Bridget must make a decision who she wants to be with.

 Document 1
 Bridget is currently living a happy life with her lawyer boyfriend Mark Darcy, however not only does she start to become threatened and jealous of Mark's new young intern, she is angered by the fact Mark is a Conservative voter. With so many issues already at hand, things get worse for Bridget as her ex-lover, Daniel Cleaver, re-enters her life; the only help she has are her friends and her reliable diary.,

 Document 2
 Bridget Jones is struggling with her current state of life, including her break up with her love Mark Darcy. As she pushes forward and works hard to find fulfilment in her life seems to do wonders until she meets a dashing and handsome American named Jack Quant. Things from then on go great, until she discovers that she is pregnant but the biggest twist of all, she does not know if Mark or Jack is the father of her child.

 Document 3
 Bridget Jones - Renée Zellweger, Mark Darcy - Colin Firth, Daniel Cleaver - Hugh Grant

 Document 4
 Bridget Jones - Renée Zellweger, Mark Darcy - Colin Firth, Daniel Cleaver - Hugh Grant

 ...

 Document 50
 Bridget Jones - Renée Zellweger, Mark Darcy - Colin Firth, Daniel Cleaver - Hugh Grant, Jack Qwant - Patrick Dempsey
 <|end_of_text|>

 ### Summarization
 https://www.ibm.com/granite/docs/models/granite/#summarization
 
 <|start_of_role|>user<|end_of_role|>Summarize a fragament of an interview transcript.
 In this interview, an NBC reporter interviews Simone Biles about her participation in Paris 2024 Olimpic games.
 Your response should only include the answer. Do not provide any further explanation.
 Summary:<|end_of_text|>
 
 ### Spotted
 
 Sun, Feb 23, 6:04 PM

 [/SOLUTION] [EXPLANATION] The bond between dogs and humans is a complex
 [/EXPLANATION] [ANSWER] Dogs form deep bonds with humans primarily due ...
 [/ANSWER]
 
*/

static std::string today() {
    std::time_t t = std::time(nullptr);
    std::tm* local_tm = std::localtime(&t);
    char buf[64];
    std::strftime(buf, sizeof(buf), "%B %d, %Y", local_tm);
    return std::string(buf);
}

static std::string system_prompt() {
    return R"(
Knowledge Cutoff Date: April 2024.
Today's Date: )" + today() + R"(
[curent_date] is )" + today() + R"(
You are a helpful and polite AI assistant.
Answer the user's question accurately.
If you do not know the answer, simply say you do not know.
)";
}

static const char* prompts_dir() {
    static const char *cwd = get_cwd();
    static char prompts[4 * 1024];
    strcpy(prompts, cwd);
    strcat(prompts, "/prompts");
    return prompts;
}

static void list() {
    const char* prompts = prompts_dir();
    DIR *dir = opendir(prompts);
    if (!dir) {
        perror("opendir");
        return;
    }
    struct dirent *entry;
    char path[4 * 1024];
    while ((entry = readdir(dir))) {
        if (strcmp(entry->d_name, ".") != 0 &&
            strcmp(entry->d_name, "..") != 0) {
            snprintf(path, sizeof(path), "%s/%s", prompts, entry->d_name);
            struct stat st = {0};
            if (stat(path, &st) != 0) {
                perror("stat");
            } else {
                trace("%12d %s\n", (int)st.st_size, path);
            }
        }
    }
    closedir(dir);
}

static int load_and_run(int argc, char** argv) {
    int r = llama.load(argc, argv);
//  trace("llama.load() %s\n", r == 0 ? "done" : "failed");
    if (r != 0) {
        running = false;
        trace("running := false\n");
        return 1;
    }
    for (;;) {
        pthread_mutex_lock(&lock);
        while (!event) { pthread_cond_wait(&cond, &lock); }
        event = 0;
        char* id = nullptr;
        if (session_id != nullptr) {
            id = strdup(session_id);
            session_id = nullptr;
            free(session_id);
        }
        pthread_mutex_unlock(&lock);
        question = nullptr;
        if (quit || id == nullptr) { break; }
        running = true;
        trace("running := true\n");
//      list();
        int r = llama.run(id, existing);
        free(id);
        running = false;
        trace("running := false\n");
        if (r != 0) { break; }
        if (quit) {
            break;
        }
    }
    pthread_mutex_lock(&lock);
    llama.fini();
    pthread_mutex_unlock(&lock);
    return 0;
}

static int load_model(const char* model) {
    if (strstr(model, "file://") == model) { model += 7; }
    static char arg0[1024];
    uint32_t size = sizeof(arg0);
    if (_NSGetExecutablePath(arg0, &size) != 0) {
        const char* cwd = get_cwd();
        snprintf(arg0, countof(arg0) - 1, "%s/gyptix", cwd);
    }
    static std::string sp = system_prompt();
    int argc = 0;
    argv[argc++] = (char*)arg0;
    argv[argc++] = (char*)"-cnv";
    argv[argc++] = (char*)"-i";
    argv[argc++] = (char*)"--chat-template";
    argv[argc++] = (char*)"granite";
    argv[argc++] = (char*)"-m";
    argv[argc++] = (char*)model;
    argv[argc++] = (char*)"--no-display-prompt";
    argv[argc++] = (char*)"--no-warmup";
    argv[argc++] = (char*)"--no-perf";
    argv[argc++] = (char*)"--log-disable";
    argv[argc++] = (char*)"--batch-size"; // default: 2048 (too big)
    argv[argc++] = (char*)"128";
    argv[argc++] = (char*)"--predict";
    argv[argc++] = (char*)"-2";           // stop when context if full
    if (strcmp(gyptix.info.platform, "macOS") == 0) {
        argv[argc++] = (char*)"--ctx-size"; // default: 4096 (too small)
        argv[argc++] = (char*)"0"; // from training 128K for granite
    } else {
        // iPhone and iPad
        // 16384 crashes iPhone GPU hard
        argv[argc++] = (char*)"--ctx-size"; // default: 4096
        argv[argc++] = (char*)"4096"; // 4096, 8192, 16384
        // 8192 still works on iPhone with 4GB of RAM but unreliable
        // 16384 reboots iPhone
    }
//  priority has no effect on macOS
//  argv[argc++] = (char*)"--prio";
//  argv[argc++] = (char*)"2"; // 0-normal, 1-medium, 2-high, 3-realtime
#if !defined(__aarch64__) && !defined(__arm64__)
    // do not use Metal/GPU on x64 platforms
    argv[argc++] = (char*)"--device";
    argv[argc++] = (char*)"none";
#endif
    argv[argc++] = (char*)"-p";
    argv[argc++] = (char*)sp.c_str();
//  trace("%s\n", sp.c_str());
    int r = 0;
    #if DEBUG // do not catch exception in DEBUG
        r = load_and_run(argc, argv);
//      trace("load_and_run() %s\n", r == 0 ? "done" : "failed");
    #else
        try {
            r = load_and_run(argc, argv);
//          trace("load_and_run() %s\n", r == 0 ? "done" : "failed");
        } catch (...) {
            r = -1;
            running = false;
            trace("running := false\n");
            trace("Exception in run()\n");
        }
    #endif
    return r;
}

static void remove_chat(const char* id) {
//  trace("remove: %s\n", id);
    static char filename[4 * 1024];
    snprintf(filename, sizeof(filename) - 1, "%s/%s", prompts_dir(), id);
//  trace("remove: %s\n", filename);
    if (remove(filename) != 0) {
        perror(filename);
    } else {
//      trace("remove: %s REMOVED\n", filename);
    }
}

static void erase(void) {
    const char* prompts = prompts_dir();
    DIR *dir = opendir(prompts);
    if (!dir) {
        perror("opendir");
        return;
    }
    struct dirent *entry;
    char path[4 * 1024];
    while ((entry = readdir(dir))) {
        if (strcmp(entry->d_name, ".") != 0 &&
            strcmp(entry->d_name, "..") != 0) {
            snprintf(path, sizeof(path), "%s/%s", prompts, entry->d_name);
            if (unlink(path) != 0) {
                perror("unlink");
            }
        }
    }
    closedir(dir);
}

static void* worker(void* p) {
    const char* model = (const char*)p;
    (void)load_model(model); // nowhere to report failure
    free(p);
    return NULL;
}

static void wakeup(void) {
    pthread_mutex_lock(&lock);
    event = 1;
    pthread_cond_signal(&cond);
    pthread_mutex_unlock(&lock);
}

static void ask(const char* s) {
    if (running) {
        pthread_mutex_lock(&lock);
        assert(question == NULL);
        question = strdup(s);
        pthread_mutex_unlock(&lock);
        wakeup();
//      trace("question := ... ; wakeup()\n");
        while (question != NULL && running) { sleep_for_ns(1000 * 1000); }
        if (question == NULL) {
            answering = true;
//          trace("answering := true\n");
        }
    }
}

static int is_answering() { return (int)answering; }
static int is_running()   { return (int)running; }

static void error(const char* text) {
    pthread_mutex_lock(&lock);
    message = text;
    pthread_mutex_unlock(&lock);
}

static void progress(double v) {
//  trace("progress: %.6f\n", v);
}

static const char* stat(void) {
    static char json[4 * 1024]; // average json length is < 500 so far
    snprintf(json, countof(json),
        "{\n"
        "  \"context_tokens\": %d,\n"
        "  \"session_tokens\": %d,\n"
        "  \"generated\": %.0f,\n"
        "  \"progress\": %.6f,\n"
        "  \"average_token\": %.3f,\n"
        "  \"tps\": %.3f,\n"
        "  \"logits_bytes\": %.0f,\n"
        "  \"sum\": %.0f,\n"
        "  \"time\": %.6f,\n"
        "  \"platform\": \"%s\",\n"
        "  \"git_hash\": \"%s\",\n"
        "  \"ram\": %.0f,\n"
        "  \"storage\": %.0f,\n"
        "  \"gpu\": {\n"
        "    \"recommended_max_working_set_size\": %.0f,\n"
        "    \"has_unified_memory\": %d\n"
        "  },\n"
        "  \"is_iOS_app_on_mac\": %d,\n"
        "  \"is_mac_catalyst_app\": %d,\n"
        "  \"cpu\": %d,\n"
        "  \"active_cpu\": %d\n"
        "}\n",
        /* llama.info */
        llama.info.context_tokens,
        llama.info.session_tokens,
        llama.info.generated,
        llama.info.progress,
        llama.info.average_token,
        llama.info.tps,
        llama.info.logits_bytes,
        llama.info.sum,
        llama.info.time,
        /* gyptix.info */
        gyptix.info.platform,
        gyptix.info.git_hash,
        gyptix.info.ram,
        gyptix.info.storage,
        gyptix.info.gpu.recommended_max_working_set_size,
        gyptix.info.gpu.has_unified_memory,
        gyptix.info.is_iOS_app_on_mac,
        gyptix.info.is_mac_catalyst_app,
        gyptix.info.cpu,
        gyptix.info.active_cpu
    );
//  trace("\n%s\n", json);
//  trace("json.length: %d\n", (int)strlen(json));
    return json;
}

static const char* poll(const char* i) {
    pthread_mutex_lock(&lock);
    if (strcmp(i, "<--interrupt-->") == 0) {
        interrupted = true;
    }
    char* s = NULL;
    if (message.length() > 0) {
        auto t = "<--error-->" + message + "</--error-->";
        s = strdup(t.c_str());
        message = "";
    } else if (answer.length() == 0 && (!answering || !running)) {
//      trace("output.length() == 0 && answering: %d\n", answering);
        s = strdup("<--done-->");
    } else if (answer.length() > 0 && validUTF8(answer)) {
        s = strdup(answer.c_str());
        answer = "";
    } else {
        s = strdup("");
    }
    pthread_mutex_unlock(&lock);
    return s;
}

static char* input(void) {
    char* s = NULL;
    for (;;) {
        pthread_mutex_lock(&lock);
        while (!event) { pthread_cond_wait(&cond, &lock); }
        event = 0;
        s = question;
        question = NULL;
        pthread_mutex_unlock(&lock);
//      trace("question := NULL\n");
        if (quit || s != NULL) { break; }
    }
    return s;
}

static bool output(const char* s) {
    pthread_mutex_lock(&lock);
    if (strcmp(s, "<--done-->") == 0) {
        answering = false;
    } else {
        answer += s;
    }
    bool result = !interrupted;
    if (interrupted) {
        interrupted = false;
    }
    pthread_mutex_unlock(&lock);
    return result;
}

static bool in_background(void) { return gyptix.info.background != 0; }

static void wait_foreground(void) {
    for (;;) {
        if (!gyptix.info.background) { return; }
        const long timeout = 1000LL * 1000LL * 1000LL; // 1 second
        sleep_for_ns(timeout);
    }
}

static void load(const char* model) {
    llama.input    = input;
    llama.output   = output;
    llama.error    = error;
    llama.progress = progress;
    llama.in_background   = in_background;
    llama.wait_foreground = wait_foreground;
    if (thread == nullptr) {
        pthread_create(&thread, NULL, worker, (void*)strdup(model));
    }
}

static void run(const char* id, int create_new) {
    session_id = strdup(id);
    existing = !create_new;
    ask("<--end-->"); // end previous session
    answering = false; // because no one will be polling right after run
    wakeup();
//  trace("running: %s\n", id);
}

static void inactive(void) {
//  trace("TODO: we can unload model here to make it easier on OS\n");
}

static void stop(void) {
    quit = true;
    if (thread != nullptr) {
        interrupted = true;
        wakeup();
        pthread_join(thread, NULL);
        pthread_mutex_destroy(&lock);
        pthread_cond_destroy(&cond);
        thread = nullptr;
    }
}

static void set_platform(const char* p) {
    snprintf(gyptix.info.platform, countof(gyptix.info.platform) - 1,
             "%s", p);
    snprintf(gyptix.info.git_hash, countof(gyptix.info.git_hash) - 1,
             "%s", GIT_HASH);
    // keep the traces below on to set timeline basis in trace()
    trace(".platform: %s\n", p);
    trace(".git_hash: %s\n", gyptix.info.git_hash);
}

struct gyptix gyptix = {
    .set_platform = set_platform,
    .load = load,
    .run = run,
    .ask = ask,
    .poll = poll,
    .stat = stat,
    .is_answering = is_answering,
    .is_running = is_running,
    .remove = remove_chat,
    .erase = erase,
    .stop = stop,
    .inactive = inactive
};

}

