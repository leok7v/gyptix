#include <assert.h>
#include <dirent.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <pthread.h>
#include <time.h>
#include <unistd.h>

#include <string>

#include "gyptix.h"
#include "getcwd.h"
#include "llama-if.h"

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
static pthread_cond_t cond = PTHREAD_COND_INITIALIZER;
static pthread_t thread;
static char* question;
static std::string output;
static bool answering   = false;
static bool running     = false;
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

static void init_random_seed() {
    struct timespec ts;
    clock_gettime(CLOCK_REALTIME, &ts);
    srandom((unsigned)ts.tv_nsec ^ (unsigned)ts.tv_sec);
}

#if defined(__aarch64__) || defined(__arm64__)
    #define APPLE_SILICON 1
#else
    #define APPLE_SILICON 0
#endif

static void load_model(const char* model) {
    if (strstr(model, "file://") == model) { model += 7; }
    init_random_seed();
    long seed = random();
    char seed_str[64] = {0};
    snprintf(seed_str, countof(seed_str) - 1, "%ld", seed);
    const char* cwd = get_cwd();
    char prompts[4 * 1024];
    strcpy(prompts, cwd);
    strcat(prompts, "/prompts");
    mkdir(prompts, S_IRWXU);
    static char prompt_cache[4 * 1024];
    strcpy(prompt_cache, prompts);
    strcat(prompt_cache, "/last");
//  printf("%s\n", prompt_cache);
    int argc = 0;
    argv[argc++] = (char*)cwd;
    argv[argc++] = (char*)"--seed";
    argv[argc++] = seed_str;
    argv[argc++] = (char*)"-cnv";
//  argv[argc++] = (char*)"--list-devices";
    argv[argc++] = (char*)"-i";
    argv[argc++] = (char*)"--chat-template";
    argv[argc++] = (char*)"granite";
    argv[argc++] = (char*)"-m";
    argv[argc++] = (char*)model;
    argv[argc++] = (char*)"--no-display-prompt";
    argv[argc++] = (char*)"--no-warmup";
    argv[argc++] = (char*)"--no-perf";
    argv[argc++] = (char*)"--log-disable";
    argv[argc++] = (char*)"--prompt_cache";
    argv[argc++] = (char*)prompt_cache;
#if !defined(__aarch64__) && !defined(__arm64__)
    // do not use Metal/GPU on x64 platforms
    argv[argc++] = (char*)"--device";
    argv[argc++] = (char*)"none";
#endif
//  argv[argc++] = (char*)"-p";
//  argv[argc++] = (char*)"You are polite helpful assistant";
    try {
        llama.load(argc, argv);
//      printf("llama.load() done\n");
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
//          fprintf(stderr, "running = true\n");
            int r = llama.run(id);
            free(id);
            running = false;
//          fprintf(stderr, "running = false\n");
            if (r != 0) { break; }
            if (quit) {
                break;
            }
        }
        pthread_mutex_lock(&lock);
        llama.fini();
        pthread_mutex_unlock(&lock);
    } catch (...) {
        running = false;
        fprintf(stderr, "Exception in run()\n");
    }
}

static void erase(void) {
    static const char *cwd = get_cwd();
    char prompts[4 * 1024];
    strcpy(prompts, cwd);
    strcat(prompts, "/prompts");
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
    load_model(model);
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
        while (question != NULL && running) { sleep_for_ns(1000 * 1000); }
        if (question == NULL) {
            answering = true;
//          printf("%s : %s\n", __func__, s);
//          printf("%s answering = true;\n", __func__);
        }
    }
}

static int is_answering() { return (int)answering; }
static int is_running()   { return (int)running; }

const char* poll(const char* i) {
    pthread_mutex_lock(&lock);
    if (strcmp(i, "<--interrupt-->") == 0) {
        interrupted = true;
    }
    char* s = NULL;
    if (output.length() == 0 && (!answering || !running)) {
        s = strdup("<--done-->");
    } else if (output.length() > 0 && validUTF8(output)) {
        s = strdup(output.c_str());
        output = "";
    } else {
        s = strdup("");
    }
    pthread_mutex_unlock(&lock);
    return s;
}

static char* read_line(void) {
    char* s = NULL;
    for (;;) {
        pthread_mutex_lock(&lock);
        while (!event) { pthread_cond_wait(&cond, &lock); }
        event = 0;
        s = question;
        question = NULL;
        pthread_mutex_unlock(&lock);
        if (quit || s != NULL) { break; }
    }
    return s;
}

static bool output_text(const char* s) {
    pthread_mutex_lock(&lock);
    if (strcmp(s, "<--done-->") == 0) {
        answering = false;
//      printf("%s answering = false;\n", __func__);
    } else {
        output += s;
    }
    bool result = !interrupted;
    if (interrupted) {
        interrupted = false;
//      printf("%s interrupted = false;\n", __func__);
    }
    pthread_mutex_unlock(&lock);
    return result;
}

static void load(const char* model) {
    llama.read_line   = read_line;
    llama.output_text = output_text;
    pthread_create(&thread, NULL, worker, (void*)strdup(model));
}

static void run(const char* id) {
    session_id = strdup(id);
//  printf("session: %s\n", id);
    ask("<--end-->"); // end previous session
    answering = false; // because no one will be polling right after run
//  printf("%s answering = false;\n", __func__);
    wakeup();
//  printf("running: %s\n", id);
}

static void inactive(void) {
    printf("inactive\n");
}

static void interrupt(void) {
    interrupted = true;
//  printf("%s interrupted = true;\n", __func__);
    wakeup();
    pthread_join(thread, NULL);
    pthread_mutex_destroy(&lock);
    pthread_cond_destroy(&cond);
}

static void stop(void) {
    quit = true;
    interrupt();
}

struct gyptix gyptix = {
    .load = load,
    .run = run,
    .ask = ask,
    .poll = poll,
    .is_answering = is_answering,
    .is_running = is_running,
    .interrupt = interrupt,
    .erase = erase,
    .stop = stop,
    .inactive = inactive,
};

}

