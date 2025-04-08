#ifndef GYPTIX_H
#define GYPTIX_H

#ifdef __cplusplus
extern "C" {
#endif

struct gyptix {
    void (*load)(const char* model);
    void (*run)(const char* id, int create_new);
    int  (*is_running)(void);
    void (*ask)(const char* question);
    int  (*is_answering)(void);
    const char* (*poll)(const char* interrupt);
    void (*erase)(void); // erase all chats
    void (*remove)(const char* id); // remove chat by `id`
    void (*stop)(void);
    void (*inactive)(void);
};

extern struct gyptix gyptix; // interface

#ifdef __cplusplus
}
#endif

#endif /* GYPTIX_H */

