import Executor from './executor.js';

const executor = new Executor();

console.log('🧪 Testing Executor Class\n');

const tests = [
  { action: 'greeting', text: 'hello', expectResponse: true },
  { action: 'time', text: 'what time is it', expectResponse: true },
  { action: 'date', text: 'what date', expectResponse: true },
  { action: 'joke', text: 'tell me a joke', expectResponse: true },
  { action: 'thanks', text: 'thank you', expectResponse: true },
  { action: 'help', text: 'help', expectResponse: true },
  { action: 'test_speech', text: 'test speech', expectResponse: true },
  { action: 'sleep_assistant', text: 'sleep now', expectResponse: true },
  { action: 'repeat', text: 'repeat', expectResponse: true },
  { action: 'unknown_action', text: 'blah blah', expectResponse: true },
  // Test all open commands (non-blocking, just verify they set response)
  { action: 'open_chrome', text: 'open chrome', expectResponse: true },
  { action: 'open_calculator', text: 'calculator', expectResponse: true },
  { action: 'open_notepad', text: 'open notepad', expectResponse: true },
];

let pass = 0;
let fail = 0;

async function runTests() {
  for (const test of tests) {
    try {
      await executor.run(test.action, test.text);
      
      if (test.expectResponse && executor.lastResponse) {
        console.log(`✅ PASS: ${test.action.padEnd(25)} => "${executor.lastResponse.substring(0, 50)}${executor.lastResponse.length > 50 ? '...' : ''}"`);
        pass++;
      } else if (!test.expectResponse && !executor.lastResponse) {
        console.log(`✅ PASS: ${test.action.padEnd(25)} => (no response expected)`);
        pass++;
      } else {
        console.log(`❌ FAIL: ${test.action.padEnd(25)} => Expected response but got none`);
        fail++;
      }
    } catch (err) {
      console.log(`❌ FAIL: ${test.action.padEnd(25)} => Error: ${err.message}`);
      fail++;
    }
  }

  console.log(`\n📊 Results: ${pass}/${pass + fail} tests passed`);
  
  if (fail > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runTests();
