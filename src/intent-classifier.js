/**
 * JARVIS Conversational AI - Intent Classification System
 * 
 * Provides a high-performance two-stage intent classifier:
 * Stage 1: Fast Regex & Pattern Matcher (<2ms latency, >90% accuracy)
 * Stage 2: Local LLM-based Fallback for ambiguous or complex compound queries
 * 
 * Requirements: 1.1, 1.2, 1.5, 1.6, 6.1, 6.2, 6.3, 8.1, 8.2, 9.6
 */

import CommandRouter from '../commandRouter.js';
import { buildIntentClassificationPrompt, SAMPLING_PRESETS } from './prompt-templates.js';

export const IntentType = {
  ACTION: 'action',
  CONVERSATIONAL: 'conversational',
  HYBRID: 'hybrid',
  NEEDS_LLM: 'needs_llm',
  CORRECTION: 'correction',
  UNKNOWN: 'unknown'
};

/**
 * Compute Levenshtein edit distance between two strings
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
export function levenshteinDistance(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const matrix = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

/**
 * Fuzzy check if text contains target word within 1-2 edit distance (Requirement 14.2)
 * @param {string} text
 * @param {string} targetWord
 * @param {number|null} [maxDistance=null]
 * @returns {boolean}
 */
export function fuzzyContainsWord(text, targetWord, maxDistance = null) {
  if (!text || !targetWord) return false;
  const lower = text.toLowerCase();
  const allowed = maxDistance !== null ? maxDistance : (targetWord.length <= 5 ? 1 : 2);

  if (new RegExp(`\\b${targetWord}\\b`, 'i').test(lower)) return true;

  const tokens = lower.split(/[^a-z0-9]+/i).filter(t => t.length > 0);
  for (const token of tokens) {
    if (Math.abs(token.length - targetWord.length) <= allowed) {
      if (levenshteinDistance(token, targetWord) <= allowed) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Action Verbs and System Keywords Dictionary
 */
const ACTION_VERBS = [
  'open', 'launch', 'start', 'run', 'fire up',
  'close', 'kill', 'quit', 'exit', 'terminate', 'stop',
  'shut down', 'shutdown', 'restart', 'reboot',
  'lock', 'sleep', 'hibernate',
  'volume up', 'volume down', 'mute', 'unmute',
  'turn up', 'turn down', 'increase', 'decrease', 'louder', 'softer',
  'maximize', 'minimize',
  'create file', 'create folder', 'new file', 'new folder',
  'switch tab', 'next tab', 'previous tab'
];

/**
 * Common Application & System Targets
 */
const APP_TARGETS = {
  'chrome': 'open_chrome',
  'google chrome': 'open_chrome',
  'browser': 'open_chrome',
  'notepad': 'open_notepad',
  'calculator': 'open_calculator',
  'calc': 'open_calculator',
  'file explorer': 'open_explorer',
  'files': 'open_explorer',
  'control panel': 'open_control_panel',
  'cmd': 'open_cmd',
  'command prompt': 'open_cmd',
  'terminal': 'open_cmd',
  'powershell': 'open_powershell',
  'task manager': 'open_taskmanager',
  'settings': 'open_settings',
  'outlook': 'open_outlook',
  'gmail': 'open_gmail',
  'discord': 'open_discord',
  'teams': 'open_teams',
  'whatsapp': 'open_whatsapp',
  'youtube': 'open_youtube',
  'google': 'open_google',
  'facebook': 'open_facebook',
  'twitter': 'open_twitter',
  'instagram': 'open_instagram',
  'linkedin': 'open_linkedin',
  'reddit': 'open_reddit',
  'spotify': 'open_spotify',
  'music': 'open_spotify',
  'netflix': 'open_netflix',
  'prime': 'open_prime',
  'steam': 'open_steam',
  'word': 'open_word',
  'excel': 'open_excel',
  'powerpoint': 'open_powerpoint',
  'paint': 'open_paint',
  'vscode': 'open_vscode',
  'vs code': 'open_vscode',
  'visual studio code': 'open_vscode',
  'github': 'open_github'
};

export class FastIntentMatcher {
  constructor(commandRouter = null) {
    this.router = commandRouter || new CommandRouter();

    // Regex for conversational inquiries
    this.questionPatterns = [
      /^(what|when|where|why|how|who|which|whose)\b/i,
      /^(can you|could you|would you|will you|tell me|explain|describe|define)\b/i,
      /^(how do|how does|how can|what is|what are|what was|what were)\b/i,
      /^(do you think|do you believe|what do you think|are you|is it|is there|do you|can we|should we)\b/i
    ];

    // Regex for greetings, social pleasantries, and small talk
    this.socialPatterns = [
      /^(hello|hi|hey|good morning|good afternoon|good evening|greetings|sup|yo|hello there)\b/i,
      /^(how are you|how's it going|how are you doing|how do you do)\b/i,
      /^(thank you|thanks|thanks a lot|much appreciated)\b/i,
      /^(who are you|what are you|what is your name)\b/i,
      /^(tell me a joke|make me laugh|tell a joke|tell another joke)\b/i,
      /^(?:are\s+you\s+there|you\s+there|are\s+you\s+awake|wake\s+up|jarvis)\b/i,
      /^(?:my name is|call me|i am)\s+([a-zA-Z]+)/i,
      /^(?:what is my name|what's my name|who am i|do you know my name)\b/i,
      /^(?:let'?s\s+focus\s+on|focus\s+on|talk\s+about)\s+([a-zA-Z0-9\s]+)/i
    ];

    // Conjunctions indicating multi-clause or hybrid commands
    this.conjunctionRegex = /\b(?:and\s+then|then|after\s+that|afterwards|and|also)\b/i;
  }

  /**
   * Fast pattern matching on input string.
   * @param {string} input Raw user input
   * @param {Array} [context=[]] Recent turns
   * @returns {object} Match result with type, confidence, actions, details
   */
  match(input, context = []) {
    if (!input || typeof input !== 'string') {
      return {
        type: IntentType.UNKNOWN,
        confidence: 0.0,
        rawInput: input,
        actions: [],
        reason: 'Empty or invalid input'
      };
    }

    const trimmed = input.trim();
    if (trimmed.length === 0) {
      return {
        type: IntentType.UNKNOWN,
        confidence: 0.0,
        rawInput: input,
        actions: [],
        reason: 'Whitespace-only input'
      };
    }

    // Strip leading wake word / address prefix (e.g. "Jarvis,", "Hey Jarvis,", "Jarvis ")
    let cleanText = trimmed;
    const wakePrefixMatch = cleanText.match(/^(?:hey\s+|ok\s+|okay\s+)?jarvis[,:\s]+/i);
    if (wakePrefixMatch && cleanText.length > wakePrefixMatch[0].length) {
      cleanText = cleanText.substring(wakePrefixMatch[0].length).trim();
    }

    const lower = cleanText.toLowerCase();

    let result = null;

    // 0. Check for fact dispute / correction first
    const correction = this._detectCorrection(lower, context);
    if (correction) {
      result = correction;
    }

    // 1. Check for compound / multi-clause input
    if (!result && this.conjunctionRegex.test(lower)) {
      const compoundResult = this._analyzeCompoundInput(cleanText);
      if (compoundResult) {
        result = compoundResult;
      }
    }

    // 2. Single-clause evaluation
    if (!result) {
      result = this._classifySingleClause(cleanText);
    }

    const { persona, tone } = this.detectPersonaAndTone(cleanText, result.type, context);
    result.persona = persona;
    result.tone = tone;
    return result;
  }

  /**
   * Detect fact corrections, negations, or disputes against prior conversation context.
   * @param {string} lower Cleaned lowercase input
   * @param {Array} context Recent turns
   * @returns {object|null}
   */
  _detectCorrection(lower, context = []) {
    // 1. Direct name disputes: "no its not my name", "that's not my name", "you got my name wrong", "not my name"
    const nameDispute = /\b(?:no(?:,\s*|\s+)(?:it'?s\s+not|that'?s\s+not|not)\s+(?:my\s+)?name|(?:that'?s\s+not|not)\s+my\s+name|you\s+got\s+my\s+name\s+wrong|my\s+name\s+is\s+not)\b/i;
    if (nameDispute.test(lower)) {
      return {
        type: IntentType.CORRECTION,
        confidence: 0.95,
        subject: 'user_name',
        actions: [],
        reason: 'User disputed user_name'
      };
    }

    // 2. Bot nickname/identity dispute
    const botNameDispute = /\b(?:that'?s\s+not\s+your\s+name|you\s+are\s+not|you'?re\s+not)\b/i;
    if (botNameDispute.test(lower) && /\b(?:name|called|jarvis)\b/i.test(lower)) {
      return {
        type: IntentType.CORRECTION,
        confidence: 0.95,
        subject: 'assistant_nickname',
        actions: [],
        reason: 'User disputed assistant identity'
      };
    }

    // 3. Location dispute: "i don't live in", "that's not where i live"
    const locationDispute = /\b(?:i\s+don'?t\s+live\s+in|not\s+where\s+i\s+live|that'?s\s+not\s+my\s+city)\b/i;
    if (locationDispute.test(lower)) {
      return {
        type: IntentType.CORRECTION,
        confidence: 0.95,
        subject: 'user_location',
        actions: [],
        reason: 'User disputed user_location'
      };
    }

    // 4. General negations/corrections: "no that's not what i said", "no that's wrong", "that is incorrect", "no you misunderstood"
    const generalCorrection = /^(?:no\b|nope\b|incorrect\b|wrong\b|that'?s\s+wrong|that\s+is\s+wrong|that'?s\s+incorrect|that\s+is\s+incorrect|no\s+that'?s\s+not|not\s+what\s+i\s+(?:said|meant|asked)|you\s+misunderstood)/i;
    if (generalCorrection.test(lower)) {
      let subject = 'general';
      if (Array.isArray(context) && context.length > 0) {
        const lastTurn = context[context.length - 1];
        const lastText = (lastTurn.content || lastTurn.text || '').toLowerCase();
        if (/\b(?:acquaintance|your name|call you)\b/i.test(lastText)) {
          subject = 'user_name';
        }
      }
      return {
        type: IntentType.CORRECTION,
        confidence: 0.92,
        subject,
        actions: [],
        reason: 'User negated or corrected prior turn'
      };
    }

    return null;
  }

  /**
   * Match command router with strict word boundaries to avoid false positives (e.g. 'hi' in 'think')
   * @private
   */
  _matchRouterWithWordBoundary(lower) {
    const match = this.router.match(lower);
    if (!match || !match.matchedPattern) return null;

    // Verify the matched pattern appears with word boundary
    const escaped = match.matchedPattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const wordBoundaryRegex = new RegExp(`(^|\\s)${escaped}(\\s|$)`, 'i');
    if (wordBoundaryRegex.test(lower)) {
      return match;
    }
    return null;
  }

  /**
   * Classify a single clause or sentence
   * @private
   */
  _classifySingleClause(text) {
    const lower = text.toLowerCase().replace(/[?!.,;]+$/, '').trim();

    const actionMatch = this._detectActionInText(lower);
    const isConversational = this._matchesConversationalPatterns(lower);

    // 1. Direct high confidence system action (open app, volume, window, power)
    if (actionMatch) {
      return {
        type: IntentType.ACTION,
        action: actionMatch.action,
        actions: [{ action: actionMatch.action, target: actionMatch.target, raw: text }],
        confidence: actionMatch.confidence,
        details: actionMatch
      };
    }

    // 2. High confidence conversational (questions, greetings, small talk)
    if (isConversational) {
      return {
        type: IntentType.CONVERSATIONAL,
        confidence: isConversational.confidence,
        category: isConversational.category,
        actions: []
      };
    }

    // 3. Check CommandRouter with word boundary matching
    const routerMatch = this._matchRouterWithWordBoundary(lower);
    if (routerMatch) {
      const isExact = routerMatch.matchedPattern && lower === routerMatch.matchedPattern.toLowerCase().trim();
      const confidence = isExact ? 1.0 : 0.8;
      return {
        type: IntentType.ACTION,
        action: routerMatch.action,
        actions: [{ action: routerMatch.action, raw: text }],
        confidence,
        matchedPattern: routerMatch.matchedPattern
      };
    }

    // Ambiguous / slang / unknown -> needs LLM
    return {
      type: IntentType.NEEDS_LLM,
      confidence: 0.4,
      rawInput: text,
      actions: [],
      reason: 'Low pattern matching confidence'
    };
  }

  /**
   * Detect system action keywords and targets in a text snippet
   * @private
   */
  _detectActionInText(lower) {
    // Focus or topic setting phrases are conversational, not direct actions
    if (/\b(?:let'?s\s+focus\s+on|focus\s+on|switch\s+focus\s+to|talk\s+about)\s+([a-z0-9\s]+)/i.test(lower)) {
      return null;
    }

    // Time & Date system queries (explicit date queries only, never loose 'today')
    if (/\b(?:what\s+(?:is\s+the\s+)?time|what\s+time\s+is\s+it|current\s+time|tell\s+me\s+the\s+time)\b/i.test(lower)) {
      return { action: 'time', target: 'system', confidence: 0.95 };
    }
    if (/\b(?:what\s+(?:is\s+the\s+)?date|what\s+date\s+is\s+it|what\s+day\s+is\s+it|what\s+day\s+is\s+today|today'?s\s+date)\b/i.test(lower)) {
      return { action: 'date', target: 'system', confidence: 0.95 };
    }

    // Typo-tolerant volume queries and controls (Requirement 14.2)
    const isVolumeQuery = fuzzyContainsWord(lower, 'volume') || /cu+r+ent\s+volume/i.test(lower);
    if (isVolumeQuery && (/\b(?:what|cu+r+ent|system|get|tell|show|check)\b/i.test(lower) || /^(?:volume|vloume)$/i.test(lower.trim()))) {
      return { action: 'get_volume', target: 'volume', confidence: 0.95 };
    }
    if (isVolumeQuery && /\b(?:set|turn|lower|raise|put)\b/i.test(lower) && /\b\d{1,3}\b/.test(lower)) {
      return { action: 'set_volume', target: 'volume', confidence: 0.95 };
    }
    if (/\b(?:volume\s*up|increase\s*volume|turn\s*up\s*(?:the\s*)?(?:volume|sound|audio)?|crank\s*up\s*(?:the\s*)?(?:volume|sound|audio)?|louder)\b/i.test(lower) ||
        (isVolumeQuery && /\b(?:up|increase|raise|turn\s*up|crank\s*up|louder)\b/i.test(lower))) {
      return { action: 'volume_up', target: 'volume', confidence: 0.95 };
    }
    if (/\b(?:volume\s*down|decrease\s*volume|turn\s*down\s*(?:the\s*)?(?:volume|sound|audio)?|lower\s*(?:the\s*)?(?:volume|sound|audio)?|softer)\b/i.test(lower) ||
        (isVolumeQuery && /\b(?:down|decrease|lower|turn\s*down|softer)\b/i.test(lower))) {
      return { action: 'volume_down', target: 'volume', confidence: 0.95 };
    }
    if (/\b(?:mute|unmute|silence|quiet)\b/i.test(lower)) {
      return { action: 'mute', target: 'audio', confidence: 0.95 };
    }

    // Typo-tolerant brightness queries (Requirement 14.2)
    if (fuzzyContainsWord(lower, 'brightness') || /\b(?:screen|display)\s+brightness\b/i.test(lower)) {
      return { action: 'get_brightness', target: 'display', confidence: 0.95 };
    }

    // Power & system state
    if (/\b(?:shutdown|shut\s*down|power\s*off)\b/i.test(lower) || fuzzyContainsWord(lower, 'shutdown')) {
      return { action: 'shutdown', target: 'system', confidence: 0.95 };
    }
    if (/\b(?:restart|reboot)\b/i.test(lower) || fuzzyContainsWord(lower, 'restart')) {
      return { action: 'restart', target: 'system', confidence: 0.95 };
    }
    if (/\b(?:lock\s*screen|lock\s*pc|lock\s*computer|lock)\b/i.test(lower)) {
      return { action: 'lock', target: 'system', confidence: 0.90 };
    }
    if (/\b(?:sleep|hibernate)\b/i.test(lower) && !/\b(?:how do i sleep|sleep well)\b/i.test(lower)) {
      return { action: 'sleep', target: 'system', confidence: 0.90 };
    }

    // Window / Tabs
    if (/\b(?:switch\s*tab|next\s*tab)\b/i.test(lower)) {
      return { action: 'switch_tab', target: 'tab', confidence: 0.95 };
    }
    if (/\b(?:previous\s*tab|prev\s*tab)\b/i.test(lower)) {
      return { action: 'previous_tab', target: 'tab', confidence: 0.95 };
    }
    if (/\b(?:maximize|maximize\s*window)\b/i.test(lower)) {
      return { action: 'maximize', target: 'window', confidence: 0.95 };
    }
    if (/\b(?:minimize|minimize\s*window)\b/i.test(lower)) {
      return { action: 'minimize', target: 'window', confidence: 0.95 };
    }

    // File creation with wider determiner groups (Priority 1)
    if (/\b(?:create|make|new)\s+(?:the|this|that\s+)?(?:new\s+)?file\b/i.test(lower)) {
      return { action: 'create_file', target: 'file', confidence: 0.95 };
    }
    if (/\b(?:create|make|new)\s+(?:the|this|that\s+)?(?:new\s+)?folder\b/i.test(lower)) {
      return { action: 'create_folder', target: 'folder', confidence: 0.95 };
    }

    // App launch verbs with typo tolerance: open, launch, start, run, fire up
    const launchMatch = lower.match(/\b(?:open|launch|start|run|fire\s*up)\s+([a-z0-9\s]+)/i);
    if (launchMatch) {
      const candidateTarget = launchMatch[1].trim();
      for (const [appKey, actionName] of Object.entries(APP_TARGETS)) {
        if (candidateTarget.includes(appKey) || fuzzyContainsWord(candidateTarget, appKey)) {
          return { action: actionName, target: appKey, confidence: 0.95 };
        }
      }
    }

    // Close verbs with typo tolerance: close, kill, exit, quit, terminate
    if (/\b(?:close\s+it|close\s+this|close\s+window|close\s+app)\b/i.test(lower)) {
      return { action: 'close_app', target: 'window', confidence: 0.95 };
    }
    const closeMatch = lower.match(/\b(?:close|kill|exit|quit|terminate)\s+([a-z0-9\s]+)/i);
    if (closeMatch) {
      const candidateTarget = closeMatch[1].trim();
      const KNOWN_CLOSE_ACTIONS = new Set(['close_chrome', 'close_notepad']);
      for (const appKey of Object.keys(APP_TARGETS)) {
        if (candidateTarget.includes(appKey) || fuzzyContainsWord(candidateTarget, appKey)) {
          const specificAction = `close_${appKey}`;
          if (KNOWN_CLOSE_ACTIONS.has(specificAction)) {
            return { action: specificAction, target: appKey, confidence: 0.90 };
          }
          return { action: 'close_app', target: candidateTarget, confidence: 0.85 };
        }
      }
      return { action: 'close_app', target: candidateTarget, confidence: 0.85 };
    }

    // File deletion with wider determiners (the, this, that)
    if (/\b(?:delete|remove)\s+(?:the|this|that\s+)?(?:file\s+)?[a-z0-9_\-\.]+/i.test(lower)) {
      return { action: 'delete_file', target: 'file', confidence: 0.95 };
    }

    // Standalone app mentions with action intention ONLY when app name is the entire input
    const cleanedForBareApp = lower.replace(/^(?:please\s+|launch\s+|open\s+)?/i, '').replace(/[.!?]+$/, '').trim();
    if (APP_TARGETS[cleanedForBareApp]) {
      return { action: APP_TARGETS[cleanedForBareApp], target: cleanedForBareApp, confidence: 0.85 };
    }

    // YouTube Media Controls
    if (/\b(?:pause\s+youtube|play\s+youtube|pause\s+(?:the\s+)?video|resume\s+(?:the\s+)?video|unpause\s+(?:the\s+)?video|toggle\s+playback)\b/i.test(lower)) {
      const isExact = /^(?:pause\s+youtube|play\s+youtube|pause\s+(?:the\s+)?video|resume\s+(?:the\s+)?video|unpause\s+(?:the\s+)?video|toggle\s+playback)$/i.test(lower);
      return { action: 'youtube_play_pause', target: 'youtube', confidence: isExact ? 1.0 : 0.8 };
    }
    if (/\b(?:next\s+video|skip\s+video|next\s+track|skip\s+(?:song|track)|next\s+song)\b/i.test(lower)) {
      const isExact = /^(?:next\s+video|skip\s+video|next\s+track|skip\s+(?:song|track)|next\s+song)$/i.test(lower);
      return { action: 'youtube_next', target: 'youtube', confidence: isExact ? 1.0 : 0.8 };
    }
    if (/\b(?:mute\s+youtube|unmute\s+youtube|mute\s+video)\b/i.test(lower)) {
      const isExact = /^(?:mute\s+youtube|unmute\s+youtube|mute\s+video)$/i.test(lower);
      return { action: 'youtube_mute', target: 'youtube', confidence: isExact ? 1.0 : 0.8 };
    }

    // Vision & Screen Queries
    if (/\b(?:what\s+am\s+i\s+(?:seeing|watching|looking\s+at)|tell\s+me\s+what\s+(?:i\s+am\s+seeing|is\s+on\s+(?:my\s+)?screen)|what(?:'s|\s+is)\s+on\s+my\s+screen|look\s+at\s+my\s+screen)\b/i.test(lower)) {
      const isExact = /^(?:what\s+am\s+i\s+(?:seeing|watching|looking\s+at)|tell\s+me\s+what\s+(?:i\s+am\s+seeing|is\s+on\s+(?:my\s+)?screen)|what(?:'s|\s+is)\s+on\s+my\s+screen|look\s+at\s+my\s+screen)$/i.test(lower);
      return { action: 'visual_context', target: 'screen', confidence: isExact ? 1.0 : 0.8 };
    }

    return null;
  }

  /**
   * Check if text matches conversational patterns
   * @private
   */
  _matchesConversationalPatterns(lower) {
    for (const pattern of this.socialPatterns) {
      if (pattern.test(lower)) {
        return { confidence: 0.95, category: 'social' };
      }
    }

    for (const pattern of this.questionPatterns) {
      if (pattern.test(lower)) {
        // Distinguish questions about actions from questions to chat
        // e.g. "can you open chrome" -> action, "can you explain gravity" -> conversational
        if (/\b(?:open|launch|start|close|kill|mute|unmute|shutdown|restart)\b/i.test(lower)) {
          return null;
        }
        return { confidence: 0.90, category: 'question' };
      }
    }

    return null;
  }

  /**
   * Analyze compound inputs containing conjunctions ('and', 'then', etc.)
   * @private
   */
  _analyzeCompoundInput(rawInput) {
    // Split by conjunctions: "and then", "then", "after that", "and", "also"
    const clauses = rawInput
      .split(/\b(?:and\s+then|then|after\s+that|afterwards|and|also)\b/i)
      .map(c => c.trim())
      .filter(c => c.length > 0);

    if (clauses.length <= 1) {
      return null;
    }

    const detectedActions = [];
    const conversationalClauses = [];

    for (const clause of clauses) {
      const action = this._detectActionInText(clause.toLowerCase());
      if (action) {
        detectedActions.push({
          action: action.action,
          target: action.target,
          raw: clause
        });
      } else {
        // Check if clause is an app target following a previous action verb
        // e.g. "open chrome and notepad" -> clause 2 is "notepad"
        const lowerClause = clause.toLowerCase().replace(/[?!.,;]+$/, '').trim();
        if (APP_TARGETS[lowerClause] && detectedActions.length > 0) {
          detectedActions.push({
            action: APP_TARGETS[lowerClause],
            target: lowerClause,
            raw: clause
          });
        } else {
          conversationalClauses.push(clause);
        }
      }
    }

    // Multiple actions and NO conversation clauses
    if (detectedActions.length > 1 && conversationalClauses.length === 0) {
      return {
        type: IntentType.ACTION,
        confidence: 0.92,
        isMultiAction: true,
        actions: detectedActions,
        executionOrder: detectedActions.map(a => a.action),
        rawInput
      };
    }

    // Both action(s) AND conversational clause(s) -> HYBRID
    if (detectedActions.length > 0 && conversationalClauses.length > 0) {
      return {
        type: IntentType.HYBRID,
        confidence: 0.90,
        actions: detectedActions,
        conversationalQuery: conversationalClauses.join(' and '),
        executionOrder: ['action', 'conversation'],
        rawInput
      };
    }

    // Multiple conversational clauses
    if (detectedActions.length === 0 && conversationalClauses.length > 1) {
      return {
        type: IntentType.CONVERSATIONAL,
        confidence: 0.88,
        conversationalQuery: rawInput,
        actions: []
      };
    }

    return null;
  }

  /**
   * Infer persona and tone from conversational, contextual drift, and stylistic signals
   * @param {string} text Current user input
   * @param {string} [intentType] Classified intent type
   * @param {Array<{role: string, content: string}>} [context=[]] Surrounding conversation context
   * @returns {{ persona: 'strict' | 'balanced' | 'casual' | 'buddy', tone: 'formal' | 'friendly' | 'concise' | 'witty' }}
   */
  detectPersonaAndTone(text, intentType = null, context = []) {
    if (!text || typeof text !== 'string') {
      return { persona: 'balanced', tone: 'friendly' };
    }

    const lower = text.toLowerCase();

    // 0. Conversational drift tracking: inspect recent turns in context (Section 2.1)
    if (Array.isArray(context) && context.length > 0) {
      const recentUserTurns = context
        .filter(t => t.role === 'user')
        .slice(-3)
        .map(t => (t.content || '').toLowerCase());

      const frustrationCount = recentUserTurns.filter(t =>
        /\b(?:not\s+working|broken|hate|stupid|annoying|useless|failed|terrible|argh|damn|crap|why\s+won'?t|give\s+up)\b/i.test(t)
      ).length;

      // If user has been venting for multiple turns, drift toward casual/buddy with empathetic warmth
      if (frustrationCount >= 2) {
        return { persona: 'buddy', tone: 'friendly' };
      }

      const companionCount = recentUserTurns.filter(t =>
        /\b(?:yo|bro|bruh|buddy|homie|pal|dude|fam|haha|lol|lmao)\b/i.test(t)
      ).length;

      // If companion banter is sustained across turns, retain buddy persona
      if (companionCount >= 2) {
        return { persona: 'buddy', tone: 'witty' };
      }
    }

    // 1. Buddy signals (slang, laughter, companion nicknames, informal greetings)
    const buddySlang = /\b(?:yo|bro|bruh|buddy|homie|pal|dude|fam|my guy)\b/i;
    const buddyLaughter = /\b(?:haha|hahaha|lol|lmao|rofl|hehe)\b/i;
    const buddyExcitement = /\b(?:let's go|lets go|hyped|so cool|awesome|rad|sick|dope)\b/i;
    const nicknameAssignment = /\b(?:your name is|your nickname is|call yourself)\b/i;

    if (buddySlang.test(lower) || buddyLaughter.test(lower) || nicknameAssignment.test(lower) || (buddyExcitement.test(lower) && lower.includes('!'))) {
      return { persona: 'buddy', tone: 'witty' };
    }

    // 2. Strict signals (pure imperative system control, short commands, diagnostics, urgency)
    const strictVerbs = /^(?:open|close|kill|terminate|shutdown|restart|reboot|lock|mute|unmute|status|diagnostics|list|clear|exit|quit)\b/i;
    if (intentType === IntentType.ACTION || (strictVerbs.test(lower) && text.split(/\s+/).length <= 4)) {
      return { persona: 'strict', tone: 'concise' };
    }

    // 3. Casual signals (relaxed questions, greetings, jokes, small talk)
    const casualSignals = /\b(?:what's up|whats up|how's it going|hows it going|tell me a joke|sup|bored|hungry|tired)\b/i;
    if (casualSignals.test(lower)) {
      return { persona: 'casual', tone: 'friendly' };
    }

    // 4. Default: Balanced (polite, intellectual inquiries, standard JARVIS)
    return { persona: 'balanced', tone: 'friendly' };
  }
}

/**
 * Main IntentClassifier Orchestrator
 * Integrates FastIntentMatcher (Stage 1) with optional LLMEngine Fallback (Stage 2)
 */
export class IntentClassifier {
  /**
   * @param {object} options
   * @param {LLMEngine} [options.llmEngine] Optional LLMEngine instance for Stage 2 fallback
   * @param {CommandRouter} [options.commandRouter] Custom command router
   * @param {number} [options.confidenceThreshold=0.80] Confidence threshold for fast matcher
   * @param {string} [options.pinnedPersona] Explicitly pinned personality preset (bypasses dynamic selection)
   * @param {string} [options.personality] Alias for pinnedPersona
   */
  constructor(options = {}) {
    this.llmEngine = options.llmEngine || null;
    this.confidenceThreshold = options.confidenceThreshold ?? 0.80;
    this.pinnedPersona = options.pinnedPersona || options.personality || null;
    this.fastMatcher = new FastIntentMatcher(options.commandRouter);

    this.metrics = {
      totalClassifications: 0,
      fastMatches: 0,
      llmFallbacks: 0,
      hybridDetected: 0,
      totalLatencyMs: 0
    };
  }

  /**
   * Pin or unpin a personality preset override
   * @param {string|null} preset
   */
  setPinnedPersona(preset) {
    this.pinnedPersona = preset ? String(preset).toLowerCase() : null;
  }

  /**
   * Classify user input into action, conversational, or hybrid.
   * @param {string} userInput Raw text input
   * @param {Array<{role: string, content: string}>} [context=[]] Recent conversation history
   * @returns {Promise<{type: string, confidence: number, actions: Array, details: object, persona: string, tone: string, isPinned: boolean, latencyMs: number}>}
   */
  async classify(userInput, context = []) {
    const startTime = Date.now();
    this.metrics.totalClassifications++;

    const enrich = (res, stage, latencyMs) => {
      let persona = res.persona || 'balanced';
      let isPinned = false;
      if (this.pinnedPersona) {
        persona = this.pinnedPersona.toLowerCase();
        isPinned = true;
      }
      let tone = res.tone || (persona === 'strict' ? 'concise' : persona === 'buddy' ? 'witty' : 'friendly');
      return {
        ...res,
        persona,
        tone,
        isPinned,
        stage,
        latencyMs
      };
    };

    // Stage 1: Fast pattern matching (<2ms)
    const fastResult = this.fastMatcher.match(userInput, context);

    // If fast match has high confidence and doesn't explicitly need LLM, return immediately
    if (fastResult.confidence >= this.confidenceThreshold && fastResult.type !== IntentType.NEEDS_LLM) {
      const latencyMs = Date.now() - startTime;
      this.metrics.fastMatches++;
      this.metrics.totalLatencyMs += latencyMs;
      if (fastResult.type === IntentType.HYBRID) this.metrics.hybridDetected++;

      return enrich(fastResult, 'fast_pattern', latencyMs);
    }

    // Stage 2: LLM Fallback (if LLM engine is provided and ready)
    if (this.llmEngine && typeof this.llmEngine.generate === 'function') {
      try {
        this.metrics.llmFallbacks++;
        const llmResult = await this._classifyWithLLM(userInput, context);
        const latencyMs = Date.now() - startTime;
        this.metrics.totalLatencyMs += latencyMs;
        if (llmResult.type === IntentType.HYBRID) this.metrics.hybridDetected++;

        return enrich({
          ...llmResult,
          fastResult // Preserve fast result for diagnostics
        }, 'llm_fallback', latencyMs);
      } catch (err) {
        console.warn('[IntentClassifier] LLM fallback failed or timed out:', err.message);
        // Requirement 14.2: Timeout or failure on classification must never trigger a guessed action.
        // Fall through to open conversation safely.
        const latencyMs = Date.now() - startTime;
        this.metrics.totalLatencyMs += latencyMs;
        return enrich({
          type: IntentType.CONVERSATIONAL,
          confidence: 0.75,
          reason: 'Classification timed out, safe conversational fallback'
        }, 'conversational_safe_fallback', latencyMs);
      }
    }

    // Fallback if LLM unavailable: If fast match was not a high-confidence action, default safely to conversational
    const latencyMs = Date.now() - startTime;
    this.metrics.totalLatencyMs += latencyMs;

    const safeType = (fastResult.type === IntentType.ACTION && fastResult.confidence < this.confidenceThreshold)
      ? IntentType.CONVERSATIONAL
      : (fastResult.type === IntentType.NEEDS_LLM ? IntentType.CONVERSATIONAL : fastResult.type);

    return enrich({
      ...fastResult,
      type: safeType
    }, 'safe_pattern_fallback', latencyMs);
  }

  /**
   * Run LLM inference to classify ambiguous input
   * @private
   */
  async _classifyWithLLM(userInput, context = []) {
    const prompt = buildIntentClassificationPrompt({
      userInput,
      context
    });

    const completion = await this.llmEngine.generate({
      prompt,
      ...SAMPLING_PRESETS.CLASSIFICATION,
      timeout: 7000
    });

    if (!completion || !completion.success || !completion.text) {
      return {
        type: IntentType.UNKNOWN,
        confidence: 0.3,
        reason: 'LLM completion returned empty or failure',
        persona: 'balanced',
        tone: 'friendly',
        actions: []
      };
    }

    const rawResponse = completion.text.trim();
    let type = IntentType.CONVERSATIONAL;
    let persona = 'balanced';
    let tone = 'friendly';

    // Parse single structured JSON emitted by model
    try {
      const jsonMatch = rawResponse.match(/\{[\s\S]*?\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.intent === 'action') type = IntentType.ACTION;
        else if (parsed.intent === 'hybrid') type = IntentType.HYBRID;
        else if (parsed.intent === 'conversational') type = IntentType.CONVERSATIONAL;

        if (['strict', 'balanced', 'casual', 'buddy'].includes(parsed.persona?.toLowerCase())) {
          persona = parsed.persona.toLowerCase();
        }
        if (['concise', 'formal', 'friendly', 'witty'].includes(parsed.tone?.toLowerCase())) {
          tone = parsed.tone.toLowerCase();
        }
      } else {
        const lower = rawResponse.toLowerCase();
        if (lower.includes('action')) type = IntentType.ACTION;
        else if (lower.includes('hybrid')) type = IntentType.HYBRID;
        else if (lower.includes('conversational')) type = IntentType.CONVERSATIONAL;
      }
    } catch (_) {
      const lower = rawResponse.toLowerCase();
      if (lower.includes('action')) type = IntentType.ACTION;
      else if (lower.includes('hybrid')) type = IntentType.HYBRID;
      else if (lower.includes('conversational')) type = IntentType.CONVERSATIONAL;
    }

    // Extract potential actions if LLM indicated action or hybrid
    let actions = [];
    if (type === IntentType.ACTION || type === IntentType.HYBRID) {
      const fastDetect = this.fastMatcher.match(userInput, context);
      actions = fastDetect.actions || [];
    }

    return {
      type,
      confidence: 0.85,
      persona,
      tone,
      llmResponse: completion.text.trim(),
      actions,
      rawInput: userInput
    };
  }

  /**
   * Get classifier performance metrics
   * @returns {object}
   */
  getMetrics() {
    const avgLatency = this.metrics.totalClassifications > 0
      ? +(this.metrics.totalLatencyMs / this.metrics.totalClassifications).toFixed(2)
      : 0;

    return {
      ...this.metrics,
      avgLatencyMs: avgLatency
    };
  }
}

export default IntentClassifier;
