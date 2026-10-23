"""
Test script for Python-Node.js IPC communication using JSON-RPC
"""
import sys
import json

def echo(message: str):
    """Echo back the message with a greeting"""
    return {
        "status": "success",
        "message": f"Python received: {message}",
        "python_version": sys.version
    }

def add(a: int, b: int):
    """Add two numbers"""
    return {
        "status": "success",
        "result": a + b
    }

def test_ml_imports():
    """Test that ML packages can be imported"""
    try:
        import torch
        import transformers
        import llama_cpp
        import peft
        import datasets
        
        return {
            "status": "success",
            "packages": {
                "torch": torch.__version__,
                "transformers": transformers.__version__,
                "llama_cpp_python": llama_cpp.__version__,
                "peft": peft.__version__,
                "datasets": datasets.__version__
            }
        }
    except Exception as e:
        return {
            "status": "error",
            "error": str(e)
        }

# Method registry
METHODS = {
    "echo": echo,
    "add": add,
    "test_ml_imports": test_ml_imports
}

def handle_request(request_str):
    """Handle a single JSON-RPC request"""
    try:
        request = json.loads(request_str)
        method_name = request.get("method")
        params = request.get("params", {})
        request_id = request.get("id")
        
        if method_name not in METHODS:
            return json.dumps({
                "jsonrpc": "2.0",
                "error": {"code": -32601, "message": f"Method not found: {method_name}"},
                "id": request_id
            })
        
        # Call the method
        result = METHODS[method_name](**params)
        
        # Return success response
        return json.dumps({
            "jsonrpc": "2.0",
            "result": result,
            "id": request_id
        })
        
    except Exception as e:
        return json.dumps({
            "jsonrpc": "2.0",
            "error": {"code": -32603, "message": str(e)},
            "id": request.get("id") if isinstance(request, dict) else None
        })

def main():
    """Main loop for handling JSON-RPC requests over stdio"""
    print("Python IPC test server ready", file=sys.stderr, flush=True)
    
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        
        response = handle_request(line)
        print(response, flush=True)

if __name__ == "__main__":
    main()
