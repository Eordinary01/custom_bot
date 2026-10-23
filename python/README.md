# Python ML Environment Setup

This directory contains the Python environment and dependencies for the JARVIS Conversational AI system.

## Environment Details

- **Python Version**: 3.11.15
- **Platform**: Windows (CPU-only builds)
- **Virtual Environment**: `venv/` (in project root)

## Installed Packages

All dependencies are defined in `requirements.txt` with pinned versions for reproducibility.

### Core ML Dependencies

- **llama-cpp-python** (0.3.35): Local LLM inference engine (CPU version)
- **transformers** (4.44.2): Hugging Face transformers library
- **torch** (2.4.1+cpu): PyTorch with CPU support
- **peft** (0.12.0): Parameter-Efficient Fine-Tuning (LoRA)
- **accelerate** (0.34.2): Training acceleration utilities
- **datasets** (2.21.0): Hugging Face datasets library
- **bitsandbytes** (0.43.3): Quantization support

### Supporting Libraries

- **numpy** (2.4.6): Numerical computing
- **scipy** (1.14.1): Scientific computing
- **scikit-learn** (1.5.2): Machine learning utilities
- **pandas** (3.0.6): Data manipulation
- **tokenizers** (0.19.1): Fast tokenization

### IPC Communication

- **jsonrpcserver** (5.0.9): JSON-RPC server for Node.js communication
- **jsonrpcclient** (4.0.3): JSON-RPC client utilities

### Utilities

- **huggingface-hub** (0.24.7): Model downloads and management
- **safetensors** (0.4.5): Safe model serialization
- **tqdm** (4.66.5): Progress bars
- **onnxruntime** (1.19.2): ONNX runtime for intent classification

## Installation

The environment has been set up and tested. To recreate or update:

```bash
# Create virtual environment (if needed)
python -m venv venv

# Activate virtual environment
venv\Scripts\activate  # Windows
# source venv/bin/activate  # Linux/Mac

# Upgrade pip
pip install --upgrade pip setuptools wheel

# Install dependencies
pip install -r requirements.txt

# For PyTorch CPU version specifically (Windows)
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cpu

# For llama-cpp-python pre-built wheels
pip install llama-cpp-python --extra-index-url https://abetlen.github.io/llama-cpp-python/whl/cpu
```

## IPC Testing

A test script is provided to verify Python-Node.js communication:

```bash
# From project root
node test_python_ipc.js
```

This tests:
1. Python process startup
2. Basic JSON-RPC communication
3. ML package imports and version verification

**Note**: ML package imports take approximately 10-11 seconds on first load.

## GPU Support

This installation uses CPU-only builds. For GPU acceleration:

1. Ensure CUDA toolkit is installed (version compatible with PyTorch 2.4.1)
2. Reinstall PyTorch with CUDA:
   ```bash
   pip uninstall torch torchvision torchaudio
   pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121
   ```
3. Reinstall llama-cpp-python with CUDA:
   ```bash
   pip uninstall llama-cpp-python
   CMAKE_ARGS="-DLLAMA_CUBLAS=on" pip install llama-cpp-python --extra-index-url https://abetlen.github.io/llama-cpp-python/whl/cu121
   ```

## Performance Notes

- **Startup time**: ~10-11 seconds for full ML stack imports
- **Memory usage**: Expect 2-4GB RAM for model inference (depends on model size)
- **CPU inference**: Phi-3-mini-4k-Q4 should achieve 10-20 tokens/sec on modern CPUs
- **GPU inference**: With CUDA, expect 50-100+ tokens/sec depending on GPU

## Next Steps

1. Download base language model (Task 1.2)
2. Set up LLM inference server (Task 2.1)
3. Create Node.js LLM client (Task 2.2)

## Troubleshooting

### Import Errors
- Ensure virtual environment is activated before running scripts
- Check `installed_packages.txt` for complete list of installed packages

### Slow Downloads
- Some packages are large (torch ~200MB, llama-cpp-python ~64MB source)
- Use `--no-cache-dir` flag to avoid pip cache issues
- Consider using pre-built wheels when available

### Windows-Specific Issues
- Use PowerShell for running scripts
- Ensure paths use backslashes or raw strings
- Some packages may require Visual C++ Build Tools
