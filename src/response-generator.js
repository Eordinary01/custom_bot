/**
 * JARVIS Conversational AI - Response Generator
 * 
 * Produces natural language responses with JARVIS personality, dynamic tone adaptation
 * based on user emotion, personality presets, quality validation, length limits,
 * response variation to avoid repetition, and graceful fallback handling.
 * 
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 7.1, 7.2, 7.3, 7.4, 7.5, 8.4, 8.5, 9.1, 13.2
 */

import {
  buildJarvisPrompt,
  cleanResponse,
  SAMPLING_PRESETS
} from './prompt-templates.js';

/**
 * Standard Personality Presets
 */
export const PersonalityPresets = {
  STRICT: {
    name: 'strict',
    formality: 0.9,     // High formality, formal language, frequent "sir"
    verbosity: 0.3,     // Extremely concise, direct to the point
    humor: 0.1,         // Minimal wit, strictly professional
    description: 'Strict, highly disciplined, formal, and concise'
  },
  BALANCED: {
    name: 'balanced',
    formality: 0.7,     // Professional yet accessible, polite "sir"
    verbosity: 0.6,     // Balanced, descriptive when helpful
    humor: 0.5,         // Classic JARVIS dry British wit
    description: 'Classic JARVIS: courteous, efficient, subtly witty'
  },
  CASUAL: {
    name: 'casual',
    formality: 0.4,     // Approachable, conversational
    verbosity: 0.8,     // Expressive and thorough
    humor: 0.8,         // Playful, clever, frequent humor
    description: 'Relaxed, conversational, and witty'
  },
  BUDDY: {
    name: 'buddy',
    formality: 0.2,     // Friendly, natural companion
    verbosity: 0.5,     // Crisp, punchy, conversational
    humor: 0.85,        // Warm, witty, clever
    description: 'Open-world companion: warm, witty, direct, highly adaptable'
  }
};

/**
 * User Emotion Categories
 */
export const UserEmotion = {
  FRUSTRATED: 'frustrated',
  CELEBRATORY: 'celebratory',
  URGENT: 'urgent',
  NEUTRAL: 'neutral'
};

/**
 * Phrasing Variation Pools to avoid repetitive responses
 */
const VARIATION_POOLS = {
  GREETINGS: [
    "Good day, {name}. How may I assist you today?",
    "At your service, {name}. What can I do for you?",
    "Greetings, {name}. At your service.",
    "A pleasure as always, {name}. How can I be of assistance?",
    "Standing by, {name}. How may I help?"
  ],
  PRESENCE_STRICT: [
    "Systems nominal, {name}. Standing by for your instructions.",
    "All systems green, {name}. Awaiting your command.",
    "Ready and monitoring, {name}."
  ],
  PRESENCE_CASUAL: [
    "Right here! All systems running smooth. What's on your mind?",
    "Yep, I'm here! What's up?",
    "Present and accounted for. What do you need?"
  ],
  PRESENCE_BALANCED: [
    "Online and fully operational, {name}. What can I do for you?",
    "Right here, {name}. How can I help?",
    "Present and ready, {name}."
  ],
  CONFIRMATIONS: [
    "Right away, {name}.",
    "Executing now, {name}.",
    "Certainly, {name}.",
    "Consider it done.",
    "Initiating that for you now."
  ],
  GRATITUDE: [
    "You are most welcome, {name}.",
    "Always a pleasure to assist, {name}.",
    "Happy to help, {name}.",
    "Think nothing of it, {name}.",
    "At your service, as always."
  ],
  FALLBACKS: [
    "My apologies, {name}. My cognitive subroutines encountered an unexpected interruption. Could you kindly rephrase?",
    "I am experiencing temporary difficulty accessing that local context, {name}. Core system controls remain ready.",
    "Forgive me, {name}, but I was unable to construct a suitable answer locally. How else may I assist?",
    "System diagnostics report a momentary hitch in local reasoning, {name}. Please try asking once more."
  ]
};

export class ResponseGenerator {
  /**
   * @param {object} options
   * @param {import('./llm-engine.js').LLMEngine} [options.llmEngine] LLM Engine instance
   * @param {object|string} [options.personality='balanced'] Personality preset or config
   * @param {string} [options.userName='Sir'] Default address title
   * @param {number} [options.maxTokens=150] Max generation tokens for standard queries
   * @param {number} [options.defaultTimeout=30000] Inference timeout
   */
  constructor(options = {}) {
    this.llmEngine = options.llmEngine || null;
    this.userName = options.userName || 'Sir';
    this.assistantName = options.assistantName || 'JARVIS';
    this.assistantNickname = options.assistantNickname || null;
    this.defaultTimeout = options.defaultTimeout || 60000;
    this.maxTokens = options.maxTokens || 150;

    // Configure personality
    this.setPersonality(options.personality || 'balanced');

    // Track recently used variations to prevent back-to-back repetitions
    this.recentPhrases = new Set();
    this.maxRecentPhrases = 10;

    // Performance metrics
    this.metrics = {
      totalGenerated: 0,
      fallbacksUsed: 0,
      totalInferenceTimeMs: 0,
      avgInferenceTimeMs: 0,
      tokensGenerated: 0
    };
  }

  /**
   * Set or update personality configuration
   * @param {string|object} presetOrConfig Preset name or custom parameters
   */
  setPersonality(presetOrConfig) {
    if (typeof presetOrConfig === 'string') {
      const key = presetOrConfig.toUpperCase();
      this.personality = { ...(PersonalityPresets[key] || PersonalityPresets.BALANCED) };
    } else if (typeof presetOrConfig === 'object' && presetOrConfig !== null) {
      this.personality = {
        name: presetOrConfig.name || 'custom',
        formality: Math.max(0, Math.min(1, presetOrConfig.formality ?? 0.7)),
        verbosity: Math.max(0, Math.min(1, presetOrConfig.verbosity ?? 0.6)),
        humor: Math.max(0, Math.min(1, presetOrConfig.humor ?? 0.5)),
        description: presetOrConfig.description || 'Custom configuration'
      };
    } else {
      this.personality = { ...PersonalityPresets.BALANCED };
    }
  }

  /**
   * Alias for setPersonality to support preset names
   * @param {string} presetName
   */
  setPersonalityPreset(presetName) {
    this.setPersonality(presetName);
  }

  /**
   * Format action confirmation text according to active personality
   * @param {string} actionLabel
   * @param {string} baseMessage
   * @returns {string}
   */
  formatActionConfirmation(actionLabel, baseMessage) {
    const presetName = (this.personality?.name || 'balanced').toLowerCase();
    const actionClean = baseMessage || `Opening ${actionLabel}`;

    if (presetName === 'strict') {
      return `Confirmed, sir. ${actionClean}.`;
    } else if (presetName === 'casual' || presetName === 'buddy') {
      return `You got it! ${actionClean} for you now.`;
    } else {
      return `Right away, sir. ${actionClean}.`;
    }
  }

  /**
   * Get active personality configuration
   * @returns {object}
   */
  getPersonality() {
    return { ...this.personality };
  }

  /**
   * Detect user emotion from input text
   * @param {string} input User message
   * @returns {string} Emotion category
   */
  detectEmotion(input) {
    if (!input || typeof input !== 'string') return UserEmotion.NEUTRAL;

    const lower = input.toLowerCase();

    // Frustration signals
    if (/\b(?:not\s+working|broken|hate|stupid|annoying|useless|failed|terrible|horrible|why\s+won'?t\s+you|argh|damn|crap)\b/i.test(lower)) {
      return UserEmotion.FRUSTRATED;
    }

    // Celebratory / Success / Gratitude signals
    if (/\b(?:awesome|brilliant|fantastic|great\s+job|perfect|it\s+worked|amazing|wonderful|excellent|thank\s+you\s+so\s+much)\b/i.test(lower)) {
      return UserEmotion.CELEBRATORY;
    }

    // Urgency signals
    if (/\b(?:hurry|asap|urgent|immediately|right\s+now|emergency|quick)\b/i.test(lower)) {
      return UserEmotion.URGENT;
    }

    return UserEmotion.NEUTRAL;
  }

  /**
   * Formulate tone guidance to inject based on detected emotion and personality
   * @param {string} emotion Detected emotion
   * @returns {string} Prompt guidance snippet
   */
  buildToneGuidance(emotion) {
    const toneInstructions = [];

    // Formality & Persona rules
    if (this.personality.formality >= 0.8) {
      toneInstructions.push('Maintain high formality and military precision. Keep answers brief and direct.');
    } else if (this.personality.formality <= 0.4) {
      toneInstructions.push('Adopt an easygoing, conversational, and relaxed style.');
    }

    // Humor rules
    if (this.personality.humor >= 0.7) {
      toneInstructions.push('Include clever, subtle wit or playful remarks.');
    } else if (this.personality.humor <= 0.2) {
      toneInstructions.push('Strictly avoid humor or banter.');
    }

    // Emotion adaptation
    switch (emotion) {
      case UserEmotion.FRUSTRATED:
        toneInstructions.push('The user appears frustrated. Respond with calm empathy, reassuring confidence, and a clear solution-focused tone. Do not be defensive.');
        break;
      case UserEmotion.CELEBRATORY:
        toneInstructions.push('The user is pleased with the result. Acknowledge with polite, gracious satisfaction.');
        break;
      case UserEmotion.URGENT:
        toneInstructions.push('The user requires urgent assistance. Provide an immediate, concise answer without pleasantries.');
        break;
      default:
        break;
    }

    return toneInstructions.join(' ');
  }

  /**
   * Select a varied response from a template pool avoiding recent repeats
   * @param {string[]} pool Array of response templates
   * @returns {string} Formatted response text
   */
  getVariedResponse(pool) {
    const available = pool.filter(p => !this.recentPhrases.has(p));
    const selection = available.length > 0
      ? available[Math.floor(Math.random() * available.length)]
      : pool[Math.floor(Math.random() * pool.length)];

    this.recentPhrases.add(selection);
    if (this.recentPhrases.size > this.maxRecentPhrases) {
      const first = this.recentPhrases.values().next().value;
      this.recentPhrases.delete(first);
    }

    return selection.replace(/\{name\}/g, this.userName);
  }

  /**
   * Validate the quality, length, and coherence of generated response
   * @param {string} text Generated text
   * @param {number} maxTokens Maximum allowed tokens
   * @returns {{isValid: boolean, reason?: string, cleanedText?: string}}
   */
  validateResponse(text, maxTokens = this.maxTokens) {
    if (!text || typeof text !== 'string') {
      return { isValid: false, reason: 'Empty response' };
    }

    const cleaned = cleanResponse(text);

    if (cleaned.length === 0) {
      return { isValid: false, reason: 'Empty after cleaning' };
    }

    // Check for repetitive loop anomaly (e.g. same phrase 3+ times in a row)
    const sentences = cleaned.split(/[.!?]+/).map(s => s.trim().toLowerCase()).filter(s => s.length > 5);
    const seenSentences = new Map();
    for (const s of sentences) {
      seenSentences.set(s, (seenSentences.get(s) || 0) + 1);
      if (seenSentences.get(s) >= 3) {
        return { isValid: false, reason: 'Repetition loop detected' };
      }
    }

    // Check length limits: roughly 1 token ~= 4 characters
    // Simple queries must stay under 150 tokens (~600 chars) unless verbosity is high
    const maxChars = maxTokens * 5;
    if (cleaned.length > maxChars) {
      // Truncate at nearest sentence boundary
      const truncated = cleaned.substring(0, maxChars);
      const lastSentenceEnd = Math.max(
        truncated.lastIndexOf('.'),
        truncated.lastIndexOf('!'),
        truncated.lastIndexOf('?')
      );

      const finalCleaned = lastSentenceEnd > 0
        ? truncated.substring(0, lastSentenceEnd + 1)
        : truncated + '...';

      return { isValid: true, cleanedText: finalCleaned, truncated: true };
    }

    return { isValid: true, cleanedText: cleaned };
  }

  /**
   * Generate a conversational response for user input
   * @param {string} userInput User message
   * @param {Array<{role: string, content: string}>} [context=[]] Conversation history
   * @param {object} [options={}] Additional options
   * @returns {Promise<{text: string, emotion: string, tokens: number, inferenceTimeMs: number, fallbackUsed: boolean}>}
   */
  async generate(userInput, context = [], options = {}) {
    const startTime = Date.now();
    this.metrics.totalGenerated++;

    const emotion = options.emotion || this.detectEmotion(userInput);
    const toneGuidance = this.buildToneGuidance(emotion);

    // Determine target max_tokens based on query complexity and verbosity (Priority 4)
    const isSimple = userInput.split(/\s+/).length < 8;
    const isVerbosePersona = ['casual', 'buddy'].includes(this.personality.name);
    let targetTokens = isSimple
      ? Math.round(40 + (this.personality.verbosity * 35))
      : Math.round(70 + (this.personality.verbosity * (isVerbosePersona ? 130 : 45))); // up to ~200 for buddy/casual

    if (options.maxTokens) {
      targetTokens = options.maxTokens;
    } else if (this.maxTokens && targetTokens > this.maxTokens && !isVerbosePersona) {
      targetTokens = this.maxTokens;
    }

    // Select temperature based on personality humor / creativity
    const temperature = +(0.4 + (this.personality.humor * 0.4)).toFixed(2); // 0.4 to 0.8

    // Fast-path: Instant persona responses for greetings, gratitude, and presence checks (bounded by wordCount, Priority 4)
    const cleanLower = userInput.toLowerCase().replace(/[?!.,;:]+$/, '').trim();
    const wordCount = cleanLower.split(/\s+/).length;
    const isGreeting = wordCount <= 4 &&
      /^(?:hey\s+|ok\s+|okay\s+)?(?:jarvis\s+)?(?:hello|hi|hey|good\s+(?:morning|afternoon|evening)|greetings|sup|yo|hello\s+there)\b/i.test(cleanLower);
    const isGratitude = wordCount <= 4 &&
      /^(?:hey\s+|ok\s+|okay\s+)?(?:jarvis\s+)?(?:thank\s+you|thanks|thanks\s+a\s+lot|much\s+appreciated)\b/i.test(cleanLower);
    const isPresence = wordCount <= 5 &&
      (/^(?:hey\s+|ok\s+|okay\s+)?(?:jarvis\s+)?(?:are\s+you\s+there|you\s+there|are\s+you\s+awake|wake\s+up|status\s+report|system\s+status)\b/i.test(cleanLower)
       || /^(?:hey\s+|ok\s+|okay\s+)?jarvis$/i.test(cleanLower));

    if (isGreeting) {
      const greetingText = this.getVariedResponse(VARIATION_POOLS.GREETINGS);
      return {
        text: greetingText,
        emotion,
        tokens: 15,
        inferenceTimeMs: Date.now() - startTime,
        fallbackUsed: false,
        preset: this.personality.name
      };
    }

    if (isGratitude) {
      const gratitudeText = this.getVariedResponse(VARIATION_POOLS.GRATITUDE);
      return {
        text: gratitudeText,
        emotion,
        tokens: 12,
        inferenceTimeMs: Date.now() - startTime,
        fallbackUsed: false,
        preset: this.personality.name
      };
    }

    if (isPresence) {
      const pool = this.personality.name === 'strict' ? VARIATION_POOLS.PRESENCE_STRICT
        : (this.personality.name === 'casual' || this.personality.name === 'buddy') ? VARIATION_POOLS.PRESENCE_CASUAL
        : VARIATION_POOLS.PRESENCE_BALANCED;
      const presenceText = this.getVariedResponse(pool);
      return {
        text: presenceText,
        emotion,
        tokens: 15,
        inferenceTimeMs: Date.now() - startTime,
        fallbackUsed: false,
        preset: this.personality.name
      };
    }

    // If no LLM engine available, use varied template fallback
    if (!this.llmEngine || typeof this.llmEngine.generate !== 'function') {
      const fallbackText = this.getVariedResponse(VARIATION_POOLS.FALLBACKS);
      this.metrics.fallbacksUsed++;
      return {
        text: fallbackText,
        emotion,
        tokens: 0,
        inferenceTimeMs: Date.now() - startTime,
        fallbackUsed: true,
        reason: 'LLM engine not configured'
      };
    }

    try {
      // Build contextual prompt with personality and emotion guidance
      const effectiveAssistantName = this.assistantNickname
        ? `${this.assistantName} (also known as ${this.assistantNickname})`
        : this.assistantName;

      const effectiveInstructions = [toneGuidance, options.customInstructions].filter(Boolean).join('\n\n');

      const prompt = buildJarvisPrompt({
        userInput,
        context,
        userName: this.userName,
        assistantName: effectiveAssistantName,
        userFacts: options.userFacts || [],
        customInstructions: effectiveInstructions
      });

      // Wire presets per Priority 4
      const presetKey = this.personality.name === 'buddy' ? 'BUDDY'
        : (userInput.split(/\s+/).length < 8 ? 'CONVERSATIONAL' : 'CREATIVE');
      const preset = SAMPLING_PRESETS[presetKey] || SAMPLING_PRESETS.CONVERSATIONAL;

      const response = await this.llmEngine.generate({
        prompt,
        max_tokens: targetTokens,
        temperature,
        top_p: preset.top_p ?? SAMPLING_PRESETS.CONVERSATIONAL.top_p,
        top_k: preset.top_k,
        repeat_penalty: preset.repeat_penalty,
        stop: preset.stop ?? SAMPLING_PRESETS.CONVERSATIONAL.stop,
        timeout: options.timeout || this.defaultTimeout,
        onToken: options.onToken
      });

      if (!response || !response.success || !response.text) {
        throw new Error(response?.error || 'Empty completion returned from LLM');
      }

      // Quality and coherence validation with retry (Priority 4)
      const validation = this.validateResponse(response.text, targetTokens);
      if (!validation.isValid) {
        if (!options._isRetry) {
          return this.generate(userInput, context, { ...options, _isRetry: true, maxTokens: targetTokens });
        }
        console.warn(`[ResponseGenerator] Response failed validation (${validation.reason}), using fallback.`);
        const fallbackText = this.getVariedResponse(VARIATION_POOLS.FALLBACKS);
        this.metrics.fallbacksUsed++;
        return {
          text: fallbackText,
          emotion,
          tokens: 0,
          inferenceTimeMs: Date.now() - startTime,
          fallbackUsed: true,
          reason: validation.reason
        };
      }

      const inferenceTimeMs = response.inference_time_ms || (Date.now() - startTime);
      const tokensGenerated = response.tokens_generated || 0;

      this.metrics.totalInferenceTimeMs += inferenceTimeMs;
      this.metrics.tokensGenerated += tokensGenerated;
      this.metrics.avgInferenceTimeMs = Math.round(
        this.metrics.totalInferenceTimeMs / this.metrics.totalGenerated
      );

      return {
        text: validation.cleanedText,
        emotion,
        tokens: tokensGenerated,
        inferenceTimeMs,
        fallbackUsed: false,
        preset: this.personality.name
      };

    } catch (err) {
      console.error('[ResponseGenerator] Generation error:', err.message);
      this.metrics.fallbacksUsed++;
      const fallbackText = this.getVariedResponse(VARIATION_POOLS.FALLBACKS);

      return {
        text: fallbackText,
        emotion,
        tokens: 0,
        inferenceTimeMs: Date.now() - startTime,
        fallbackUsed: true,
        reason: err.message
      };
    }
  }

  /**
   * Alias for generate accepting options object with context
   * @param {string} userInput
   * @param {object} [options={}]
   */
  async generateResponse(userInput, options = {}) {
    const context = options.context || [];
    return this.generate(userInput, context, options);
  }

  /**
   * Alias for setPersonality
   * @param {string|object} preset
   */
  setPersonalityPreset(preset) {
    return this.setPersonality(preset);
  }

  /**
   * Get generator performance metrics
   * @returns {object}
   */
  getMetrics() {
    return {
      ...this.metrics,
      activePersonality: this.personality.name
    };
  }
}

export default ResponseGenerator;
