"""
Integration test for LLM Server stdio communication

This script simulates how Node.js would communicate with the Python LLM server
via stdin/stdout using JSON-RPC protocol.

Usage:
    python llm_server.py | python test_llm_stdio.py
    
Or more simply:
    python test_llm_stdio.py

This will start the server as a subprocess and test communication.
"""

import subprocess
import json
import time
import sys

# Ensure UTF-8 output on Windows
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8')


def send_request(process, method, params, request_id):
    """Send a JSON-RPC request to the server"""
    request = {
        "jsonrpc": "2.0",
        "method": method,
        "params": params,
        "id": request_id
    }
    
    request_str = json.dumps(request) + "\n"
    process.stdin.write(request_str)
    process.stdin.flush()
    
    print(f"→ Sent: {method} (id={request_id})")
    print(f"  Params: {params}")


def read_response(process):
    """Read a JSON-RPC response from the server"""
    line = process.stdout.readline()
    
    # Skip the ready message
    if line.strip() == "LLM_SERVER_READY":
        print("✓ Server ready")
        line = process.stdout.readline()
    
    if not line:
        return None
    
    response = json.loads(line)
    print(f"← Received: {response.get('result', response.get('error'))}")
    return response


def test_stdio_communication():
    """Test communication with LLM server via stdio"""
    print("="*60)
    print("LLM Server stdio Communication Test")
    print("="*60)
    print()
    
    # Start the LLM server as a subprocess
    print("Starting LLM server...")
    process = subprocess.Popen(
        [sys.executable, "python/llm_server.py"],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        bufsize=1
    )
    
    try:
        # Wait for ready message
        ready_line = process.stdout.readline()
        if ready_line.strip() == "LLM_SERVER_READY":
            print("✓ Server started successfully\n")
        else:
            print(f"Unexpected output: {ready_line}")
            return False
        
        # Test 1: Health check
        print("\n--- Test 1: Health Check ---")
        send_request(process, "health", {}, 1)
        response = read_response(process)
        
        assert response['jsonrpc'] == '2.0'
        assert 'result' in response
        assert response['result']['status'] == 'not_ready'
        print("✓ Health check passed")
        
        # Test 2: Generate without model
        print("\n--- Test 2: Generate Without Model ---")
        send_request(process, "generate", {"prompt": "Hello", "max_tokens": 50}, 2)
        response = read_response(process)
        
        assert 'result' in response
        assert response['result']['success'] == False
        assert 'Model not loaded' in response['result']['error']
        print("✓ Generate without model handled correctly")
        
        # Test 3: Invalid method
        print("\n--- Test 3: Invalid Method ---")
        send_request(process, "invalid_method", {}, 3)
        response = read_response(process)
        
        assert 'error' in response
        assert response['error']['code'] == -32601
        print("✓ Invalid method handled correctly")
        
        # Test 4: Load model with invalid path
        print("\n--- Test 4: Load Model (Invalid Path) ---")
        send_request(process, "load_model", {"model_path": "/fake/model.gguf"}, 4)
        response = read_response(process)
        
        assert 'result' in response
        assert response['result']['success'] == False
        print("✓ Load model with invalid path handled correctly")
        
        # Test 5: Generate with custom parameters
        print("\n--- Test 5: Generate with Custom Parameters ---")
        send_request(process, "generate", {
            "prompt": "Tell me a joke",
            "max_tokens": 100,
            "temperature": 0.8,
            "top_p": 0.95,
            "top_k": 50,
            "stop": ["User:", "\n\n"],
            "repeat_penalty": 1.2
        }, 5)
        response = read_response(process)
        
        assert 'result' in response
        print("✓ Generate with custom parameters processed")
        
        # Test 6: Final health check
        print("\n--- Test 6: Final Health Check ---")
        send_request(process, "health", {}, 6)
        response = read_response(process)
        
        assert 'result' in response
        stats = response['result']['stats']
        print(f"  Requests handled: {stats.get('requests_handled', 0)}")
        print(f"  Errors: {stats.get('errors', 0)}")
        print("✓ Final health check passed")
        
        print("\n" + "="*60)
        print("✅ ALL STDIO COMMUNICATION TESTS PASSED!")
        print("="*60)
        print("\nThe LLM server correctly:")
        print("  ✓ Communicates via stdin/stdout")
        print("  ✓ Handles JSON-RPC requests")
        print("  ✓ Returns proper responses")
        print("  ✓ Tracks statistics")
        print("  ✓ Handles errors gracefully")
        print("\nReady for integration with Node.js!")
        
        return True
        
    except Exception as e:
        print(f"\n❌ Test failed: {e}")
        import traceback
        traceback.print_exc()
        return False
        
    finally:
        # Clean up
        process.terminate()
        process.wait(timeout=5)
        print("\nServer stopped.")


if __name__ == "__main__":
    success = test_stdio_communication()
    sys.exit(0 if success else 1)
