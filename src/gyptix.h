#ifndef GYPTIX_H
#define GYPTIX_H

#ifdef __cplusplus
extern "C" {
#endif

struct gyptix_info {
    char   platform[128];       // "iPad", "iPhone", "macOS"...
    char   git_hash[64];        // short hash
    int    is_iOS_app_on_mac;   // bool
    int    is_mac_catalyst_app; // bool
    int    cpu;                 // processors count
    int    active_cpu;          // active processors count
    double ram;                 // total RAM in bytes
    double storage;             // free storage at startup
    struct {
        double recommended_max_working_set_size;
        int    has_unified_memory;
    } gpu;
};

struct gyptix {
    struct gyptix_info info;
    void (*set_platform)(const char* platform);
    void (*load)(const char* model);
    void (*run)(const char* id, int create_new);
    int  (*is_running)(void);
    void (*ask)(const char* question);
    int  (*is_answering)(void);
    const char* (*poll)(const char* interrupt);
    const char* (*stat)(void);
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

