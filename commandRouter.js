import fs from 'fs';
import path from 'path';

class CommandRouter {
  constructor(commandsPath) {
    this.commandsPath = commandsPath || path.join(process.cwd(), 'commands.json');
    this.commands = this.loadCommands();
  }

  loadCommands() {
    try {
      const raw = fs.readFileSync(this.commandsPath, 'utf8');
      return JSON.parse(raw);
    } catch (err) {
      console.error('Failed to load commands.json:', err.message);
      return [];
    }
  }

  match(input) {
    // Edge case: null, undefined, or empty input
    if (!input || typeof input !== 'string') {
      return null;
    }

    const lower = input.toLowerCase().trim();
    
    // Edge case: empty string after trim
    if (lower.length === 0) {
      return null;
    }

    const allPatterns = [];
    for (const cmd of this.commands) {
      // Edge case: validate command structure
      if (!cmd.patterns || !Array.isArray(cmd.patterns) || !cmd.action) {
        continue;
      }

      for (const pattern of cmd.patterns) {
        // Edge case: skip invalid patterns
        if (typeof pattern !== 'string' || pattern.length === 0) {
          continue;
        }
        allPatterns.push({ pattern, action: cmd.action });
      }
    }

    // Sort by pattern length (longest first) to avoid substring false positives
    allPatterns.sort((a, b) => b.pattern.length - a.pattern.length);

    for (const { pattern, action } of allPatterns) {
      const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`(?:^|\\b)${escaped}(?:\\b|$)`, 'i');
      if (regex.test(lower)) {
        return { action, matchedPattern: pattern };
      }
    }
    return null;
  }
}

export default CommandRouter;