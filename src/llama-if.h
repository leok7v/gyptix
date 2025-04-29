#ifndef LLAMA_IF
#define LLAMA_IF

#ifdef __cplusplus
extern "C" {
#endif

typedef struct llama llama_t;

struct llama_callbacks;

typedef struct llama_callbacks llama_callbacks_t;

struct llama_callbacks {
    bool  (*in_background)(llama_t* llm, llama_callbacks_t* that);
    void  (*wait_foreground)(llama_t* llm, llama_callbacks_t* that);
    char* (*input)(llama_t* llm, llama_callbacks_t* that); // must be free() by caller
     // returns false on interrupt
    bool  (*output)(llama_t* llm, llama_callbacks_t* that, const char* s);
    void  (*error)(llama_t* llm, llama_callbacks_t* that, const char* message); 
    void  (*fatal)(llama_t* llm, llama_callbacks_t* that, const char* message); 
    // input decoding progress 0..1
    void  (*progress)(llama_t* llm, llama_callbacks_t* that, double progress);
};

struct llama_info {
    int    context_tokens; // > 0 before input
    int    session_tokens; // > 0 before input
    double generated;      // number of tokens generated over lifetime
    double progress;       // 0..1 prompt decoding progress (slow)
    double average_token;  // number of UTF-16 characters per token
    double tps;            // tokens per second
    double logits_bytes;   // size of saved session file in bytes
    double sum;            // sum character of all generated tokens
    double time;           // sum of generation time
};

struct llama_if {
    llama_t*          (*create)(int argc, char** argv,
                                llama_callbacks_t* callbacks);
    int               (*run)(llama_t* llm, const char* session, bool create_new);
    const llama_info* (*info)(llama_t* llm);
    void              (*dispose)(llama_t* llm);
};

extern struct llama_if llama_if;

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
