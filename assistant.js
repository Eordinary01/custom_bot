/**
 * JARVIS Conversational AI - Unified Assistant Entry Point
 * 
 * Supports both Classic Mode (v1.0 pattern-matching) and JARVIS Mode (v2.0 full conversational AI)
 * with CLI flag switching, backward compatibility, and programmatic creation.
 * 
 * Usage:
 *   node assistant.js                      (Runs in default JARVIS mode)
 *   node assistant.js --mode jarvis        (Runs full JARVIS Orchestrator)
 *   node assistant.js --mode classic       (Runs legacy CommandRouter + Executor)
 *   node assistant.js --dry-run            (Simulates actions safely without OS side effects)
 *   node assistant.js --personality strict (Sets initial personality preset)
 * 
 * Requirements: 6.4, 13.1, 13.6
 */

// Runtime Node.js version validation (Fix 1)
const [nodeMajor, nodeMinor] = process.versions.node.split('.').map(Number);
if (nodeMajor < 22 || (nodeMajor === 22 && nodeMinor < 5)) {
  console.error(`\n❌ Error: Node.js 22.5.0 or higher is required to run JARVIS (current: v${process.versions.node}).`);
  console.error('JARVIS uses native node:sqlite which was introduced in Node.js v22.5.0.');
  console.error('Please upgrade your Node.js runtime (https://nodejs.org/).\n');
  process.exit(1);
}

import readline from 'readline';
import { fileURLToPath } from 'url';
import CommandRouter from './commandRouter.js';
import Executor from './executor.js';
import { DESTRUCTIVE_ACTIONS } from './src/action-bridge.js';

/**
 * Legacy Classic Assistant (v1.0)
 * Uses exact regex pattern matching via CommandRouter and direct Executor execution.
 */
export class TextAssistant {
  constructor(options = {}) {
    this.router = options.router || new CommandRouter();
    this.executor = options.executor || new Executor();
    this.dryRun = options.dryRun || false;
    this.isAwake = false;
    this.sleepTimer = null;
    this.rl = null;
    this.mode = 'classic';
    this.pendingConfirmation = null;
  }

  async handleInput(text) {
    const trimmed = text.trim();
    if (!trimmed) {
      this.promptUser();
      return;
    }

    if (trimmed.toLowerCase() === 'exit' || trimmed.toLowerCase() === 'quit') {
      console.log('👋 Goodbye!');
      if (this.rl) this.rl.close();
      process.exit(0);
    }

    // Pending confirmation check
    if (this.pendingConfirmation) {
      const pending = this.pendingConfirmation;
      this.pendingConfirmation = null;
      if (/^(?:yes|y|proceed|confirm|sure|do it|ok|okay)\b/i.test(trimmed)) {
        console.log(`🚀 Executing confirmed destructive action: ${pending.action}`);
        if (this.dryRun) {
          console.log(`[Dry-Run] Simulating execution of action: ${pending.action}`);
          this.executor.lastResponse = `[Dry-Run] Simulated ${pending.action}`;
        } else {
          await this.executor.run(pending.action, pending.text);
        }
        console.log(`✅ ${this.executor.lastResponse}`);
      } else {
        console.log('Action cancelled. Safety maintained.');
      }
      this.promptUser();
      return;
    }

    console.log(`\n🔍 Processing: "${trimmed}"`);

    const match = this.router.match(trimmed);
    if (!match) {
      console.log("🤔 I didn't understand that. Type 'help' for available commands.");
      this.promptUser();
      return;
    }

    if (DESTRUCTIVE_ACTIONS.has(match.action)) {
      this.pendingConfirmation = { action: match.action, text: trimmed };
      console.log(`⚠️ Warning: "${match.action}" is a destructive system action. Are you certain you wish to proceed? (yes/no)`);
      this.promptUser();
      return;
    }

    console.log(`🚀 Executing: ${match.action}`);
    if (this.dryRun) {
      console.log(`[Dry-Run] Simulating execution of action: ${match.action}`);
      this.executor.lastResponse = `[Dry-Run] Simulated ${match.action}`;
    } else {
      await this.executor.run(match.action, trimmed);
    }
    console.log(`✅ ${this.executor.lastResponse}`);

    this.promptUser();
  }

  promptUser() {
    setImmediate(() => {
      if (this.rl) {
        this.rl.prompt();
      }
    });
  }

  start() {
    console.log('===================================================');
    console.log('🤖 Custom Bot - Classic Assistant Mode (v1.0)');
    console.log('   Fast pattern matching for 60+ system commands');
    console.log("💡 Type 'help' for available commands.");
    console.log("💡 Type 'exit' or 'quit' to close.");
    console.log('===================================================\n');

    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: 'classic> '
    });

    this.rl.prompt();

    this.rl.on('line', (line) => {
      this.handleInput(line);
    });

    this.rl.on('close', () => {
      console.log('\n👋 Shutting down classic assistant...');
      process.exit(0);
    });

    process.on('SIGINT', () => {
      console.log('\n👋 Shutting down classic assistant...');
      if (this.rl) this.rl.close();
      process.exit(0);
    });
  }
}

/**
 * Parse CLI command-line arguments
 * @param {string[]} args Process argv slice
 * @returns {object} Parsed options
 */
export function parseCliArgs(args = process.argv.slice(2)) {
  const options = {
    mode: 'jarvis',
    dryRun: false,
    configPath: null,
    personality: null,
    voice: true, // Voice-first by default (Requirement 3)
    voiceName: null,
    online: false, // 100% offline by default (Master Instructions Section 5)
    listen: false, // Live microphone listening
    help: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--mode' && i + 1 < args.length) {
      const modeVal = args[++i].toLowerCase();
      if (modeVal === 'classic' || modeVal === 'jarvis') {
        options.mode = modeVal;
      } else {
        console.warn(`[Warning] Unknown mode "${modeVal}". Defaulting to "jarvis".`);
      }
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--voice') {
      options.voice = true;
    } else if (arg === '--mute' || arg === '--silent') {
      options.voice = false;
    } else if (arg === '--listen' || arg === '-l') {
      options.listen = true;
    } else if (arg === '--voice-name' && i + 1 < args.length) {
      options.voiceName = args[++i];
    } else if (arg === '--online') {
      options.online = true;
    } else if (arg === '--offline') {
      options.online = false;
    } else if (arg === '--config' && i + 1 < args.length) {
      options.configPath = args[++i];
    } else if (arg === '--personality' && i + 1 < args.length) {
      options.personality = args[++i];
    }
  }

  return options;
}

/**
 * Print CLI help documentation
 */
export function printHelp() {
  console.log(`
JARVIS Conversational AI & Custom Bot Assistant

Usage:
  node assistant.js [options]

Options:
  --mode <classic|jarvis>   Select assistant mode:
                            • jarvis  (default): Full conversational AI with natural language,
                              pronoun resolution, multi-turn memory, and local LLM
                            • classic: Legacy v1.0 pattern router and direct executor
  --listen, -l              Enable microphone speech recognition (voice input)
  --mute, --silent          Mute Text-to-Speech vocal output (voice is enabled by default)
  --voice                   Explicitly enable Text-to-Speech vocal output
  --voice-name <name>       Select TTS voice (e.g. 'Microsoft David Desktop', 'Microsoft Zira Desktop')
  --online                  Enable local meta-search (SearxNG / localhost:8080) for web retrieval
  --offline                 Enforce 100% offline mode (default)
  --dry-run                 Simulate commands without making OS modifications
  --personality <preset>    Hard-pin personality preset: strict | balanced | casual | buddy
  --config <path>           Custom JSON configuration file path
  --help, -h                Show this help message

Examples:
  node assistant.js                          Start in voice-first JARVIS conversational mode (offline)
  node assistant.js --listen                 Start JARVIS with live microphone voice input enabled
  node assistant.js --online                 Start JARVIS with local SearxNG web retrieval enabled
  node assistant.js --mute                   Start JARVIS in quiet text-only mode
  node assistant.js --personality buddy      Start with buddy persona hard-pinned
  node assistant.js --mode classic           Start in legacy classic mode
  node assistant.js --dry-run                Start JARVIS in safe dry-run mode
`);
}

/**
 * Factory to create assistant instance based on configuration
 * @param {object} options
 * @returns {Promise<TextAssistant|JarvisOrchestrator>}
 */
export async function createAssistant(options = {}) {
  const mode = options.mode || 'jarvis';

  if (mode === 'classic') {
    return new TextAssistant({ dryRun: options.dryRun });
  } else {
    const jarvisOptions = {
      dryRun: options.dryRun || false,
      configPath: options.configPath || null,
      autoLoadLLM: options.autoLoadLLM ?? false,
      voice: options.voice !== undefined ? options.voice : !(options.mute || options.silent),
      voiceName: options.voiceName || null,
      online: options.online ?? false,
      listen: options.listen ?? false
    };
    if (options.personality) {
      jarvisOptions.configOverrides = {
        personality: { preset: options.personality }
      };
    }
    const { JarvisOrchestrator } = await import('./jarvis.js');
    const jarvis = new JarvisOrchestrator(jarvisOptions);
    await jarvis.initialize();
    return jarvis;
  }
}

// Auto-run if executed directly as entry script
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isMain) {
  const cliOptions = parseCliArgs();

  if (cliOptions.help) {
    printHelp();
    process.exit(0);
  }

  if (cliOptions.mode === 'classic') {
    const assistant = new TextAssistant({ dryRun: cliOptions.dryRun });
    assistant.start();
  } else {
    createAssistant({ ...cliOptions, autoLoadLLM: true }).then((jarvis) => {
      jarvis.start();
    }).catch((err) => {
      console.error('❌ Failed to launch JARVIS Assistant:', err);
      process.exit(1);
    });
  }
}

export default createAssistant;
