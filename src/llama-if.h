#ifndef LLAMA_IF
#define LLAMA_IF

#ifdef __cplusplus
extern "C" {
#endif

struct llama_if {
    struct {
        int    context_tokens; // > 0 before input
        int    session_tokens; // > 0 before input
        double generated;      // number of tokens generated over lifetime
        double progress;       // 0..1 prompt decoding progress (slow)
        double average_token;  // number of UTF-16 characters per token
        double tps;            // tokens per second
        double logits_bytes;   // size of saved session file in bytes
        double sum;            // sum character of all generated tokens
        double time;           // sum of generation time
    } info;
    int   (*load)(int argc, char** argv);
    int   (*run)(const char* session, bool create_new);
    void  (*fini)(void);
    // supplied by caller:
    char* (*input)(void); // returns malloc()ed string
    bool  (*output)(const char* s); // returns false on interrupt
    void  (*error)(const char* message);
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
