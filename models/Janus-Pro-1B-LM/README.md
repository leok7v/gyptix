---
license: mit
license_name: deepseek
license_link: LICENSE
pipeline_tag: text-generation
library_name: transformers
base_model:
  - deepseek-ai/Janus-Pro-1B
tags:
  - chat
---

This model is derived from https://huggingface.co/deepseek-ai/Janus-Pro-1B and the main modifications are as follows

- bin files are updated to safetensors
- Add chat_template

`4bit` refers to quantifying the LLM part to 4 bits.

`LM` means that it contains only the language model part.

## Quick Start

In Macos (Apple silicon), use [mlx](https://github.com/ml-explore/mlx) framework https://github.com/wnma3mz/tLLM

```bash
tllm.server --model_path $MODEL_PATH --hostname localhost --is_local --client_size 1
```

`$MODEL_PATH` like `wnma3mz/Janus-Pro-1B-4bit`