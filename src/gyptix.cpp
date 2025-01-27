#include <stdio.h>
#include <string.h>
#include <sys/stat.h>
#include <unistd.h>
#include "gyptix.h"
#include "llama-so.h"

extern "C" {

#define countof(a) (sizeof(a) / sizeof((a)[0]))

static char* args[1024] = { 0 };
static char** argv = args;

static char* read_line_impl(void) {
    static int count;
    switch (++count % 3) {
        case 1:
//          return strdup("🏴‍☠️ tell me short joke using this emoji");
            return strdup("tell me a short joke");
        case 2:
            return strdup("translate that joke to Chinese");
        default:
            return (char*)0;
    }
}

static void  output_text_impl(const char* s) {
    printf("%s", s);
}

void start(const char* model) {
    static char cwd[1024];
    struct stat st = {0};
    if (strstr(model, "file://") == model) { model += 7; }
    int a = stat(model, &st);
    printf("start \"%s\" a=%d\n", model, a);
    int argc = 0;
    argv[argc++] = getcwd(cwd, countof(cwd));
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
//  argv[argc++] = (char*)"-p";
//  argv[argc++] = (char*)"you are polite helpful assistant";
    read_line = read_line_impl;
    output_text = output_text_impl;
    run(argc, argv);
}

void inactive(void) {
    printf("inactive\n");
}

void stop(void) {
    printf("stop\n");
}

}

