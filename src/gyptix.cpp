#include <assert.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <pthread.h>
#include <time.h>
#include <unistd.h>

#include <string>


#include "gyptix.h"
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
static bool answering = false;
static bool quit = false;
static bool interrupted = false;

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

static void load_model_and_run(const char* model) {
    if (strstr(model, "file://") == model) { model += 7; }
    init_random_seed();
    long seed = random();
    char seed_str[64] = {0};
    snprintf(seed_str, countof(seed_str) - 1, "%ld", seed);
    static char cwd[32*1024];
    int argc = 0;
    argv[argc++] = getcwd(cwd, countof(cwd));
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
#if !defined(__aarch64__) && !defined(__arm64__)
    // do not use Metal/GPU on x64 platforms
    argv[argc++] = (char*)"--device";
    argv[argc++] = (char*)"none";
#endif
//  argv[argc++] = (char*)"-p";
//  argv[argc++] = (char*)"You are polite helpful assistant";
    run(argc, argv);
}

static void* worker(void* p) {
    const char* model = (const char*)p;
    load_model_and_run(model);
    free(p);
    return NULL;
}

static void wakeup(void) {
    pthread_mutex_lock(&lock);
    event = 1;
    pthread_cond_signal(&cond);
    pthread_mutex_unlock(&lock);
}

static void sleep_for_ns(long nsec) {
    struct timespec delay = { nsec / 1000000000, nsec % 1000000000 };
    pselect(0, NULL, NULL, NULL, &delay, NULL);
}

void ask(const char* s) {
    pthread_mutex_lock(&lock);
    assert(question == NULL);
    question = strdup(s);
    pthread_mutex_unlock(&lock);
    wakeup();
    while (question != NULL) { sleep_for_ns(1000 * 1000); }
    answering = true;
}

const char* answer(const char* i) {
    pthread_mutex_lock(&lock);
    if (strcmp(i, "<--interrupt-->") == 0) {
        interrupted = true;
    }
    char* s = NULL;
    if (output.length() == 0 && !answering) {
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

static char* read_line_impl(void) {
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

static bool output_text_impl(const char* s) {
    pthread_mutex_lock(&lock);
    if (strcmp(s, "<--done-->") == 0) {
        answering = false;
    } else {
        output += s;
    }
    bool result = !interrupted;
    interrupted = false;
    pthread_mutex_unlock(&lock);
    return result;
}

void start(const char* model) {
    read_line   = read_line_impl;
    output_text = output_text_impl;
    pthread_create(&thread, NULL, worker, (void*)strdup(model));
}

void inactive(void) {
    printf("inactive\n");
}

void stop(void) {
    quit = true;
    interrupted = true;
    wakeup();
    pthread_join(thread, NULL);
    pthread_mutex_destroy(&lock);
    pthread_cond_destroy(&cond);
}

}

