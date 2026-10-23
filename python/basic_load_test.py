import sys
import os
print("Starting model load test...")
print("Working directory:", os.getcwd())

from llama_cpp import Llama

model_path = "models/phi-3-model-185300.gguf"

if not os.path.exists(model_path):
    print(f"ERROR: Model file not found: {model_path}")
    exit(1)

file_size = os.path.getsize(model_path) / (1024**3)
print(f"Model file: {model_path}")
print(f"Size: {file_size:.2f} GB")
print()

print("Attempting to load model with minimal settings...")
print("This might take 30-90 seconds. Please wait...")

try:
    llm = Llama(
        model_path=model_path,
        n_ctx=512,            # Minimal context
        n_threads=2,          # Minimal threads  
        n_gpu_layers=0,       # CPU only
        verbose=False,        # Less output
        use_mmap=True,        # Memory map the file
        use_mlock=False       # Don't lock memory
    )
    print("\n✓ SUCCESS! Model loaded!")
    print()
    
    # Try a simple generation
    print("Testing inference...")
    result = llm("Hi", max_tokens=5, echo=False)
    print("Response:", result['choices'][0]['text'])
    print("\n✓ Model works correctly!")
    
except Exception as e:
    print(f"\n❌ ERROR: {e}")
    import traceback
    traceback.print_exc()
    exit(1)
