import sys
print("Python version:", sys.version)
print("Importing llama_cpp...")

try:
    import llama_cpp
    print("✓ llama_cpp imported successfully")
    print("Version:", llama_cpp.__version__)
except Exception as e:
    print("❌ Failed to import llama_cpp:", e)
    exit(1)

print("\nChecking model file...")
import os
import glob

model_files = glob.glob("models/phi-3-*.gguf")
print(f"Found {len(model_files)} model file(s)")

for f in model_files:
    size_gb = os.path.getsize(f) / (1024**3)
    print(f"  - {f}: {size_gb:.2f} GB")

print("\nTest complete!")
