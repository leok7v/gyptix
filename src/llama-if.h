#ifndef LLAMA_IF
#define LLAMA_IF

#ifdef __cplusplus
extern "C" {
#endif

struct llama_if {
    int   (*load)(int argc, char** argv);
    int   (*run)(const char* session, bool create_new);
    void  (*fini)(void);
    char* (*read_line)(void); // returns malloc()ed string
    bool  (*output_text)(const char* s); // returns false on stop interruption
};

extern struct llama_if llama;

#ifdef __cplusplus
} // extern "C"
#endif

#endif // LLAMA_IF
