/**
 * JARVIS Conversational AI - Vision & Screen Intelligence Module
 * 
 * Provides visual context and screen understanding:
 * - Runs python/vision_capture.py for screenshot & window introspection
 * - Combines with BrowsingInspector for YouTube & browser tab awareness
 * - Fences output with SystemObserver XML fences to prevent prompt injection
 */

import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { BrowsingInspector } from './browsing.js';
import { SystemObserver } from './system-observer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class VisionProvider {
  /**
   * @param {object} [options={}]
   */
  constructor(options = {}) {
    this.pythonPath = options.pythonPath || this._findPythonPath();
    this.scriptPath = options.scriptPath || path.resolve(__dirname, '../python/vision_capture.py');
    this.browsing = options.browsing || new BrowsingInspector();
    this.observer = options.observer || new SystemObserver();
  }

  /**
   * Find python executable in local venv or system
   * @private
   */
  _findPythonPath() {
    const venvPython = path.resolve(__dirname, '../venv/Scripts/python.exe');
    if (fs.existsSync(venvPython)) {
      return venvPython;
    }
    return 'python';
  }

  /**
   * Capture visual and screen context
   * @returns {Promise<{success: boolean, text: string, imagePath: string|null, windowTitle: string, app: string, youtube: object, summary: string, fencedContext: string}>}
   */
  async getVisualContext() {
    let screenData = {
      success: false,
      imagePath: null,
      windowTitle: '',
      app: '',
      text: ''
    };

    try {
      screenData = await this._runVisionCapture();
    } catch (_) {}

    // Combine with browser & YouTube context
    const browsingSummary = this.browsing.getBrowsingSummary();
    const isYouTube = browsingSummary.youtube && browsingSummary.youtube.isYouTube;

    let summaryParts = [];
    if (isYouTube && browsingSummary.youtube.videoTitle) {
      summaryParts.push(`Currently watching YouTube video: "${browsingSummary.youtube.videoTitle}"`);
    } else if (screenData.windowTitle) {
      summaryParts.push(`Active window: "${screenData.windowTitle}" (${screenData.app || 'application'})`);
    } else if (browsingSummary.recentTabs.length > 0) {
      summaryParts.push(`Browser active tab: "${browsingSummary.recentTabs[0].title}"`);
    } else {
      summaryParts.push('Screen observed: Desktop workspace active.');
    }

    const summary = summaryParts.join(' | ');

    // Fence context safely against prompt injection
    const rawContent = {
      activeWindow: screenData.windowTitle || null,
      activeApp: screenData.app || null,
      youtube: browsingSummary.youtube,
      screenSummary: summary
    };

    const fencedContext = this.observer.formatForPrompt('visual_context', rawContent);

    return {
      success: true,
      text: summary,
      imagePath: screenData.imagePath,
      windowTitle: screenData.windowTitle,
      app: screenData.app,
      youtube: browsingSummary.youtube,
      summary,
      fencedContext
    };
  }

  /**
   * Run python/vision_capture.py and parse JSON
   * @private
   */
  _runVisionCapture() {
    return new Promise((resolve) => {
      let stdout = '';
      const child = spawn(this.pythonPath, [this.scriptPath], {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'ignore']
      });

      const timer = setTimeout(() => {
        try { child.kill(); } catch (_) {}
        resolve({ success: false, text: '' });
      }, 4000);

      child.stdout.on('data', chunk => {
        stdout += chunk.toString();
      });

      child.on('close', () => {
        clearTimeout(timer);
        try {
          const parsed = JSON.parse(stdout.trim());
          resolve(parsed);
        } catch (_) {
          resolve({ success: false, text: stdout.trim() });
        }
      });

      child.on('error', () => {
        clearTimeout(timer);
        resolve({ success: false, text: '' });
      });
    });
  }
}

export default VisionProvider;
