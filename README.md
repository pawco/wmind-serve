# wmind-serve

Fast local LLM inference server for Apple Silicon. One command to start.

Uses [vLLM-MLX](https://github.com/waybarrios/vllm-mlx) under the hood for faster inference than Ollama on Apple Silicon, with an OpenAI-compatible API.

Companion to [Working Mind](https://github.com/pawco/working-mind) — a secure, private, research-grade AI companion with a persistent knowledge graph.

## Quick Start

```bash
# Install
npm install -g wmind-serve

# Start server (picks best model for your Mac, downloads if needed)
wmind-serve start

# That's it. OpenAI-compatible API at http://127.0.0.1:19421/v1
```

## Commands

```bash
wmind-serve start              # Start server (auto-downloads model)
wmind-serve start -m phi-4-4bit  # Start specific model
wmind-serve start -p 8080      # Use custom port

wmind-serve stop                # Stop server

wmind-serve status              # Show server state

wmind-serve models list         # List all discovered models
wmind-serve models available    # Browse catalog (filtered by your hardware)
wmind-serve models scan         # Scan caches for new models
wmind-serve models disk         # Show disk usage

wmind-serve pull <name>         # Download a model from catalog
wmind-serve models rm <name>    # Remove model from cache
```

## How It Works

- **vLLM-MLX** runs as a background process, optimized for Apple Silicon via MLX framework
- **HuggingFace cache** (`~/.cache/huggingface/hub/`) is the single source of truth for model files
- **Smart index** (`~/.wmind-serve/index.json`) tracks metadata without duplicating files
- **Ollama models** are also discovered from `~/.ollama/models/`
- **Hardware detection** via `sysctl`/`system_profiler` auto-selects the best model for your Mac

## Supported Hardware

Any Apple Silicon Mac (M1/M2/M3/M4) with at least 8 GB RAM. More RAM = bigger models.

| Chip | Recommended Models |
|------|-------------------|
| 8 GB RAM | Gemma 3 4B, Qwen 2.5 3B, Llama 3.2 3B |
| 16 GB RAM | + DeepSeek R1 7B, Qwen 2.5 7B, Llama 3.1 8B |
| 32 GB RAM | + Phi 4 14B, Gemma 4 26B |

## Model Catalog

Curated MLX-quantized models from `mlx-community` on HuggingFace:

| Name | Params | Quant | Size | Min RAM |
|------|--------|-------|------|---------|
| gemma-3-4b-it-4bit | 4B | 4-bit | 2.3 GB | 8 GB |
| qwen3-4b-4bit | 4B | 4-bit | 2.4 GB | 8 GB |
| llama-3.2-3b-it-4bit | 3B | 4-bit | 1.8 GB | 8 GB |
| deepseek-r1-7b-4bit | 7B | 4-bit | 4.1 GB | 12 GB |
| qwen2.5-7b-4bit | 7B | 4-bit | 4.3 GB | 12 GB |
| llama-3.1-8b-4bit | 8B | 4-bit | 4.9 GB | 12 GB |
| phi-4-4bit | 14B | 4-bit | 8.4 GB | 16 GB |
| gemma-4-26b-4bit | 26B | 4-bit | 15 GB | 32 GB |

Any MLX model in your HuggingFace cache is also available, even if not in the catalog.

## Configuration

### wmind Integration

When you run `wmind-serve start`, it automatically configures [wmind](https://github.com/pawco/working-mind) to use the local server:

```jsonc
// ~/.wmind/config.jsonc
{
  "localFastBaseUrl": "http://127.0.0.1:19421/v1",
  "defaultModel": "local-fast/gemma-3-4b-it-4bit"
}
```

Running `wmind-serve stop` clears this config.

### Port Configuration

Default port is **19421** (uncommon, avoids conflicts). Configure via:

1. **Environment variable**: `WMIND_PORT=23457 wmind-serve start`
2. **`.env` file** (in project root or `~/.wmind-serve/.env`):
   ```
   WMIND_PORT=23457
   ```
3. **CLI flag**: `wmind-serve start -p 23457`

Priority: CLI flag > env var / `.env` > default (19421)

### vLLM-MLX Environment

Auto-managed in `~/.venv/vllm-mlx/`. Created on first run if not present.

### Data Directory

```
~/.wmind-serve/
  index.json     # Model metadata index
  config.json    # Server state (port, PID, active model)
```

## Architecture

```
wmind-serve
  src/
    cli.ts           # Commander CLI
    config.ts        # Port config (.env + WMIND_PORT + default 19421)
    catalog.ts       # Curated model catalog
    hardware.ts      # Apple Silicon detection
    scanner.ts       # HuggingFace + Ollama cache scanner
    index-manager.ts # Smart index + server config
    downloader.ts    # huggingface-cli wrapper
    server.ts        # vllm-mlx process manager
    wmind-config.ts  # wmind config integration
    bench.ts         # Performance benchmark
    version.ts       # Build-time version
```

## Benchmarks

Run `wmind-serve bench` to compare local servers on your hardware with sequential and concurrent requests.

## Why vLLM-MLX over Ollama?

- **Faster inference** on Apple Silicon (MLX-optimized kernels)
- **OpenAI-compatible API** at `/v1/chat/completions`
- **No CVEs** (vLLM Python has 5+ critical RCEs; vllm-mlx is pure MLX, no HTTP/image processing attack surface)

## Requirements

- macOS with Apple Silicon (M1+)
- 8 GB+ unified memory
- Node.js 18+
- Python 3.10+ (auto-configured in venv)

## License

[MIT](LICENSE)
