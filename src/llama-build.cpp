#include "git_hash.h"

extern "C" {
int LLAMA_BUILD_NUMBER = 0;
char const * LLAMA_COMMIT = GIT_HASH_LLAMA;
char const * LLAMA_COMPILER = "unknown";
char const * LLAMA_BUILD_TARGET = "unknown";
};
