/**
 * JARVIS Conversational AI - Fact & Preference Extractor
 * 
 * Lightweight pattern-based, heuristic, and semantic extractor to discover
 * user preferences, personal facts, and assistant configurations from conversational turns.
 * Includes automatic conflict resolution and sensitive information tagging.
 */

const SENSITIVE_PATTERNS = [
  /\b(?:password|passwd|pin|secret|api[_\s-]?key|auth[_\s-]?token|private[_\s-]?key|jwt)\b/i,
  /\b(?:credit\s*card|debit\s*card|cvv|bank\s*account|routing\s*number|ssn|social\s*security)\b/i,
  /\b(?:diagnosed\s+with|prescription\s+for|medical\s+history|patient\s+record)\b/i
];

export class FactExtractor {
  /**
   * @param {object} [options={}]
   * @param {import('./memory-store.js').MemoryStore} [options.memoryStore]
   */
  constructor(options = {}) {
    this.memoryStore = options.memoryStore || null;
  }

  /**
   * Check if text contains sensitive data (credentials, financial, health)
   * @param {string} text
   * @returns {boolean}
   */
  isSensitive(text) {
    if (!text || typeof text !== 'string') return false;
    return SENSITIVE_PATTERNS.some(regex => regex.test(text));
  }

  /**
   * Analyze a user turn and extract facts or preferences
   * @param {string} userInput
   * @returns {Array<{category: string, key: string, value: string, confidence: number, sensitivity: string}>}
   */
  extract(userInput) {
    if (!userInput || typeof userInput !== 'string') return [];

    const facts = [];
    const text = userInput.trim();
    const isTextSensitive = this.isSensitive(text);
    const sensitivity = isTextSensitive ? 'sensitive' : 'normal';

    // 1. Assistant Nickname / Name assignment
    const botNameMatch = text.match(/^(?:so\s+)?(?:from\s+now(?:\s+on)?\s+)?(?:your\s+name\s+is|your\s+nickname\s+is|call\s+yourself|i\s+will\s+call\s+you)\s+([a-zA-Z0-9_\- ]+)/i);
    if (botNameMatch && !/^(?:what|who|why|how)\b/i.test(text)) {
      const name = botNameMatch[1].replace(/[.!?]+$/, '').trim();
      if (name.length > 0 && name.length < 40) {
        facts.push({
          category: 'identity',
          key: 'assistant_nickname',
          value: name,
          confidence: 0.98,
          sensitivity
        });
      }
    }

    // 2. User Name
    const userNameMatch = text.match(/^(?:my\s+name\s+is|call\s+me|i\s+am)\s+([a-zA-Z]+)/i);
    if (userNameMatch && !/^(?:sorry|busy|here|ready|tired|happy|sad|fine|good|back|alive|listening)/i.test(userNameMatch[1])) {
      facts.push({
        category: 'identity',
        key: 'user_name',
        value: userNameMatch[1],
        confidence: 0.95,
        sensitivity
      });
    }

    // 3. User Location ("I live in London", "I moved to Berlin", "I am based in NYC")
    const locMatch = text.match(/(?:i\s+(?:live\s+in|moved\s+to|reside\s+in|am\s+based\s+in))\s+([a-zA-Z\s,]+?)(?:\.|$|!|\s+now|\s+with)/i);
    if (locMatch) {
      const loc = locMatch[1].trim();
      if (loc.length > 2 && loc.length < 50 && !/^(?:a\s+|an\s+|the\s+)/i.test(loc)) {
        facts.push({
          category: 'fact',
          key: 'location',
          value: loc,
          confidence: 0.92,
          sensitivity
        });
      }
    }

    // 4. Role / Profession ("I work as a / I am a X")
    const roleMatch = text.match(/i\s+(?:work\s+as\s+a|am\s+a)\s+([a-zA-Z0-9_\- ]+?)(?:\.|$|,|!|\s+at)/i);
    if (roleMatch && !/^(?:user|person|human|man|guy|student|beginner|friend|fan)/i.test(roleMatch[1])) {
      const role = roleMatch[1].trim();
      if (role.length > 2 && role.length < 50) {
        facts.push({
          category: 'fact',
          key: 'profession',
          value: role,
          confidence: 0.90,
          sensitivity
        });
      }
    }

    // 5. Tech Stack / Coding ("I code in Python", "my tech stack is React and Node")
    const codeMatch = text.match(/(?:i\s+(?:code|program|develop)\s+in|my\s+tech\s+stack\s+is)\s+([a-zA-Z0-9_\-+., ]+?)(?:\.|$|!)/i);
    if (codeMatch) {
      const stack = codeMatch[1].trim();
      if (stack.length > 1 && stack.length < 60) {
        facts.push({
          category: 'fact',
          key: 'tech_stack',
          value: stack,
          confidence: 0.88,
          sensitivity
        });
      }
    }

    // 6. Likes / Preferences ("I like/love/prefer X", "my favorite X is Y")
    const favMatch = text.match(/my\s+favorite\s+([a-zA-Z0-9_\- ]+?)\s+is\s+([a-zA-Z0-9_\- ]+?)(?:\.|$|!)/i);
    if (favMatch) {
      const topic = favMatch[1].toLowerCase().replace(/\s+/g, '_').slice(0, 20);
      const val = favMatch[2].trim();
      if (topic.length > 1 && val.length > 1 && val.length < 60) {
        facts.push({
          category: 'preference',
          key: `pref_${topic}`,
          value: val,
          confidence: 0.95,
          sensitivity
        });
      }
    } else {
      const prefMatch = text.match(/(?:i\s+(?:really\s+)?(?:like|love|prefer|enjoy))\s+([a-zA-Z0-9_\- ]+?)(?:\.|$|,|!|\s+because)/i);
      if (prefMatch) {
        const val = prefMatch[1].trim();
        if (val.length > 2 && val.length < 60 && !/^(?:that|this|it|you)\b/i.test(val)) {
          facts.push({
            category: 'preference',
            key: `pref_${val.toLowerCase().replace(/\s+/g, '_').slice(0, 20)}`,
            value: `Likes ${val}`,
            confidence: 0.85,
            sensitivity
          });
        }
      }
    }

    // 7. Explicit Sensitive Credentials / Keys ("my password is ...", "api key is ...")
    const credMatch = text.match(/(?:my\s+)?(password|pin|secret|api[_\s-]?key|token)\s*(?:is|:|=)\s*([a-zA-Z0-9_\-!@#$%^&*]+)/i);
    if (credMatch) {
      const credType = credMatch[1].toLowerCase().replace(/[\s-]+/g, '_');
      const credVal = credMatch[2].trim();
      facts.push({
        category: 'credential',
        key: `cred_${credType}`,
        value: credVal,
        confidence: 0.99,
        sensitivity: 'sensitive'
      });
    }

    return facts;
  }

  /**
   * Extract and asynchronously save facts to memory store without blocking conversational turn
   * @param {string} userInput
   * @param {number|null} [sourceTurnId=null]
   * @returns {Array<{category: string, key: string, value: string, confidence: number, sensitivity: string}>}
   */
  extractAndSave(userInput, sourceTurnId = null) {
    const facts = this.extract(userInput);

    if (this.memoryStore && facts.length > 0) {
      setImmediate(() => {
        this.saveFactsSync(facts, sourceTurnId);
      });
    }

    return facts;
  }

  /**
   * Save facts synchronously to memory store
   * @param {Array<object>} facts
   * @param {number|null} [sourceTurnId=null]
   */
  saveFactsSync(facts, sourceTurnId = null) {
    if (!this.memoryStore || !Array.isArray(facts)) return;

    for (const fact of facts) {
      try {
        if (typeof this.memoryStore.upsertFact === 'function') {
          this.memoryStore.upsertFact({
            category: fact.category,
            key: fact.key,
            value: fact.value,
            confidence: fact.confidence ?? 1.0,
            sourceTurnId,
            sensitivity: fact.sensitivity || 'normal'
          });
        } else if (typeof this.memoryStore.saveFact === 'function') {
          this.memoryStore.saveFact(fact.category, fact.key, fact.value);
        }
      } catch (_) {}
    }
  }

  /**
   * Run LLM inference to extract durable facts from turn and context.
   * Prompts the model: "Does this turn state a durable fact about the user (identity, preference, ongoing project, correction to something stated earlier)? If yes, emit {key, value, confidence, category}. If no, emit nothing."
   * 
   * @param {string} userInput User turn
   * @param {Array<{role: string, content: string}>} [context=[]] Surrounding conversation context
   * @param {object} [llmEngine=null] LLM Engine instance
   * @returns {Promise<Array<{category: string, key: string, value: string, confidence: number, sensitivity: string}>>}
   */
  async extractWithLLM(userInput, context = [], llmEngine = null) {
    if (!llmEngine || typeof llmEngine.generate !== 'function') return [];
    if (!userInput || typeof userInput !== 'string') return [];

    const prompt = `<|system|>
You are a memory extraction component for an AI companion.
Analyze the user's turn and recent context.
Does this turn state a durable fact about the user (identity, preference, ongoing project, technical stack, or correction to something stated earlier)?
If yes, emit ONLY a JSON object with:
- "key": concise snake_case identifier (e.g. "user_name", "location", "project_deadline", "preferred_editor")
- "value": the exact fact value
- "confidence": number between 0.5 and 1.0
- "category": "identity" | "preference" | "fact" | "project"
If no durable fact is stated, emit: {}
Emit ONLY the JSON object. Do not add markdown backticks, explanations, or commentary.<|end|>
<|user|>
Context:
${(context || []).slice(-3).map(t => `${t.role}: ${t.content}`).join('\n')}
Current turn: "${userInput}"<|end|>
<|assistant|>
`;

    try {
      const completion = await llmEngine.generate({
        prompt,
        max_tokens: 60,
        temperature: 0.1,
        stop: ['<|end|>', '<|user|>', '\n\n']
      }, { timeout: 8000 });

      if (!completion || !completion.text) return [];

      const raw = completion.text.trim();
      const jsonMatch = raw.match(/\{[\s\S]*?\}/);
      if (!jsonMatch) return [];

      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.key && parsed.value && typeof parsed.key === 'string' && typeof parsed.value === 'string') {
        const cleanKey = parsed.key.toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 40);
        const cleanVal = String(parsed.value).trim().slice(0, 150);
        const conf = typeof parsed.confidence === 'number' ? Math.max(0.5, Math.min(1.0, parsed.confidence)) : 0.85;
        const cat = ['identity', 'preference', 'fact', 'project'].includes(parsed.category) ? parsed.category : 'fact';
        const sensitivity = this.isSensitive(`${cleanKey} ${cleanVal}`) ? 'sensitive' : 'normal';

        if (cleanKey.length > 1 && cleanVal.length > 0) {
          return [{
            category: cat,
            key: cleanKey,
            value: cleanVal,
            confidence: +conf.toFixed(2),
            sensitivity
          }];
        }
      }
      return [];
    } catch (_) {
      return [];
    }
  }

  /**
   * Asynchronously fire background job to extract facts via LLM without blocking turn response.
   * Runs as fire-and-forget task after reply is already delivered.
   * 
   * @param {string} userInput
   * @param {Array<{role: string, content: string}>} [context=[]]
   * @param {object} [llmEngine=null]
   * @param {number|null} [sourceTurnId=null]
   */
  extractAsyncWithLLM(userInput, context = [], llmEngine = null, sourceTurnId = null) {
    // 1. Fast heuristic extraction first (instant)
    const ruleFacts = this.extract(userInput);
    if (ruleFacts.length > 0) {
      this.saveFactsSync(ruleFacts, sourceTurnId);
    }

    // 2. Async background LLM extraction (fire-and-forget, only when idle and not extracted by rules)
    if (llmEngine && typeof llmEngine.generate === 'function' && ruleFacts.length === 0) {
      if (llmEngine.isReady && !llmEngine.isProcessingQueue && (!llmEngine.queue || llmEngine.queue.length === 0)) {
        setImmediate(async () => {
          try {
            if (llmEngine.isProcessingQueue || (llmEngine.queue && llmEngine.queue.length > 0)) return;
            const llmFacts = await this.extractWithLLM(userInput, context, llmEngine);
            if (Array.isArray(llmFacts) && llmFacts.length > 0) {
              const newFacts = llmFacts.filter(lf => !ruleFacts.some(rf => rf.key === lf.key));
              if (newFacts.length > 0) {
                this.saveFactsSync(newFacts, sourceTurnId);
              }
            }
          } catch (_) {}
        });
      }
    }

    return ruleFacts;
  }
}

export default FactExtractor;
