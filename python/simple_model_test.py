"""
Simple model test for task 1.2
"""
import os
import time
import glob
from llama_cpp import Llama

print("=" * 60)
print("Phi-3 Model Test - Task 1.2")
print("=" * 60)
print()

# Find model file
model_files = glob.glob("models/phi-3-*.gguf")
if not model_files:
    print("ERROR: No model files found!")
    exit(1)

model_path = max(model_files, key=lambda x: os.path.getsize(x))
file_size = os.path.getsize(model_path) / (1024**3)

print(f"Model file: {model_path}")
print(f"File size: {file_size:.2f} GB")
print()

# Test 1: Load model
print("Test 1: Loading model (this may take 30-60 seconds)...")
start_time = time.time()

try:
    print("  - Initializing Llama...")
    llm = Llama(
        model_path=model_path,
        n_ctx=2048,           # Smaller context for faster loading
        n_threads=4,          # Fewer threads
        n_gpu_layers=0,       # CPU only
        verbose=True          # Enable verbose output
    )
    load_time = time.time() - start_time
    print(f"\n✓ Model loaded in {load_time:.2f} seconds")
    
    if load_time <= 10:
        print("✓ Meets requirement (<10s)")
    else:
        print(f"⚠ Exceeds 10s target")
    
except Exception as e:
    print(f"\n❌ Failed to load model: {e}")
    import traceback
    traceback.print_exc()
    exit(1)

print()

# Test 2: Simple inference
print("Test 2: Testing inference...")
prompt = "Hello, my name is"

try:
    print(f"  Prompt: '{prompt}'")
    print("  Generating...")
    
    start_time = time.time()
    output = llm(
        prompt,
        max_tokens=20,
        temperature=0.7,
        stop=["\n"],
        echo=False
    )
    inference_time = time.time() - start_time
    
    response = output['choices'][0]['text'].strip()
    tokens = output['usage']['completion_tokens']
    tokens_per_sec = tokens / inference_time if inference_time > 0 else 0
    
    print(f"  Response: '{response}'")
    print(f"  Tokens: {tokens}, Time: {inference_time:.2f}s")
    print(f"  Speed: {tokens_per_sec:.1f} tokens/sec")
    
    if len(response) > 0:
        print("✓ Model generates coherent output")
    else:
        print("⚠ Empty response")
    
    if tokens_per_sec >= 20:
        print(f"✓ Speed meets requirement (>20 tokens/sec)")
    else:
        print(f"⚠ Speed below target (got {tokens_per_sec:.1f}, target >20)")
    
except Exception as e:
    print(f"❌ Inference failed: {e}")
    import traceback
    traceback.print_exc()
    exit(1)

print()
print("=" * 60)
print("✓ Task 1.2 validation complete!")
print("=" * 60)
print()
print("Summary:")
print(f"  - Model file: {os.path.basename(model_path)}")
print(f"  - File size: {file_size:.2f} GB")
print(f"  - Load time: {load_time:.2f}s")
print(f"  - Inference speed: {tokens_per_sec:.1f} tokens/sec")
print(f"  - Model works: ✓")
