/**
 * Integration Tests for MemoryStore (SQLite)
 * Tests Task 5.3, 5.4, & 5.5 requirements:
 * 1. Database schema initialization
 * 2. Session and turns persistence & retrieval
 * 3. Keyword search and relevance scoring
 * 4. User preference storage and 30-day retention policy
 * 5. Named entities storage
 * 6. Privacy controls (session purge & purgeAll)
 * 7. Latency benchmark (<500ms target)
 */

import { MemoryStore } from './src/memory-store.js';

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

async function runAllTests() {
  console.log('='.repeat(60));
  console.log('MemoryStore (SQLite) Integration Test Suite');
  console.log('Testing Task 5.3 - 5.5 requirements');
  console.log('='.repeat(60));

  // Initialize an in-memory SQLite store for clean testing
  const store = new MemoryStore({ inMemory: true });

  try {
    // 1. Session Persistence & Retrieval
    runTest('Session and Turns Persistence', () => {
      const sessionId = 'test-session-101';
      const startedAt = new Date().toISOString();

      store.saveSession({
        sessionId,
        startedAt,
        summary: 'Discussion about artificial intelligence and space travel',
        turns: [
          { role: 'user', content: 'What is the Hubble Space Telescope?' },
          { role: 'assistant', content: 'The Hubble Space Telescope is an optical observatory in low Earth orbit.' },
          { role: 'user', content: 'Who was it named after?' },
          { role: 'assistant', content: 'It was named after astronomer Edwin Hubble.' }
        ]
      });

      const loaded = store.getSession(sessionId);
      assert(loaded !== null, 'Session loaded from SQLite');
      assert(loaded.session_id === sessionId, 'Session ID matches');
      assert(loaded.turns.length === 4, `Expected 4 turns, got ${loaded.turns.length}`);
      assert(loaded.turns[0].content === 'What is the Hubble Space Telescope?', 'Turn 0 content matches');
      assert(loaded.turns[3].role === 'assistant', 'Turn 3 role matches');
      console.log(`  Session successfully saved and reloaded: ${loaded.turns.length} turns`);
    });

    // 2. Keyword Search and Relevance Scoring
    runTest('Historical Context Search with Relevance Scoring', () => {
      // Save another session with varied topics
      store.saveSession({
        sessionId: 'test-session-102',
        startedAt: new Date().toISOString(),
        summary: 'Quantum computing and physics',
        turns: [
          { role: 'user', content: 'Explain quantum entanglement and quantum computing.' },
          { role: 'assistant', content: 'Quantum computing uses qubits that leverage superposition and entanglement.' },
          { role: 'user', content: 'How do quantum algorithms differ from classical algorithms?' },
          { role: 'assistant', content: 'Quantum algorithms can solve specific complex problems exponentially faster.' }
        ]
      });

      // Search for "quantum computing"
      const results = store.searchTurns('quantum computing', 5);
      assert(results.length > 0, 'Found search results');
      assert(results[0].content.toLowerCase().includes('quantum'), 'Top result contains quantum');
      assert(results[0].relevanceScore > 0, 'Top result has positive relevance score');

      // The exact phrase match should have highest relevance score
      console.log(`  Top search result (Score: ${results[0].relevanceScore}): "${results[0].content}"`);
    });

    // 3. User Preferences Storage & Retrieval
    runTest('User Preferences Management', () => {
      store.setPreference('theme', 'dark');
      store.setPreference('userName', 'Parth');
      store.setPreference('audioVolume', { master: 80, voice: 100 });

      assert(store.getPreference('theme') === 'dark', 'Retrieved string preference');
      assert(store.getPreference('userName') === 'Parth', 'Retrieved name preference');

      const audio = store.getPreference('audioVolume');
      assert(audio && audio.master === 80, 'Retrieved JSON object preference');

      const all = store.getAllPreferences();
      assert(all.theme === 'dark' && all.userName === 'Parth', 'Retrieved all preferences');
      console.log(`  Preferences stored and retrieved: ${JSON.stringify(all)}`);
    });

    // 4. 30-Day Retention Policy Cleanup
    runTest('30-Day Retention Policy Pruning', () => {
      // Insert an expired preference (40 days old) directly
      const oldDate = new Date(Date.now() - (40 * 24 * 60 * 60 * 1000)).toISOString();
      store.db.prepare(`
        INSERT INTO user_preferences (key, value, updated_at)
        VALUES (?, ?, ?)
      `).run('expired_preference', 'stale_value', oldDate);

      assert(store.getPreference('expired_preference') === 'stale_value', 'Old preference present before cleanup');

      // Run cleanup
      store.cleanupExpiredPreferences(30);

      // Verify expired record removed while recent ones remain
      assert(store.getPreference('expired_preference') === null, 'Expired preference was pruned');
      assert(store.getPreference('userName') === 'Parth', 'Fresh preference retained');
      console.log('  Expired 40-day preference pruned successfully, active preferences retained');
    });

    // 5. Entity Knowledge Storage
    runTest('Entity Storage and Retrieval', () => {
      store.saveEntity('Google Chrome', 'app', { executable: 'chrome.exe', category: 'browser' });

      const entity = store.getEntity('Google Chrome');
      assert(entity !== null, 'Entity retrieved');
      assert(entity.name === 'Google Chrome', 'Entity name matches');
      assert(entity.type === 'app', 'Entity type matches');
      assert(entity.properties.executable === 'chrome.exe', 'Entity property matches');
      console.log(`  Entity stored: ${entity.name} (${entity.type})`);
    });

    // 6. Search Latency Benchmark (<500ms requirement)
    runTest('Search Latency Benchmark (<500ms target)', () => {
      const start = Date.now();
      const results = store.searchTurns('algorithms computing', 5);
      const latencyMs = Date.now() - start;

      assert(latencyMs < 500, `Expected search latency < 500ms, got ${latencyMs}ms`);
      console.log(`  Search completed in ${latencyMs}ms (returned ${results.length} items)`);
    });

    // 7. Privacy Controls (Purge Session & Purge All)
    runTest('Privacy Controls (Purge Session & Purge All)', () => {
      // Purge single session
      store.purgeSession('test-session-101');
      assert(store.getSession('test-session-101') === null, 'Session 101 purged');
      assert(store.getSession('test-session-102') !== null, 'Session 102 still intact');

      // Purge all
      store.purgeAll();
      assert(store.getSession('test-session-102') === null, 'Session 102 purged by purgeAll');
      assert(Object.keys(store.getAllPreferences()).length === 0, 'Preferences purged by purgeAll');
      console.log('  Privacy purge verified cleanly');
    });

  } finally {
    store.close();
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
