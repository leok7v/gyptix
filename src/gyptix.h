#ifndef GYPTIX_H
#define GYPTIX_H

#ifdef __cplusplus
extern "C" {
#endif

struct gyptix {
    void (*start)(const char* model);
    void (*save)(const char* id);
    void (*load)(const char* id);
    void (*ask)(const char* question);
    const char* (*answer)(const char* interrupt);
    int (*is_answering)();
    int (*is_running)();
    void (*inactive)(void);
    void (*stop)(void);
};

extern struct gyptix gyptix; // interface

#ifdef __cplusplus
}
#endif

#endif /* GYPTIX_H */

