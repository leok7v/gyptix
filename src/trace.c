#include "trace.h"
#include <time.h>
#include <math.h>
#include <string.h>
#include <stdarg.h>
#include <stdio.h>

static double monotonic_start_time = NAN;

void monotonic_time_start(void) {
    if (isnan(monotonic_start_time)) {
        monotonic_start_time = monotonic_time_now();
    }
}

double monotonic_time_now(void) {
    struct timespec ts;
    clock_gettime(CLOCK_MONOTONIC, &ts);
    return ts.tv_sec + ts.tv_nsec / 1e9;
}

double monotonic_time_since_start(void) {
    monotonic_time_start();
    return monotonic_time_now() - monotonic_start_time;
}

void _trace_(const char *filename, int line,
        const char *func, const char *format, ...) {
    const char *file = filename;
    const char *last = strrchr(file, '/');
    if (last) { file = last + 1; }
    struct timespec ts;
    clock_gettime(CLOCK_MONOTONIC, &ts);
    const double now = monotonic_time_since_start();
    fprintf(stderr, "%10.6f %s:%d @%s ", now, file, line, func);
    va_list args;
    va_start(args, format);
    vfprintf(stderr, format, args);
    va_end(args);
}
