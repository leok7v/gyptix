#ifndef TRACE_H
#define TRACE_H

#ifdef __cplusplus
extern "C" {
#endif

extern double trace_start_time;

void _trace_(const char *filename, int line,
             const char *func, const char *format, ...);

#define trace(format, ...)                                      \
    _trace_(__FILE__, __LINE__, __func__, format, ##__VA_ARGS__)

#ifdef __cplusplus
}
#endif

#endif /* TRACE_H */
