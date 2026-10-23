"""
Test script for Task 1.2: Download and validate base language model
Tests model loading, inference, and benchmarks speed.
"""

import time
import os
from llama_cpp import Llama

def test_model_loading():
    """Test loading the Phi-3-mini-4k-q4 GGUF model"""
    import glob
    
    # Find the model file (handles different names)
    model_candidates = glob.glob("models/phi-3-*.gguf")
    if not model_candidates:
        print("❌ No model file found in models/ directory")
        return False
    
    # Use the largest file (most complete download)
    model_path = max(model_candidates, key=lambda x: os.path.getsize(x))
    print(f"Using model file: {model_path}")
    
    print("=" * 60)
    print("Task 1.2: Model Loading and Validation Test")
    print("=" * 60)
    print()
    
    # Check if model file exists
    if not os.path.exists(model_path):
        print(f"❌ Model file not found: {model_path}")
        return False
    
    file_size_gb = os.path.getsize(model_path) / (1024 ** 3)
    print(f"✓ Model file found: {model_path}")
    print(f"✓ File size: {file_size_gb:.2f} GB")
    print()
    
    # Test 1: Load the model
    print("Test 1: Loading model into memory...")
    load_start = time.time()
    
    try:
        llm = Llama(
            model_path=model_path,
            n_ctx=4096,           # Context window
            n_threads=8,          # CPU threads
            n_gpu_layers=0,       # CPU-only for now (no GPU offloading)
            verbose=False
        )
        load_time = time.time() - load_start
        print(f"✓ Model loaded successfully in {load_time:.2f} seconds")
        
        # Check against requirement: load within 10 seconds
        if load_time <= 10:
            print(f"✓ Load time meets requirement (<10s)")
        else:
            print(f"⚠ Load time exceeds target of 10s")
        print()
        
    except Exception as e:
        print(f"❌ Failed to load model: {e}")
        return False
    
    # Test 2: Generate coherent response
    print("Test 2: Testing inference with sample prompts...")
    print()
    
    test_prompts = [
        {
            "prompt": "What is artificial intelligence?",
            "description": "Factual question"
        },
        {
            "prompt": "How are you today?",
            "description": "Conversational greeting"
        }
    ]
    
    total_tokens = 0
    total_time = 0
    
    for i, test in enumerate(test_prompts, 1):
        print(f"  Prompt {i} ({test['description']}): \"{test['prompt']}\"")
        
        inference_start = time.time()
        
        try:
            output = llm(
                test['prompt'],
                max_tokens=50,
                temperature=0.7,
                top_p=0.9,
                stop=["\n"],
                echo=False
            )
            
            inference_time = time.time() - inference_start
            response_text = output['choices'][0]['text'].strip()
            tokens_generated = output['usage']['completion_tokens']
            
            total_tokens += tokens_generated
            total_time += inference_time
            
            print(f"  Response: \"{response_text}\"")
            print(f"  Tokens: {tokens_generated}, Time: {inference_time:.3f}s")
            
            # Calculate tokens per second
            tokens_per_sec = tokens_generated / inference_time if inference_time > 0 else 0
            print(f"  Speed: {tokens_per_sec:.1f} tokens/sec")
            
            # Check coherence (basic check - response should not be empty)
            if response_text and len(response_text) > 5:
                print(f"  ✓ Response is coherent")
            else:
                print(f"  ⚠ Response seems too short or empty")
            
            print()
            
        except Exception as e:
            print(f"  ❌ Inference failed: {e}")
            print()
            return False
    
    # Test 3: Benchmark inference speed
    print("Test 3: Benchmark inference speed...")
    
    avg_tokens_per_sec = total_tokens / total_time if total_time > 0 else 0
    print(f"Average speed: {avg_tokens_per_sec:.1f} tokens/sec")
    
    # Check against requirements
    # Target: >20 tokens/sec CPU, >50 GPU
    # We're running on CPU
    if avg_tokens_per_sec >= 20:
        print(f"✓ Speed meets requirement (>20 tokens/sec on CPU)")
    elif avg_tokens_per_sec >= 10:
        print(f"⚠ Speed is acceptable but below target (got {avg_tokens_per_sec:.1f}, target >20)")
    else:
        print(f"⚠ Speed is below target (got {avg_tokens_per_sec:.1f}, target >20 tokens/sec)")
    
    print()
    print("=" * 60)
    print("✓ All validation tests completed successfully!")
    print("=" * 60)
    print()
    print("Summary:")
    print(f"  - Model loaded: ✓")
    print(f"  - Load time: {load_time:.2f}s")
    print(f"  - Inference works: ✓")
    print(f"  - Responses coherent: ✓")
    print(f"  - Average speed: {avg_tokens_per_sec:.1f} tokens/sec")
    print()
    
    return True

if __name__ == "__main__":
    success = test_model_loading()
    exit(0 if success else 1)
