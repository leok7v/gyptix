#ifndef TRACE_H
#define TRACE_H

#ifdef __cplusplus
extern "C" {
#endif

void monotonic_time_start(void);

double monotonic_time_now(void); // in seconds

double monotonic_time_since_start(void); // since monotonic_time_start

void _trace_(const char *filename, int line,
             const char *func, const char *format, ...);

#define trace(format, ...)                                      \
    _trace_(__FILE__, __LINE__, __func__, format, ##__VA_ARGS__)

#ifdef __cplusplus
}
#endif

#endif /* TRACE_H */
