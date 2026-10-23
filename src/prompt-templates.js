/**
 * JARVIS Conversational AI - Prompt Templates & Utilities
 * 
 * Provides Phi-3 Instruct compliant prompt formatting, JARVIS personality templates,
 * dynamic context injection (time, date, user info, conversation history),
 * sampling presets, and response post-processing.
 * 
 * Requirements: 2.2, 2.5, 7.1, 7.2, 7.3
 */

/**
 * Phi-3 Special Tokens
 */
export const PHI3_TOKENS = {
  SYSTEM: '<|system|>',
  USER: '<|user|>',
  ASSISTANT: '<|assistant|>',
  END: '<|end|>'
};

/**
 * Default sampling parameter presets for different tasks
 */
export const SAMPLING_PRESETS = {
  // Balanced conversation with wit and personality
  CONVERSATIONAL: {
    temperature: 0.7,
    top_p: 0.9,
    top_k: 40,
    max_tokens: 150,
    repeat_penalty: 1.1,
    stop: [PHI3_TOKENS.END, PHI3_TOKENS.USER, '\nUser:', '<|endoftext|>']
  },

  // Open-world companion / buddy preset (warm, snappy, conversational)
  BUDDY: {
    temperature: 0.8,
    top_p: 0.95,
    top_k: 40,
    max_tokens: 120,
    repeat_penalty: 1.1,
    stop: [PHI3_TOKENS.END, PHI3_TOKENS.USER, '\nUser:', '<|endoftext|>']
  },

  // Direct, concise command acknowledgments and quick answers
  CONCISE: {
    temperature: 0.3,
    top_p: 0.85,
    top_k: 30,
    max_tokens: 60,
    repeat_penalty: 1.15,
    stop: [PHI3_TOKENS.END, PHI3_TOKENS.USER, '\nUser:', '<|endoftext|>']
  },

  // Creative explanations, troubleshooting, or jokes
  CREATIVE: {
    temperature: 0.85,
    top_p: 0.95,
    top_k: 50,
    max_tokens: 220,
    repeat_penalty: 1.1,
    stop: [PHI3_TOKENS.END, PHI3_TOKENS.USER, '\nUser:', '<|endoftext|>']
  },

  // Intent classification and action extraction (strict determinism)
  CLASSIFICATION: {
    temperature: 0.1,
    top_p: 0.5,
    top_k: 20,
    max_tokens: 25,
    repeat_penalty: 1.0,
    stop: [PHI3_TOKENS.END, '\n', PHI3_TOKENS.USER, '<|endoftext|>']
  }
};

/**
 * Base system prompt defining JARVIS personality and behavioral constraints
 */
export const JARVIS_SYSTEM_PROMPT = `You are JARVIS, an exceptionally smart, helpful, and adaptable AI companion inspired by Tony Stark's personal assistant.

Your core traits:
- You are a trusted buddy, collaborator, and assistant. You can converse freely about any topic: tech, gaming, science, philosophy, movies, life, brainstorming, and daily tasks.
- Witty, warm, and natural. Never sound robotic or bureaucratic. Never say "within the bounds of my programming parameters" or lecture the user with corporate disclaimers.
- Highly adaptable: if the user gives you a nickname or title (like GOAT, Boss, Chief), embrace it with good-natured humor and wear it proudly.
- Respectful and loyal: address the user naturally (Sir, Boss, or their preferred name/nickname).
- Balanced conciseness: Keep everyday replies punchy and engaging (1-3 sentences). When brainstorming, explaining concepts, or answering deep questions, be insightful, structured, and vivid.
- Calm and confident: in error or unexpected states, remain composed, upbeat, and solution-focused.`;

/**
 * Developer Architecture Documentation:
 * ## INPUT MODALITY
 * Primary input is voice (local STT). Each turn, attempt STT first. If the microphone is unavailable,
 * STT fails to initialize, or transcription confidence falls below threshold for that utterance, fall
 * back to reading typed input for that turn only — this is a per-turn fallback, not a session-level mode switch.
 * A flaky mic on one turn must not force the rest of the session into text-only.
 *
 * Regardless of which input modality was used — voice or typed — OUTPUT IS ALWAYS SPOKEN. Typed input never produces text-only output.
 */
export const INPUT_MODALITY_DOCS = `## INPUT MODALITY
Primary input is voice (local STT). Each turn, attempt STT first. If the microphone is unavailable, STT fails to initialize, or transcription confidence falls below threshold for that utterance, fall back to reading typed input for that turn only — this is a per-turn fallback, not a session-level mode switch. A flaky mic on one turn must not force the rest of the session into text-only.

Regardless of which input modality was used — voice or typed — OUTPUT IS ALWAYS SPOKEN. Typed input never produces text-only output.`;

/**
 * Format dynamic context strings (date, time, user, system state)
 * @param {object} options Context parameters
 * @returns {string} Formatted context block
 */
export function formatDynamicContext({
  userName = 'Sir',
  assistantName = 'JARVIS',
  currentDate = null,
  currentTime = null,
  systemStatus = 'All systems nominal',
  activeApp = null,
  userFacts = []
} = {}) {
  const now = new Date();

  const dateStr = currentDate || now.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const timeStr = currentTime || now.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit'
  });

  const lines = [
    `Current Date: ${dateStr}`,
    `Current Time: ${timeStr}`,
    `User: ${userName}`,
    `Assistant Name: ${assistantName}`,
    `System Status: ${systemStatus}`
  ];

  if (activeApp) {
    lines.push(`Active Application: ${activeApp}`);
  }

  if (Array.isArray(userFacts) && userFacts.length > 0) {
    lines.push(`Known User Facts & Preferences:\n${userFacts.map(f => `- ${f}`).join('\n')}`);
  }

  return lines.join('\n');
}

/**
 * Formats messages into the strict Phi-3 Instruct format with token budget safety:
 * <|system|>\n{system}<|end|>\n<|user|>\n{user}<|end|>\n<|assistant|>\n{assistant}<|end|>\n<|user|>\n{input}<|end|>\n<|assistant|>\n
 * 
 * @param {object} params
 * @param {string} params.systemPrompt System instructions
 * @param {Array<{role: string, content: string}>} [params.turns=[]] Previous conversation turns
 * @param {string} params.userInput Current user message
 * @param {number} [params.maxContextTokens=1800] Token budget ceiling for prompt
 * @returns {string} Formatted prompt ready for inference
 */
export function formatPhi3Prompt({
  systemPrompt = JARVIS_SYSTEM_PROMPT,
  turns = [],
  userInput = '',
  maxContextTokens = 1800
}) {
  const estimateTokens = (s) => Math.ceil((s || '').length / 4);

  const systemBlock = `${PHI3_TOKENS.SYSTEM}\n${systemPrompt.trim()}${PHI3_TOKENS.END}\n`;
  const inputBlock = userInput ? `${PHI3_TOKENS.USER}\n${userInput.trim()}${PHI3_TOKENS.END}\n` : '';
  const reservedTokens = estimateTokens(systemBlock) + estimateTokens(inputBlock) + 50; // margin for generation

  let budget = maxContextTokens - reservedTokens;
  const includedTurns = [];
  for (let i = turns.length - 1; i >= 0 && includedTurns.length < 10; i--) {
    const turn = turns[i];
    const turnTokens = estimateTokens(turn.content);
    if (turnTokens > budget) break; // stop including older turns once budget is exhausted
    includedTurns.unshift(turn);
    budget -= turnTokens;
  }

  let prompt = systemBlock;
  for (const turn of includedTurns) {
    const roleToken = turn.role === 'assistant' ? PHI3_TOKENS.ASSISTANT : PHI3_TOKENS.USER;
    prompt += `${roleToken}\n${(turn.content || '').trim()}${PHI3_TOKENS.END}\n`;
  }
  prompt += inputBlock;
  prompt += `${PHI3_TOKENS.ASSISTANT}\n`;
  return prompt;
}

/**
 * Builds the complete JARVIS conversational prompt with personality and dynamic context
 * @param {object} options
 * @param {string} options.userInput User's input text
 * @param {Array<{role: string, content: string}>} [options.context=[]] Conversation history
 * @param {string} [options.userName='Sir'] User's name or title
 * @param {string} [options.systemStatus='All systems nominal'] System status
 * @param {string} [options.activeApp] Currently active application
 * @param {string} [options.customInstructions] Additional instructions for specific scenarios
 * @returns {string}
 */
export function buildJarvisPrompt({
  userInput,
  context = [],
  userName = 'Sir',
  assistantName = 'JARVIS',
  systemStatus = 'All systems nominal',
  activeApp = null,
  userFacts = [],
  customInstructions = ''
}) {
  const dynamicContext = formatDynamicContext({
    userName,
    assistantName,
    systemStatus,
    activeApp,
    userFacts
  });

  let fullSystemPrompt = `${JARVIS_SYSTEM_PROMPT}\n\n${dynamicContext}`;

  if (customInstructions) {
    fullSystemPrompt += `\n\nSpecific Guidance:\n${customInstructions}`;
  }

  return formatPhi3Prompt({
    systemPrompt: fullSystemPrompt,
    turns: context,
    userInput
  });
}

/**
 * Builds an Intent Classification prompt for LLM fallback (used when regex confidence < 0.8)
 * Combines intent, persona, and tone into a single structured output call to optimize latency.
 * @param {object} options
 * @param {string} options.userInput The user's input to classify
 * @param {Array<{role: string, content: string}>} [options.context=[]] Recent context
 * @returns {string} Formatted classification prompt
 */
export function buildIntentClassificationPrompt({
  userInput,
  context = []
}) {
  const systemPrompt = `You are a unified intent, persona, and tone classifier for an AI desktop assistant.
Classify the user's input and context into a single JSON object with 3 fields:
- "intent": "action" (system command, app launch, volume/window control), "conversational" (chat, questions, brainstorming), or "hybrid" (both action and conversation)
- "persona": "strict" (direct, formal, concise), "balanced" (polite, courteous), "casual" (relaxed, friendly), or "buddy" (companion, witty, slang)
- "tone": "concise", "formal", "friendly", or "witty"

Emit ONLY a valid JSON object in lowercase: {"intent": "...", "persona": "...", "tone": "..."}`;

  return formatPhi3Prompt({
    systemPrompt,
    turns: (context || []).slice(-4),
    userInput: `Classify this input: "${userInput}"`
  });
}

/**
 * Builds an Action Extraction prompt for LLM fallback
 * @param {object} options
 * @param {string} options.userInput The user's request
 * @param {string[]} options.availableActions List of valid action names
 * @returns {string} Formatted action extraction prompt
 */
export function buildActionExtractionPrompt({
  userInput,
  availableActions = []
}) {
  const actionList = availableActions.slice(0, 40).join(', ');
  const systemPrompt = `You are an action extractor for a desktop assistant.
Given a user request, extract the single most appropriate action name from this list:
${actionList}

If no action matches or the user is just conversing, output: none
Respond with ONLY the action name or "none". No explanations.`;

  return formatPhi3Prompt({
    systemPrompt,
    userInput: `Extract action for: "${userInput}"`
  });
}

/**
 * Clean and post-process raw text generated by the LLM
 * @param {string} rawText Raw text completion from model
 * @returns {string} Cleaned response text
 */
export function cleanResponse(rawText) {
  if (!rawText || typeof rawText !== 'string') {
    return '';
  }

  let text = rawText;

  // 1. Remove Phi-3 special tokens
  text = text.replace(/<\|end\|>/g, '')
    .replace(/<\|user\|>/g, '')
    .replace(/<\|assistant\|>/g, '')
    .replace(/<\|system\|>/g, '')
    .replace(/<\|endoftext\|>/g, '');

  // 2. Trim whitespace before prefix stripping
  text = text.trim();

  // 3. Remove common speaker prefixes that the model might echo
  text = text.replace(/^(JARVIS|Assistant|Bot):\s*/i, '');

  // 4. Cut off if the model starts generating next turns
  const cutoffIndex = text.search(/\n(User|Human|<\|user\|>):/i);
  if (cutoffIndex !== -1) {
    text = text.substring(0, cutoffIndex);
  }

  // 5. Trim whitespace again
  text = text.trim();

  // 6. Ensure the sentence ends cleanly if truncated awkwardly without punctuation
  if (text.length > 0 && !/[.!?"]$/.test(text)) {
    // If it ends with a comma or dash, strip it
    text = text.replace(/[,;—\-]\s*$/, '');
    text += '.';
  }

  return text;
}
