#!/bin/bash
GIT_HASH=$(git rev-parse --short HEAD)
echo "#pragma once" > src/git_hash.h
echo "#define GIT_HASH \"$GIT_HASH\"" >> src/git_hash.h

