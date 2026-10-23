/**
 * Unit & Integration Tests for Prompt Templates & Formatting
 * Tests Task 2.4 requirements:
 * 1. Phi-3 token formatting compliance (<|system|>, <|user|>, <|assistant|>, <|end|>)
 * 2. Dynamic context injection (date, time, user name, system status)
 * 3. Multi-turn conversation history rendering
 * 4. Specialized prompts (Intent Classification, Action Extraction)
 * 5. Response cleanup and post-processing
 * 6. Live generation test with JARVIS personality prompt
 */

import {
  PHI3_TOKENS,
  SAMPLING_PRESETS,
  formatDynamicContext,
  formatPhi3Prompt,
  buildJarvisPrompt,
  buildIntentClassificationPrompt,
  buildActionExtractionPrompt,
  cleanResponse
} from './src/prompt-templates.js';
import { LLMEngine } from './src/llm-engine.js';
import path from 'path';
import fs from 'fs';

let testsPassed = 0;
let testsFailed = 0;

function assert(condition, message) {
  if (!condition) {
    testsFailed++;
    console.error(`  ❌ Assertion Failed: ${message}`);
    throw new Error(message);
  }
}

function runTest(name, fn) {
  console.log(`\n--- Test: ${name} ---`);
  try {
    fn();
    testsPassed++;
    console.log(`  ✓ Passed`);
  } catch (err) {
    console.error(`  ❌ Failed: ${err.message}`);
  }
}

async function runAsyncTest(name, fn) {
  console.log(`\n--- Test: ${name} ---`);
  try {
    await fn();
    testsPassed++;
    console.log(`  ✓ Passed`);
  } catch (err) {
    console.error(`  ❌ Failed: ${err.message}`);
  }
}

async function runAllTests() {
  console.log('='.repeat(60));
  console.log('JARVIS Prompt Templates Test Suite');
  console.log('Testing Task 2.4 requirements');
  console.log('='.repeat(60));

  // 1. Phi-3 Token Structure Test
  runTest('Phi-3 Instruct Structure & Tag Boundaries', () => {
    const prompt = formatPhi3Prompt({
      systemPrompt: 'System instructions.',
      turns: [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Greetings.' }
      ],
      userInput: 'What can you do?'
    });

    assert(prompt.startsWith(`${PHI3_TOKENS.SYSTEM}\nSystem instructions.${PHI3_TOKENS.END}\n`), 'Starts with system block');
    assert(prompt.includes(`${PHI3_TOKENS.USER}\nHello${PHI3_TOKENS.END}\n`), 'Includes turn 1 user');
    assert(prompt.includes(`${PHI3_TOKENS.ASSISTANT}\nGreetings.${PHI3_TOKENS.END}\n`), 'Includes turn 1 assistant');
    assert(prompt.includes(`${PHI3_TOKENS.USER}\nWhat can you do?${PHI3_TOKENS.END}\n`), 'Includes current user input');
    assert(prompt.endsWith(`${PHI3_TOKENS.ASSISTANT}\n`), 'Ends ready for assistant completion');
  });

  // 2. Dynamic Context Injection
  runTest('Dynamic Context Injection', () => {
    const contextStr = formatDynamicContext({
      userName: 'Parth',
      currentDate: 'Monday, January 1, 2026',
      currentTime: '10:30 AM',
      systemStatus: 'Battery at 95%, Network connected',
      activeApp: 'Visual Studio Code'
    });

    assert(contextStr.includes('User: Parth'), 'Includes user name');
    assert(contextStr.includes('Current Date: Monday, January 1, 2026'), 'Includes custom date');
    assert(contextStr.includes('Current Time: 10:30 AM'), 'Includes custom time');
    assert(contextStr.includes('System Status: Battery at 95%'), 'Includes system status');
    assert(contextStr.includes('Active Application: Visual Studio Code'), 'Includes active application');
  });

  // 3. Full JARVIS Prompt Builder
  runTest('Full JARVIS Prompt Builder with Context & Persona', () => {
    const prompt = buildJarvisPrompt({
      userInput: 'Status report, please.',
      userName: 'Sir',
      context: [
        { role: 'user', content: 'Good morning' },
        { role: 'assistant', content: 'Good morning, sir.' }
      ]
    });

    assert(prompt.includes('You are JARVIS'), 'Includes JARVIS identity');
    assert(prompt.includes('User: Sir'), 'Includes user title');
    assert(prompt.includes('Good morning'), 'Includes conversation history');
    assert(prompt.includes('Status report, please.'), 'Includes input');
    assert(prompt.endsWith(`${PHI3_TOKENS.ASSISTANT}\n`), 'Ends with assistant tag');
  });

  // 4. Intent Classification Prompt Builder
  runTest('Intent Classification Prompt Builder', () => {
    const prompt = buildIntentClassificationPrompt({
      userInput: 'Launch Spotify and turn up volume'
    });

    assert(prompt.includes('intent classifier'), 'Includes classification instruction');
    assert(prompt.includes('action'), 'Mentions action category');
    assert(prompt.includes('conversational'), 'Mentions conversational category');
    assert(prompt.includes('hybrid'), 'Mentions hybrid category');
    assert(prompt.includes('Launch Spotify and turn up volume'), 'Includes target user input');
  });

  // 5. Action Extraction Prompt Builder
  runTest('Action Extraction Prompt Builder', () => {
    const prompt = buildActionExtractionPrompt({
      userInput: 'Turn up the audio',
      availableActions: ['volume_up', 'volume_down', 'mute', 'open_chrome']
    });

    assert(prompt.includes('action extractor'), 'Includes extractor instruction');
    assert(prompt.includes('volume_up, volume_down'), 'Includes actions list');
    assert(prompt.includes('Turn up the audio'), 'Includes user request');
  });

  // 6. Response Cleanup
  runTest('Response Cleanup and Post-Processing', () => {
    const raw1 = `<|assistant|> JARVIS: Good day, sir! How may I assist you today?<|end|>`;
    const clean1 = cleanResponse(raw1);
    assert(clean1 === 'Good day, sir! How may I assist you today?', `Cleaned: "${clean1}"`);

    const raw2 = `Assistant: System diagnostics indicate all modules are operational`;
    const clean2 = cleanResponse(raw2);
    assert(clean2 === 'System diagnostics indicate all modules are operational.', `Cleaned with punctuation: "${clean2}"`);

    const raw3 = `Certainly, sir.\nUser: what about something else?\nAssistant:`;
    const clean3 = cleanResponse(raw3);
    assert(clean3 === 'Certainly, sir.', `Cut off next turns: "${clean3}"`);
  });

  // 7. Sampling Presets Validation
  runTest('Sampling Presets Configuration', () => {
    assert(SAMPLING_PRESETS.CONVERSATIONAL.temperature === 0.7, 'Conversational temp is 0.7');
    assert(SAMPLING_PRESETS.CONCISE.temperature === 0.3, 'Concise temp is 0.3');
    assert(SAMPLING_PRESETS.CLASSIFICATION.temperature === 0.1, 'Classification temp is 0.1');
    assert(Array.isArray(SAMPLING_PRESETS.CONVERSATIONAL.stop), 'Stop tokens configured');
  });

  // 8. Live Generation with JARVIS Personality Prompt (if model exists)
  const modelPath = path.resolve('models/phi-3-mini-4k-q4.gguf');
  if (fs.existsSync(modelPath)) {
    await runAsyncTest('Live Inference with JARVIS System Prompt', async () => {
      const engine = new LLMEngine({
        defaultTimeout: 30000
      });

      try {
        console.log('  Starting engine...');
        await engine.start();

        console.log('  Loading model...');
        await engine.loadModel(modelPath, { n_ctx: 2048, n_threads: 4, n_gpu_layers: 0 });

        const prompt = buildJarvisPrompt({
          userInput: 'Hello JARVIS, are you ready to assist me?',
          userName: 'Parth'
        });

        console.log('  Sending prompt to LLM...');
        const response = await engine.generate({
          prompt,
          ...SAMPLING_PRESETS.CONVERSATIONAL,
          max_tokens: 40
        });

        assert(response.success === true, `Generation failed: ${response.error}`);
        const cleaned = cleanResponse(response.text);
        console.log(`  Raw Response: "${response.text.trim()}"`);
        console.log(`  Cleaned Response: "${cleaned}"`);
        assert(cleaned.length > 0, 'Cleaned response should not be empty');
      } finally {
        await engine.stop();
      }
    });
  }

  console.log('\n' + '='.repeat(60));
  console.log(`Test Results: ${testsPassed} passed, ${testsFailed} failed`);
  console.log('='.repeat(60));

  if (testsFailed > 0) {
    process.exit(1);
  }
}

runAllTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
