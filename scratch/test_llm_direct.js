import { LLMEngine } from '../src/llm-engine.js';

async function test() {
  const engine = new LLMEngine({ logStderr: true });
  console.log('Starting engine...');
  await engine.start();
  console.log('Engine started. Loading model...');
  await engine.loadModel();
  console.log('Model loaded. Generating...');
  const t0 = Date.now();
  const res = await engine.generate({
    prompt: '<|user|>\nHello! Tell me one short sentence.<|end|>\n<|assistant|>\n',
    max_tokens: 30
  });
  console.log(`Generated in ${Date.now() - t0}ms:`, res);
  await engine.stop();
  process.exit(0);
}

test().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
