import CommandRouter from './commandRouter.js';
import Executor from './executor.js';

console.log('🧪 Integration Test: Router + Executor\n');

const router = new CommandRouter();
const executor = new Executor();

const tests = [
  { input: 'open chrome', expectedAction: 'open_chrome', shouldExecute: true },
  { input: 'what time is it', expectedAction: 'time', shouldExecute: true },
  { input: 'tell me a joke', expectedAction: 'joke', shouldExecute: true },
  { input: 'sleep now', expectedAction: 'sleep_assistant', shouldExecute: true },
  { input: 'OPEN NOTEPAD', expectedAction: 'open_notepad', shouldExecute: true }, // Test case insensitivity
  { input: '  volume up  ', expectedAction: 'volume_up', shouldExecute: true }, // Test whitespace
  { input: 'hey can you open calculator please', expectedAction: 'open_calculator', shouldExecute: true }, // Test partial match
  { input: 'xyzabc', expectedAction: null, shouldExecute: false }, // Test unknown command
  { input: '', expectedAction: null, shouldExecute: false }, // Test empty input
  { input: '   ', expectedAction: null, shouldExecute: false }, // Test whitespace only
];

let pass = 0;
let fail = 0;

async function runIntegrationTests() {
  for (const test of tests) {
    const match = router.match(test.input);
    const actualAction = match ? match.action : null;

    if (actualAction === test.expectedAction) {
      if (test.shouldExecute && match) {
        await executor.run(match.action, test.input);
        if (executor.lastResponse) {
          console.log(`✅ PASS: "${test.input.substring(0, 30).padEnd(30)}" => ${actualAction} => ${executor.lastResponse.substring(0, 30)}...`);
          pass++;
        } else {
          console.log(`❌ FAIL: "${test.input.substring(0, 30).padEnd(30)}" => ${actualAction} => No response`);
          fail++;
        }
      } else {
        console.log(`✅ PASS: "${test.input.substring(0, 30).padEnd(30)}" => ${actualAction || '(no match)'}`);
        pass++;
      }
    } else {
      console.log(`❌ FAIL: "${test.input.substring(0, 30).padEnd(30)}" => Expected ${test.expectedAction}, got ${actualAction}`);
      fail++;
    }
  }

  console.log(`\n📊 Results: ${pass}/${pass + fail} tests passed`);

  if (fail > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runIntegrationTests();
