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
    void  (*progress)(double progress);  // input decoding progress 0..1
};

extern struct llama_if llama;

#ifdef __cplusplus
} // extern "C"
#endif

#endif // LLAMA_IF

/*

https://github.com/jraleman/42_get_next_line/blob/master/tests/hhgttg.txt
273KB 7,372 lines paperback ~200 pages
embd_inp.size() 96,667
Input Prompt Processing Time: 1,070 second
on Mac Book Air M3 2024 Mac15,13 8 cores
gyptix/Data/Library/Caches//prompts/
4.4G saved session

*/
