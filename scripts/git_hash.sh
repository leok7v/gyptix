#!/bin/bash
GIT_HASH=$(git rev-parse --short HEAD)
GIT_HASH_40=$(git rev-parse HEAD)
pushd llama.cpp
GIT_HASH_LLAMA=$(git rev-parse --short HEAD)
GIT_HASH_LLAMA_40=$(git rev-parse HEAD)
popd
echo "#pragma once" > src/git_hash.h
echo "#define GIT_HASH          \"$GIT_HASH\""          >> src/git_hash.h
echo "#define GIT_HASH_40       \"$GIT_HASH_40\""       >> src/git_hash.h
echo "#define GIT_HASH_LLAMA    \"$GIT_HASH_LLAMA\""    >> src/git_hash.h
echo "#define GIT_HASH_LLAMA_40 \"$GIT_HASH_LLAMA_40\"" >> src/git_hash.h
