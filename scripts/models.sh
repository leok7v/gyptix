#!/usr/bin/env bash
set -euo pipefail

[[ -x "$(command -v curl)" ]] || {
    echo "curl not found in PATH" >&2
    exit 1
}

backup_base="https://github.com/leok7v/gyptix/releases/download/2025-01-25"
models_dir="models"
mkdir -p "$models_dir"

download_model() {
    local hf_url="$1"
    local file="${hf_url##*/}"
    local path="$models_dir/$file"
    [[ -f "$path" ]] && return
    if ! command curl -fL -C - -o "$path" "$hf_url"; then
        command curl -fL -C - -o "$path" "$backup_base/$file"
    fi
}

download_model \
  https://huggingface.co/HuggingFaceTB/SmolLM2-360M-Instruct-GGUF/resolve/main/smollm2-360m-instruct-q8_0.gguf
download_model \
  https://huggingface.co/unsloth/gemma-3-1b-it-GGUF/resolve/main/gemma-3-1b-it-Q8_0.gguf
download_model \
  https://huggingface.co/unsloth/gemma-3-4b-it-GGUF/resolve/main/gemma-3-4b-it-Q8_0.gguf
download_model \
  https://huggingface.co/unsloth/gemma-3-12b-it-GGUF/resolve/main/gemma-3-12b-it-Q8_0.gguf
download_model \
  https://huggingface.co/tensorblock/DeepSeek-V3-1B-Test-GGUF/resolve/main/DeepSeek-V3-1B-Test-Q8_0.gguf
download_model \
  https://huggingface.co/unsloth/DeepSeek-R1-Distill-Qwen-1.5B-GGUF/resolve/main/DeepSeek-R1-Distill-Qwen-1.5B-Q8_0.gguf
download_model \
  https://huggingface.co/tensorblock/DeepSeek-R1-Distill-Llama-3B-GGUF/resolve/main/DeepSeek-R1-Distill-Llama-3B-Q8_0.gguf
download_model \
  https://huggingface.co/unsloth/DeepSeek-R1-Distill-Llama-8B-GGUF/resolve/main/DeepSeek-R1-Distill-Llama-8B-Q8_0.gguf
download_model \
  https://huggingface.co/unsloth/DeepSeek-R1-Distill-Qwen-7B-GGUF/resolve/main/DeepSeek-R1-Distill-Qwen-7B-Q8_0.gguf
download_model \
  https://huggingface.co/unsloth/DeepSeek-R1-Distill-Qwen-14B-GGUF/resolve/main/DeepSeek-R1-Distill-Qwen-14B-Q8_0.gguf
