"""
JARVIS Conversational AI - LLM Server
JSON-RPC server for local language model inference

This server provides:
- Model loading and management
- Text generation with configurable sampling
- Embeddings generation (placeholder for future)
- Health checks and diagnostics

Requirements: 3.1, 3.2, 3.4, 9.1, 14.1, 14.2
"""

import sys
import json
import time
import logging
import os
import threading
import queue
from typing import Dict, Any, Optional, List
from datetime import datetime
import traceback

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('llm_server.log'),
        logging.StreamHandler(sys.stderr)
    ]
)
logger = logging.getLogger('llm_server')

try:
    from llama_cpp import Llama
    LLAMA_AVAILABLE = True
except ImportError:
    Llama = None
    LLAMA_AVAILABLE = False


class LLMServer:
    """
    Local LLM inference server using llama.cpp
    
    Handles model loading, inference, and communication with Node.js via JSON-RPC
    """
    
    def __init__(self):
        self.model = None
        self.model_loaded = False
        self.model_path = None
        self.model_config = {}
        self.abort_event = threading.Event()
        self.stats = {
            'requests_handled': 0,
            'errors': 0,
            'total_tokens_generated': 0,
            'total_inference_time_ms': 0,
            'started_at': datetime.now().isoformat()
        }
        logger.info("LLM Server initialized")

    def abort(self, request_id: Optional[Any] = None) -> Dict[str, Any]:
        """Abort in-flight generation request"""
        logger.info(f"Abort signal received for request ID: {request_id}")
        self.abort_event.set()
        return {'success': True, 'aborted': request_id}

    
    def load_model(self, model_path: str, config: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """
        Load the language model into memory
        
        Args:
            model_path: Path to the GGUF model file
            config: Optional configuration (n_ctx, n_gpu_layers, n_threads, etc.)
        
        Returns:
            Dictionary with status and model info
        """
        try:
            logger.info(f"Loading model from: {model_path}")
            start_time = datetime.now()
            
            if not LLAMA_AVAILABLE or Llama is None:
                logger.error("llama-cpp-python not installed")
                return {
                    'success': False,
                    'error': 'llama-cpp-python not installed. Run: pip install llama-cpp-python'
                }
            
            # Default configuration
            default_config = {
                'n_ctx': 4096,          # Context window size
                'n_threads': 8,         # CPU threads
                'n_gpu_layers': 0,      # GPU layers (0 for CPU-only)
                'use_mlock': False,     # Disabled on Windows to avoid privilege/paging stalls
                'use_mmap': True,       # Memory-map model file
                'verbose': False        # Disable llama.cpp logging
            }
            
            # Merge with provided config
            if config:
                default_config.update(config)
            
            self.model_config = default_config
            
            # Optional LoRA adapter path
            lora_path = default_config.get('lora_path') or (config.get('lora_path') if config else None)
            lora_kwargs = {'lora_path': lora_path} if lora_path and os.path.exists(lora_path) else {}

            # Load the model
            self.model = Llama(
                model_path=model_path,
                n_ctx=default_config['n_ctx'],
                n_threads=default_config['n_threads'],
                n_gpu_layers=default_config['n_gpu_layers'],
                use_mlock=default_config['use_mlock'],
                use_mmap=default_config['use_mmap'],
                verbose=default_config['verbose'],
                **lora_kwargs
            )
            
            self.model_path = model_path
            self.model_loaded = True
            
            load_time = (datetime.now() - start_time).total_seconds()
            logger.info(f"Model loaded successfully in {load_time:.2f}s")
            
            return {
                'success': True,
                'model_path': model_path,
                'config': self.model_config,
                'load_time_seconds': load_time
            }
            
        except FileNotFoundError:
            error_msg = f"Model file not found: {model_path}"
            logger.error(error_msg)
            return {'success': False, 'error': error_msg}
        
        except Exception as e:
            error_msg = f"Error loading model: {str(e)}"
            logger.error(error_msg)
            logger.error(traceback.format_exc())
            return {'success': False, 'error': error_msg}
    
    def generate(
        self,
        prompt: str,
        max_tokens: int = 150,
        temperature: float = 0.7,
        top_p: float = 0.9,
        top_k: int = 40,
        stop: Optional[List[str]] = None,
        repeat_penalty: float = 1.1,
        stream: bool = False,
        request_id: Optional[Any] = None
    ) -> Dict[str, Any]:
        """
        Generate text completion for the given prompt (supports progressive streaming)
        
        Args:
            prompt: Input text prompt
            max_tokens: Maximum tokens to generate
            temperature: Sampling temperature (0.0-2.0)
            top_p: Nucleus sampling parameter
            top_k: Top-k sampling parameter
            stop: List of stop sequences
            repeat_penalty: Penalty for repeating tokens
            stream: Emit progressive tokens over stdout
            request_id: Optional JSON-RPC request ID for token routing
        
        Returns:
            Dictionary with generated text and metadata
        """
        try:
            if not self.model_loaded:
                return {
                    'success': False,
                    'error': 'Model not loaded. Call load_model first.'
                }
            
            logger.info(f"Generating response for prompt (length: {len(prompt)} chars, stream={stream})")
            start_time = datetime.now()
            self.abort_event.clear()

            # Always use generator iteration so we can abort on every token
            output_stream = self.model(
                prompt,
                max_tokens=max_tokens,
                temperature=temperature,
                top_p=top_p,
                top_k=top_k,
                stop=stop or [],
                repeat_penalty=repeat_penalty,
                echo=False,
                stream=True
            )
            generated_text = ""
            tokens_generated = 0
            finish_reason = 'stop'

            for chunk in output_stream:
                if self.abort_event.is_set():
                    logger.warning(f"Generation aborted by client signal for request {request_id}")
                    return {
                        'success': False,
                        'error': 'Generation aborted by client',
                        'aborted': True,
                        'text': generated_text,
                        'tokens_generated': tokens_generated,
                        'inference_time_ms': int((datetime.now() - start_time).total_seconds() * 1000)
                    }

                token_piece = chunk['choices'][0]['text']
                generated_text += token_piece
                tokens_generated += 1
                if chunk['choices'][0].get('finish_reason'):
                    finish_reason = chunk['choices'][0]['finish_reason']

                if stream:
                    # Emit progressive token notification over stdout
                    sys.stdout.write(json.dumps({
                        'jsonrpc': '2.0',
                        'method': 'token',
                        'params': {
                            'id': request_id,
                            'token': token_piece
                        }
                    }) + '\n')
                    sys.stdout.flush()

            inference_time_ms = int((datetime.now() - start_time).total_seconds() * 1000)
            
            # Update stats
            self.stats['requests_handled'] += 1
            self.stats['total_tokens_generated'] += tokens_generated
            self.stats['total_inference_time_ms'] += inference_time_ms
            
            logger.info(f"Generated {tokens_generated} tokens in {inference_time_ms}ms")
            
            return {
                'success': True,
                'text': generated_text,
                'tokens_generated': tokens_generated,
                'inference_time_ms': inference_time_ms,
                'finish_reason': finish_reason
            }
            
        except Exception as e:
            self.stats['errors'] += 1
            error_msg = f"Error during generation: {str(e)}"
            logger.error(error_msg)
            logger.error(traceback.format_exc())
            return {'success': False, 'error': error_msg}
    
    def embed(self, text: str) -> Dict[str, Any]:
        """
        Generate embeddings for the given text (placeholder for future implementation)
        
        Args:
            text: Input text to embed
        
        Returns:
            Dictionary with embedding vector
        """
        try:
            if not self.model_loaded:
                return {
                    'success': False,
                    'error': 'Model not loaded. Call load_model first.'
                }
            
            # For now, return a placeholder
            # In the future, this would use the model's embedding capabilities
            logger.warning("Embeddings not yet fully implemented")
            return {
                'success': False,
                'error': 'Embeddings feature not yet implemented'
            }
            
        except Exception as e:
            error_msg = f"Error generating embeddings: {str(e)}"
            logger.error(error_msg)
            return {'success': False, 'error': error_msg}
    
    def health(self) -> Dict[str, Any]:
        """
        Return health status and server statistics
        
        Returns:
            Dictionary with health status and stats
        """
        avg_inference_time = 0
        if self.stats['requests_handled'] > 0:
            avg_inference_time = (
                self.stats['total_inference_time_ms'] / 
                self.stats['requests_handled']
            )
        
        avg_tokens_per_request = 0
        if self.stats['requests_handled'] > 0:
            avg_tokens_per_request = (
                self.stats['total_tokens_generated'] / 
                self.stats['requests_handled']
            )
        
        return {
            'status': 'healthy' if self.model_loaded else 'not_ready',
            'model_loaded': self.model_loaded,
            'model_path': self.model_path,
            'model_config': self.model_config,
            'stats': {
                **self.stats,
                'avg_inference_time_ms': round(avg_inference_time, 2),
                'avg_tokens_per_request': round(avg_tokens_per_request, 2)
            },
            'timestamp': datetime.now().isoformat()
        }
    
    def sleep(self, seconds: float = 1.0) -> Dict[str, Any]:
        """Sleep for testing timeouts"""
        time.sleep(seconds)
        return {'success': True, 'slept': seconds}


class JSONRPCHandler:
    """
    Handle JSON-RPC 2.0 protocol communication over stdio with immediate abort interception
    """
    
    def __init__(self, server: LLMServer):
        self.server = server
        self.request_queue = queue.Queue()
        self.methods = {
            'load_model': self.server.load_model,
            'generate': self.server.generate,
            'embed': self.server.embed,
            'health': self.server.health,
            'sleep': self.server.sleep,
            'abort': self.server.abort
        }
        logger.info("JSON-RPC handler initialized")

    def _stdin_reader(self):
        """Background thread to read stdin and immediately intercept abort signals"""
        try:
            while True:
                raw_line = sys.stdin.readline()
                if not raw_line:
                    break
                line = raw_line.strip()
                if not line:
                    continue
                try:
                    parsed = json.loads(line)
                    if isinstance(parsed, dict) and parsed.get('method') == 'abort':
                        req_id = parsed.get('params', {}).get('id') if isinstance(parsed.get('params'), dict) else None
                        logger.info(f"Intercepted abort signal on stdin for request {req_id}")
                        self.server.abort(req_id)
                        resp = json.dumps({
                            'jsonrpc': '2.0',
                            'result': {'success': True, 'aborted': req_id},
                            'id': parsed.get('id')
                        })
                        print(resp, flush=True)
                        continue
                except Exception:
                    pass
                self.request_queue.put(line)
        except Exception as e:
            logger.error(f"Stdin reader error: {str(e)}")
        finally:
            self.request_queue.put(None)
    
    def handle_request(self, request_str: str) -> str:
        """
        Handle a single JSON-RPC request
        
        Args:
            request_str: JSON-RPC request as string
        
        Returns:
            JSON-RPC response as string
        """
        try:
            # Parse request
            request = json.loads(request_str)
            
            # Validate JSON-RPC 2.0
            if request.get('jsonrpc') != '2.0':
                return self._error_response(
                    -32600, 
                    "Invalid Request: jsonrpc version must be 2.0",
                    request.get('id')
                )
            
            method_name = request.get('method')
            params = request.get('params', {})
            request_id = request.get('id')
            
            # Check if method exists
            if method_name not in self.methods:
                return self._error_response(
                    -32601, 
                    f"Method not found: {method_name}",
                    request_id
                )
            
            # Call the method
            logger.info(f"Handling request: {method_name}")
            if method_name == 'generate':
                params['request_id'] = request_id
            result = self.methods[method_name](**params)
            
            # Return success response
            return json.dumps({
                'jsonrpc': '2.0',
                'result': result,
                'id': request_id
            })
            
        except json.JSONDecodeError as e:
            return self._error_response(-32700, f"Parse error: {str(e)}", None)
        
        except TypeError as e:
            # Invalid parameters
            return self._error_response(
                -32602, 
                f"Invalid params: {str(e)}",
                request.get('id') if isinstance(request, dict) else None
            )
        
        except Exception as e:
            # Internal error
            logger.error(f"Internal error: {str(e)}")
            logger.error(traceback.format_exc())
            return self._error_response(
                -32603, 
                f"Internal error: {str(e)}",
                request.get('id') if isinstance(request, dict) else None
            )
    
    def _error_response(self, code: int, message: str, request_id: Any) -> str:
        """Create a JSON-RPC error response"""
        return json.dumps({
            'jsonrpc': '2.0',
            'error': {
                'code': code,
                'message': message
            },
            'id': request_id
        })
    
    def run(self):
        """
        Main event loop - read requests from stdin, write responses to stdout
        """
        logger.info("LLM Server ready - waiting for requests on stdin")
        print("LLM_SERVER_READY", flush=True)  # Signal to Node.js that we're ready

        # Start stdin reader thread
        reader_thread = threading.Thread(target=self._stdin_reader, daemon=True)
        reader_thread.start()
        
        try:
            while True:
                line = self.request_queue.get()
                if line is None:
                    break
                
                # Handle request and send response
                response = self.handle_request(line)
                print(response, flush=True)
                
        except KeyboardInterrupt:
            logger.info("Received interrupt signal, shutting down")
        except Exception as e:
            logger.error(f"Fatal error in main loop: {str(e)}")
            logger.error(traceback.format_exc())
            sys.exit(1)


def main():
    """Entry point for the LLM server"""
    logger.info("Starting LLM Server...")
    
    # Create server and handler
    server = LLMServer()
    handler = JSONRPCHandler(server)
    
    # Run the event loop
    handler.run()


if __name__ == "__main__":
    main()
