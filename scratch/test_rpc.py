import subprocess
import json
import time

p = subprocess.Popen(
    ['venv\\Scripts\\python.exe', 'python\\llm_server.py'],
    stdin=subprocess.PIPE,
    stdout=subprocess.PIPE,
    stderr=subprocess.PIPE,
    text=True,
    bufsize=1
)

# Read ready line
ready = p.stdout.readline()
print('READY LINE:', repr(ready))

req = json.dumps({
    'jsonrpc': '2.0',
    'method': 'load_model',
    'params': {
        'model_path': 'models/phi-3-mini-4k-q4.gguf',
        'config': {'n_ctx': 2048, 'n_threads': 4, 'verbose': False}
    },
    'id': 1
}) + '\n'

print('SENDING load_model...')
p.stdin.write(req)
p.stdin.flush()

res = p.stdout.readline()
print('RESPONSE:', repr(res))

p.kill()
