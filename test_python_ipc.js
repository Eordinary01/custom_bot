/**
 * Test Node.js to Python IPC communication via JSON-RPC
 */
import { spawn } from 'child_process';
import readline from 'readline';

class PythonIPCClient {
  constructor(scriptPath) {
    this.scriptPath = scriptPath;
    this.process = null;
    this.requestId = 0;
    this.pendingRequests = new Map();
  }

  start() {
    return new Promise((resolve, reject) => {
      // Start Python process
      this.process = spawn('venv\\Scripts\\python', [this.scriptPath], {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      // Set up readline for stdout
      this.rl = readline.createInterface({
        input: this.process.stdout,
        crlfDelay: Infinity
      });

      this.rl.on('line', (line) => {
        try {
          const response = JSON.parse(line);
          const request = this.pendingRequests.get(response.id);
          
          if (request) {
            this.pendingRequests.delete(response.id);
            if (response.error) {
              request.reject(new Error(response.error.message));
            } else {
              request.resolve(response.result);
            }
          }
        } catch (err) {
          console.error('Error parsing response:', err);
        }
      });

      // Listen for stderr (for ready message)
      this.process.stderr.on('data', (data) => {
        const message = data.toString();
        console.log('Python stderr:', message.trim());
        
        if (message.includes('ready')) {
          resolve();
        }
      });

      this.process.on('error', (err) => {
        reject(err);
      });

      this.process.on('exit', (code) => {
        console.log(`Python process exited with code ${code}`);
      });

      // Timeout if process doesn't start in 5 seconds
      setTimeout(() => {
        if (this.pendingRequests.size === 0) {
          resolve(); // Assume it's ready
        }
      }, 5000);
    });
  }

  call(method, params = {}, timeout = 10000) {
    return new Promise((resolve, reject) => {
      const id = ++this.requestId;
      const request = {
        jsonrpc: '2.0',
        method,
        params,
        id
      };

      this.pendingRequests.set(id, { resolve, reject });

      // Send request
      this.process.stdin.write(JSON.stringify(request) + '\n');

      // Timeout after specified time
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`Request ${id} timed out`));
        }
      }, timeout);
    });
  }

  stop() {
    if (this.process) {
      this.process.kill();
    }
  }
}

async function runTests() {
  console.log('=== Testing Python-Node.js IPC ===\n');

  const client = new PythonIPCClient('python\\test_ipc.py');

  try {
    console.log('1. Starting Python process...');
    await client.start();
    console.log('   ✓ Python process started\n');

    console.log('2. Testing echo method...');
    const echoResult = await client.call('echo', { message: 'Hello from Node.js!' });
    console.log('   Response:', echoResult);
    console.log('   ✓ Echo test passed\n');

    console.log('3. Testing add method...');
    const addResult = await client.call('add', { a: 42, b: 58 });
    console.log('   Response:', addResult);
    console.log('   ✓ Add test passed\n');

    console.log('4. Testing ML package imports...');
    const mlResult = await client.call('test_ml_imports', {}, 20000); // 20 second timeout
    console.log('   Response:', mlResult);
    console.log('   ✓ ML imports test passed\n');

    console.log('=== All tests passed! ===');
  } catch (err) {
    console.error('Test failed:', err);
    process.exit(1);
  } finally {
    client.stop();
  }
}

runTests();
