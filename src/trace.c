#include "trace.h"
#include <time.h>
#include <string.h>
#include <stdarg.h>
#include <stdio.h>

double trace_start_time = 0.0;

void _trace_(const char *filename, int line,
        const char *func, const char *format, ...) {
    if (trace_start_time == 0.0) {
        struct timespec ts;
        clock_gettime(CLOCK_MONOTONIC, &ts);
        trace_start_time = ts.tv_sec + ts.tv_nsec / 1e9;
    }
    const char *file = filename;
    const char *last = strrchr(file, '/');
    if (last) { file = last + 1; }
    struct timespec ts;
    clock_gettime(CLOCK_MONOTONIC, &ts);
    double now = ts.tv_sec + ts.tv_nsec / 1e9 - trace_start_time;
    fprintf(stderr, "%.6f %s:%d @%s ", now, file, line, func);
    va_list args;
    va_start(args, format);
    vfprintf(stderr, format, args);
    va_end(args);
}
