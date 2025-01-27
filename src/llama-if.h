#ifndef LLAMA_SO
#define LLAMA_SO

#ifdef __cplusplus
extern "C" {
#endif

extern char* (*read_line)(void); // returns malloc()ed string
extern void  (*output_text)(const char* s);

int run(int argc, char** argv);

#ifdef __cplusplus
} // extern "C"
#endif

#endif // LLAMA_SO
