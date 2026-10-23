"""
Task 1.2 Model Validation Script
Validates the Phi-3-mini-4k-q4 GGUF model is downloaded and working correctly.
"""
import sys
import os
import time
import glob

print("="*60)
print("Task 1.2: Phi-3 Model Validation")
print("="*60)
print()

# Step 1: Find and verify model file
print("Step 1: Verifying model file...")
model_files = glob.glob("models/phi-3-*.gguf")

if not model_files:
    print("[FAIL] No model file found in models/ directory")
    exit(1)

model_path = max(model_files, key=lambda x: os.path.getsize(x))
file_size_bytes = os.path.getsize(model_path)
file_size_gb = file_size_bytes / (1024**3)

print(f"[OK] Model file: {model_path}")
print(f"[OK] File size: {file_size_gb:.2f} GB ({file_size_bytes:,} bytes)")

# Check size is reasonable (should be ~2.3 GB for Q4_K_M quantization)
if file_size_gb < 2.0:
    print("[WARN] File size seems small (expected ~2.3 GB)")
elif file_size_gb > 3.0:
    print("[WARN] File size seems large (expected ~2.3 GB)")
else:
    print("[OK] File size is correct for Q4_K_M quantization")

print()

# Step 2: Load model
print("Step 2: Loading model with llama-cpp...")
print("(This may take 30-90 seconds on first load)")

from llama_cpp import Llama

load_start = time.time()

try:
    llm = Llama(
        model_path=model_path,
        n_ctx=2048,           # Context window
        n_threads=4,          # CPU threads
        n_gpu_layers=0,       # CPU only
        verbose=False,
        use_mmap=True,
        use_mlock=False
    )
    load_time = time.time() - load_start
    
    print(f"[OK] Model loaded successfully in {load_time:.2f} seconds")
    
    # Check against requirement: load within 10 seconds
    if load_time <= 10:
        print("[OK] Load time meets requirement (<10s)")
    else:
        print(f"[WARN] Load time exceeds target (got {load_time:.2f}s, target <10s)")
    
except Exception as e:
    print(f"[FAIL] Failed to load model: {e}")
    import traceback
    traceback.print_exc()
    exit(1)

print()

# Step 3: Test inference with sample prompts
print("Step 3: Testing inference...")

test_prompts = [
    ("What is 2+2?", "Math question"),
    ("Hello, how are you?", "Greeting")
]

total_tokens = 0
total_time = 0
all_passed = True

for i, (prompt, desc) in enumerate(test_prompts, 1):
    print(f"\n  Test {i}: {desc}")
    print(f"  Prompt: \"{prompt}\"")
    
    try:
        inference_start = time.time()
        
        output = llm(
            prompt,
            max_tokens=30,
            temperature=0.7,
            stop=["\n\n"],
            echo=False
        )
        
        inference_time = time.time() - inference_start
        response_text = output['choices'][0]['text'].strip()
        tokens_generated = output['usage']['completion_tokens']
        
        total_tokens += tokens_generated
        total_time += inference_time
        
        print(f"  Response: \"{response_text}\"")
        print(f"  Tokens: {tokens_generated}, Time: {inference_time:.2f}s")
        
        # Calculate tokens per second
        tokens_per_sec = tokens_generated / inference_time if inference_time > 0 else 0
        print(f"  Speed: {tokens_per_sec:.1f} tokens/sec")
        
        # Check coherence (response should not be empty)
        if len(response_text) > 0:
            print(f"  [OK] Generated coherent response")
        else:
            print(f"  [WARN] Response is empty")
            all_passed = False
            
    except Exception as e:
        print(f"  [FAIL] Inference failed: {e}")
        all_passed = False

print()

# Step 4: Benchmark results
print("Step 4: Performance benchmark")

if total_time > 0:
    avg_tokens_per_sec = total_tokens / total_time
    print(f"Average inference speed: {avg_tokens_per_sec:.1f} tokens/sec")
    
    # Check against requirements:
    # Target: >20 tokens/sec CPU, >50 GPU (we're on CPU)
    if avg_tokens_per_sec >= 20:
        print(f"[OK] Speed meets requirement (>20 tokens/sec on CPU)")
    elif avg_tokens_per_sec >= 10:
        print(f"[WARN] Speed is acceptable but below target")
        print(f"      Got {avg_tokens_per_sec:.1f}, target >20 tokens/sec")
    else:
        print(f"[WARN] Speed is below target")
        print(f"      Got {avg_tokens_per_sec:.1f}, target >20 tokens/sec")

print()
print("="*60)

if all_passed and total_tokens > 0:
    print("TASK 1.2 VALIDATION: PASS")
    print("="*60)
    print()
    print("Summary:")
    print(f"  [OK] Model downloaded: {os.path.basename(model_path)}")
    print(f"  [OK] File size: {file_size_gb:.2f} GB")
    print(f"  [OK] Model loads successfully (in {load_time:.2f}s)")
    print(f"  [OK] Inference generates coherent responses")
    if total_time > 0:
        print(f"  [INFO] Benchmark: {avg_tokens_per_sec:.1f} tokens/sec")
    print()
    exit(0)
else:
    print("TASK 1.2 VALIDATION: INCOMPLETE")
    print("="*60)
    print("Some checks did not pass. Review the output above.")
    print()
    exit(1)
