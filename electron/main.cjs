/**
 * JARVIS Conversational AI - Electron Desktop Main Process
 * 
 * Provides native desktop integration:
 * - System Tray with summon, mute, and status menu
 * - Global Shortcut Hotkey (Ctrl+Shift+Space) to summon/hide JARVIS HUD
 * - Secure Context-Isolated BrowserWindow
 * - IPC bridge to JarvisOrchestrator and AudioInterface
 * - Round-trip Confirmation Gate for Destructive Actions
 * 
 * Security Invariants:
 * - nodeIntegration: false
 * - contextIsolation: true
 * - Zero remote code execution
 */

const { app, BrowserWindow, ipcMain, globalShortcut, Tray, Menu, nativeImage } = require('electron');
const path = require('path');

let mainWindow = null;
let tray = null;
let jarvis = null;
let isQuitting = false;
let StreamSpeechBuffer = null;

// Create HUD Window
function createWindow() {
  const { session } = require('electron');
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    if (permission === 'media') {
      return callback(true);
    }
    callback(false);
  });
  session.defaultSession.setPermissionCheckHandler((webContents, permission) => {
    if (permission === 'media') {
      return true;
    }
    return false;
  });

  mainWindow = new BrowserWindow({
    width: 920,
    height: 740,
    minWidth: 720,
    minHeight: 540,
    backgroundColor: '#070b14',
    frame: false,
    titleBarStyle: 'hidden',
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs'),
      sandbox: true
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
  });

  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      mainWindow.hide();
      return false;
    }
  });
}

// Create System Tray
function createTray() {
  // Generate simple 16x16 cyan dot icon programmatically
  const size = 16;
  const buffer = Buffer.alloc(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    buffer[i * 4] = 0;     // B
    buffer[i * 4 + 1] = 229; // G
    buffer[i * 4 + 2] = 255; // R
    buffer[i * 4 + 3] = 255; // A
  }
  const icon = nativeImage.createFromBuffer(buffer, { width: size, height: size });

  tray = new Tray(icon);
  tray.setToolTip('JARVIS Conversational AI');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Summon JARVIS (Ctrl+Shift+Space)',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      }
    },
    {
      label: 'Push-to-Talk',
      click: () => {
        if (jarvis && jarvis.audioInterface) {
          jarvis.audioInterface.triggerPtt();
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Quit JARVIS',
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(contextMenu);
  tray.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.hide();
      } else {
        mainWindow.show();
        mainWindow.focus();
      }
    }
  });
}

// Register Global Shortcut
function registerShortcuts() {
  globalShortcut.register('CommandOrControl+Shift+Space', () => {
    if (!mainWindow) return;
    if (mainWindow.isVisible() && mainWindow.isFocused()) {
      mainWindow.hide();
    } else {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

// Shared Unified Message Handler (both typed and voice input route through here)
async function handleUserMessage(text) {
  if (!jarvis) {
    return { text: 'JARVIS core is initializing, please wait a moment, sir.' };
  }

  try {
    let streamBuffer = null;
    if (jarvis.audioInterface && jarvis.audioInterface.voiceOutput && StreamSpeechBuffer) {
      streamBuffer = new StreamSpeechBuffer(jarvis.audioInterface);
    }

    const outcome = await jarvis.process(text, {
      onToken: (token) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('jarvis:streamToken', { token });
        }
        if (streamBuffer) {
          streamBuffer.appendToken(token);
        }
      }
    });

    // Speak the response: flush streamed sentence chunks or speak complete outcome text
    if (streamBuffer && streamBuffer.chunksSpoken > 0) {
      await streamBuffer.flush();
    } else if (jarvis.audioInterface && jarvis.audioInterface.voiceOutput && outcome.text) {
      await jarvis.audioInterface.speakAsync(outcome.text);
    }

    // Check if destructive action requires user confirmation
    if (outcome.actionResult && outcome.actionResult.requiresConfirmation) {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('jarvis:actionPending', {
          action: outcome.actionResult.action,
          warning: outcome.text
        });
      }
    }

    // Broadcast full response to renderer (both standard 'jarvis:response' and legacy 'jarvis:voiceResponse')
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('jarvis:response', {
        text: outcome.text,
        intent: outcome.intent,
        persona: outcome.persona,
        actionResult: outcome.actionResult
      });
      mainWindow.webContents.send('jarvis:voiceResponse', {
        text: outcome.text,
        intent: outcome.intent,
        persona: outcome.persona
      });
    }

    return {
      text: outcome.text,
      intent: outcome.intent,
      persona: outcome.persona,
      actionResult: outcome.actionResult
    };
  } catch (err) {
    console.error('[Electron] Error processing user message:', err.message);
    if (jarvis && jarvis.audioInterface) {
      jarvis.audioInterface.setState('idle');
    }
    return { text: `Encountered an issue processing request: ${err.message}` };
  }
}

// Initialize Backend Orchestrator
async function initJarvis() {
  try {
    const { createAssistant } = await import('../assistant.js');
    const audioMod = await import('../src/audio-interface.js');
    StreamSpeechBuffer = audioMod.StreamSpeechBuffer;

    jarvis = await createAssistant({
      mode: 'jarvis',
      voice: true,
      listen: true,
      autoLoadLLM: true
    });

    if (jarvis && jarvis.audioInterface) {
      // Remove CLI-mode listener to prevent double processing in Electron
      jarvis.audioInterface.removeAllListeners('speechHeard');
      jarvis.audioInterface.removeAllListeners('playbackFinished');

      // Audio state → HUD reactor visualizer
      jarvis.audioInterface.on('stateChange', ({ newState, oldState }) => {
        console.log(`[Electron:Audio] State: ${oldState} → ${newState}`);
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('jarvis:audioState', { state: newState });
        }
      });

      // Playback finished → reset to idle
      jarvis.audioInterface.on('playbackFinished', () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('jarvis:audioState', { state: 'idle' });
        }
      });

      // Voice input → full Electron pipeline: display transcript → process → display response → TTS
      jarvis.audioInterface.on('speechHeard', async (transcript, data) => {
        console.log(`[Electron:Voice] Heard: "${transcript}" (conf: ${data?.confidence ?? 'N/A'})`);

        // Guard: don't re-enter while already processing or speaking
        const audioState = jarvis.audioInterface.state;
        if (audioState === 'processing' || audioState === 'speaking') {
          console.log(`[Electron:Voice] Ignoring (state=${audioState})`);
          return;
        }

        // 1. Show transcript in renderer chat as user voice message
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('jarvis:voiceHeard', { transcript });
          mainWindow.webContents.send('jarvis:voiceUserMessage', { text: transcript, confidence: data?.confidence });
        }

        // 2. Parse wake word and command text
        const { isWakeWord, commandText, isStandaloneWakeWord } = jarvis.audioInterface.handleSpeechInput(transcript);

        // Case A: Standalone wake word ("Hey Jarvis", "Jarvis") -> Acknowledge audibly and stay in listening mode
        if (isWakeWord && (!commandText || isStandaloneWakeWord)) {
          console.log('[Electron:Voice] Standalone wake word detected — acknowledging user.');
          const currentPersona = (typeof jarvis?.getCurrentPersona === 'function' ? jarvis.getCurrentPersona() : jarvis?.contextManager?.getCurrentPersona?.()) || 'balanced';
          const ackPhrases = [
            'Yes, sir? How may I assist you?',
            'At your service, sir. I am listening.',
            'Online and listening, sir.',
            'Yes, sir?'
          ];
          const ackText = ackPhrases[Math.floor(Math.random() * ackPhrases.length)];

          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('jarvis:response', {
              text: ackText,
              intent: 'wake_acknowledgment',
              persona: currentPersona
            });
            mainWindow.webContents.send('jarvis:voiceResponse', {
              text: ackText,
              intent: 'wake_acknowledgment',
              persona: currentPersona
            });
          }

          if (jarvis.audioInterface.voiceOutput) {
            await jarvis.audioInterface.speakAsync(ackText);
          }

          jarvis.audioInterface.setState('listening');
          return;
        }

        if (!commandText) {
          console.log('[Electron:Voice] No command text extracted, skipping.');
          return;
        }

        // Transition to processing state
        jarvis.audioInterface.setState('processing');
        await handleUserMessage(commandText);
      });

      // Audio level stream → renderer HUD real-time audio meter
      jarvis.audioInterface.on('audioLevel', (data) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('jarvis:audioLevel', data);
        }
      });

      // Diagnostic events → console log + renderer HUD
      jarvis.audioInterface.on('speechDetected', (data) => {
        console.log(`[Electron:Mic] Speech audio detected: ${data.raw}`);
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('jarvis:voiceDiag', { type: 'detected', data });
        }
      });

      jarvis.audioInterface.on('hypothesis', (data) => {
        console.log(`[Electron:Mic] Hypothesis: "${data.text}" (conf=${data.confidence})`);
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('jarvis:voiceDiag', { type: 'hypothesis', data });
        }
      });

      jarvis.audioInterface.on('rejected', (data) => {
        console.log(`[Electron:Mic] Rejected: ${data.raw} (speech heard but not matched)`);
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('jarvis:voiceDiag', { type: 'rejected', data });
        }
      });

      jarvis.audioInterface.on('lowConfidence', (data) => {
        console.log(`[Electron:Mic] Low confidence (${data.confidence} < ${data.minConfidence}): "${data.text}"`);
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('jarvis:voiceDiag', { type: 'lowConfidence', data });
        }
      });

      jarvis.audioInterface.on('info', (data) => {
        console.log(`[Electron:Speech] ${data.message}`);
      });

      jarvis.audioInterface.on('audioError', (err) => {
        console.error(`[Electron:Mic] Error: ${err.message || err}`);
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('jarvis:voiceDiag', { type: 'error', data: { message: err.message || String(err) } });
        }
      });

      // Start live microphone speech recognition
      try {
        const listenStarted = await jarvis.audioInterface.startListening();
        if (listenStarted) {
          console.log('[Electron] Voice listening started — microphone is live.');
        } else {
          console.warn('[Electron] startListening() returned false — mic may be unavailable.');
        }
      } catch (listenErr) {
        console.error('[Electron] Failed to start voice listening:', listenErr.message);
      }
    } else {
      console.warn('[Electron:Voice] No audioInterface available — voice input will not function.');
    }

    console.log('[Electron] JARVIS Orchestrator initialized successfully.');
  } catch (err) {
    console.error('[Electron] Failed to initialize JARVIS Orchestrator:', err);
  }
}

// Setup IPC Handlers
function setupIpc() {
  // 1. Send text message (StreamSpeechBuffer invoked inside handleUserMessage)
  ipcMain.handle('jarvis:sendMessage', async (event, text) => {
    return handleUserMessage(text);
  });

  // 2. Push-to-Talk Trigger
  ipcMain.handle('jarvis:triggerPtt', async () => {
    if (jarvis && jarvis.audioInterface) {
      jarvis.audioInterface.triggerPtt();
      return true;
    }
    return false;
  });

  // 2b. Transcribe audio recording via Faster-Whisper (Hybrid Neural STT)
  ipcMain.handle('jarvis:transcribeAudio', async (event, buffer) => {
    try {
      console.log('[Electron:Whisper] Transcribing audio buffer via Faster-Whisper...');
      const { WhisperBridge } = await import('../src/whisper-bridge.js');
      const bridge = new WhisperBridge();
      const result = await bridge.transcribeBuffer(buffer);
      console.log(`[Electron:Whisper] Result: "${result.text}" (latency: ${result.latency_ms}ms)`);
      if (result.text && result.text.trim()) {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('jarvis:voiceUserMessage', { text: result.text, confidence: 0.96 });
        }
        await handleUserMessage(result.text);
      }
      return result;
    } catch (err) {
      console.error('[Electron:Whisper] Error:', err.message);
      return { text: '', error: err.message };
    }
  });

  // 3. Stop Speaking / Interrupt TTS (Part 3.2)
  ipcMain.handle('jarvis:stopSpeaking', async () => {
    if (jarvis && jarvis.audioInterface && typeof jarvis.audioInterface.stopSpeaking === 'function') {
      jarvis.audioInterface.stopSpeaking();
      return true;
    }
    return false;
  });

  // 4. Confirm Destructive Action
  ipcMain.handle('jarvis:confirmAction', async (event, confirmed) => {
    if (!jarvis || !jarvis.actionBridge) return { success: false, response: 'Action bridge unavailable.' };

    const result = await jarvis.actionBridge.resolvePendingConfirmation(confirmed);
    if (result && result.response && jarvis.audioInterface) {
      await jarvis.audioInterface.speakAsync(result.response);
    }
    return result;
  });

  // 5. System Status Query (Part 1.2)
  ipcMain.handle('jarvis:getStatus', async () => ({
    ready: !!jarvis,
    persona: (typeof jarvis?.getCurrentPersona === 'function' ? jarvis.getCurrentPersona() : jarvis?.responseGenerator?.personality?.name) || 'balanced',
    audioState: jarvis?.audioInterface?.state || 'idle',
    voiceEnabled: jarvis?.audioInterface?.voiceOutput ?? true,
    listening: jarvis?.audioInterface?.state === 'listening',
    hasPendingAction: jarvis?.actionBridge?.hasPendingConfirmation() ?? false
  }));

  // 6. Window Control Commands (minimize, close/hide)
  ipcMain.on('window:minimize', () => {
    if (mainWindow) mainWindow.minimize();
  });

  ipcMain.on('window:hide', () => {
    if (mainWindow) mainWindow.hide();
  });
}

// Verified Startup Status broadcast
async function sendStartupStatus() {
  let llmHealthy = false;
  if (jarvis && typeof jarvis.waitForLLM === 'function') {
    try {
      llmHealthy = await jarvis.waitForLLM(15000);
    } catch (_) {}
  } else if (jarvis && jarvis.llmEngine && typeof jarvis.llmEngine.checkLiveness === 'function') {
    try {
      const liveness = await jarvis.llmEngine.checkLiveness(4000);
      llmHealthy = Boolean(liveness && liveness.healthy);
    } catch (_) {}
  }

  const statusText = llmHealthy
    ? "Online and fully operational, Sir. All core systems verified active."
    : "Online, Sir — though my language engine isn't responding yet. Basic commands and system controls are still available.";

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('jarvis:welcome', { text: statusText, llmHealthy });
  }
  if (jarvis && jarvis.audioInterface && jarvis.audioInterface.voiceOutput) {
    await jarvis.audioInterface.speakAsync(statusText);
  }
}

// App Lifecycle
app.whenReady().then(async () => {
  createWindow();
  createTray();
  registerShortcuts();
  setupIpc();
  await initJarvis();
  await sendStartupStatus();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    } else if (mainWindow) {
      mainWindow.show();
    }
  });
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  if (jarvis && typeof jarvis.shutdown === 'function') {
    jarvis.shutdown();
  }
});
