/**
 * JARVIS HUD — Renderer Conversation Dashboard Logic
 * 
 * Provides:
 * - Real-time zero-latency hardware vocal waveform & vocal length equalizer (Web Audio API)
 * - Seamless fallback & integration with backend PowerShell speech engine telemetry
 * - Authoritative state machine: IDLE -> LISTENING -> PROCESSING -> SPEAKING -> IDLE
 * - Rich conversation stream with voice confidence badges and streaming token rendering
 * - Push-to-Talk, interrupt/stop speaking, and destructive action confirmation gates
 */

document.addEventListener('DOMContentLoaded', async () => {
  // DOM References: Controls & Badges
  const minimizeBtn = document.getElementById('minimizeBtn');
  const closeBtn = document.getElementById('closeBtn');
  const personaBadge = document.getElementById('personaBadge');
  const audioBadge = document.getElementById('audioBadge');
  const micStatusText = document.getElementById('micStatusText');
  const micHardwareBadge = document.getElementById('micHardwareBadge');

  // Error Banner
  const hudErrorBanner = document.getElementById('hudErrorBanner');
  const hudErrorText = document.getElementById('hudErrorText');
  const dismissErrorBtn = document.getElementById('dismissErrorBtn');

  // Hero / Arc Reactor
  const reactorCore = document.getElementById('reactorCore');
  const reactorStatusText = document.getElementById('reactorStatusText');

  // Vocal Monitor & Spectrum
  const vocalBars = document.querySelectorAll('.vocal-bar');
  const vocalGaugeFill = document.getElementById('vocalGaugeFill');
  const micLevelText = document.getElementById('micLevelText');
  const confidenceLabel = document.getElementById('confidenceLabel');
  const confidenceText = document.getElementById('confidenceText');
  const voiceStatusPill = document.getElementById('voiceStatusPill');
  const voiceStatusText = document.getElementById('voiceStatusText');
  const speechSubtext = document.getElementById('speechSubtext');

  // Conversation Stream
  const chatStream = document.getElementById('chatStream');

  // Footer Controls
  const messageInput = document.getElementById('messageInput');
  const sendBtn = document.getElementById('sendBtn');
  const pttBtn = document.getElementById('pttBtn');
  const stopBtn = document.getElementById('stopBtn');

  // Modal Elements
  const actionModal = document.getElementById('actionModal');
  const actionWarningText = document.getElementById('actionWarningText');
  const actionTargetName = document.getElementById('actionTargetName');
  const confirmActionBtn = document.getElementById('confirmActionBtn');
  const cancelActionBtn = document.getElementById('cancelActionBtn');

  // State
  let currentAssistantMsgBody = null;
  let currentAudioState = 'idle';
  let speechStatusTimeout = null;

  // Window Controls
  if (minimizeBtn) {
    minimizeBtn.addEventListener('click', () => {
      if (window.jarvisAPI) window.jarvisAPI.minimizeWindow();
    });
  }

  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      if (window.jarvisAPI) window.jarvisAPI.hideWindow();
    });
  }

  // Error Banner
  function showBannerError(message) {
    if (!hudErrorBanner) return;
    hudErrorText.textContent = message;
    hudErrorBanner.classList.remove('hidden');
  }

  function clearBannerError() {
    if (!hudErrorBanner) return;
    hudErrorBanner.classList.add('hidden');
  }

  if (dismissErrorBtn) {
    dismissErrorBtn.addEventListener('click', clearBannerError);
  }

  // ==========================================================================
  // Real-time Vocal Spectrum Visualizer (Web Audio API + Engine Fallback)
  // ==========================================================================
  let audioContext = null;
  let analyserNode = null;
  let micMediaStream = null;
  let isHardwareMicActive = false;

  async function initWebAudioMic() {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        return;
      }
      micMediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: false,
          autoGainControl: true
        }
      });

      audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const source = audioContext.createMediaStreamSource(micMediaStream);
      analyserNode = audioContext.createAnalyser();
      analyserNode.fftSize = 64;
      analyserNode.smoothingTimeConstant = 0.75;
      source.connect(analyserNode);

      isHardwareMicActive = true;
      if (micStatusText) micStatusText.textContent = 'MIC LIVE';
      if (micHardwareBadge) micHardwareBadge.style.opacity = '1';

      renderHardwareSpectrum();
    } catch (err) {
      console.warn('[HUD] Web Audio hardware mic capture unavailable, using backend stream:', err.message);
      isHardwareMicActive = false;
      if (micStatusText) micStatusText.textContent = 'MIC ENGINE';
    }
  }

  function renderHardwareSpectrum() {
    if (!isHardwareMicActive || !analyserNode) return;

    const dataArray = new Uint8Array(analyserNode.frequencyBinCount);
    analyserNode.getByteFrequencyData(dataArray);

    // Calculate RMS/volume
    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      sum += dataArray[i];
    }
    const avg = sum / dataArray.length;
    const volPct = Math.min(100, Math.round((avg / 128) * 100));

    // Update gauge and labels if speaking or listening
    if (currentAudioState !== 'speaking' && currentAudioState !== 'processing') {
      updateVocalVisuals(volPct, dataArray);
    }

    requestAnimationFrame(renderHardwareSpectrum);
  }

  // Update visual vocal bars and level gauge
  function updateVocalVisuals(levelPct, freqArray = null) {
    const lvl = Math.max(0, Math.min(100, levelPct || 0));

    if (micLevelText) {
      micLevelText.textContent = `${lvl}%`;
    }
    if (vocalGaugeFill) {
      vocalGaugeFill.style.width = `${lvl}%`;
    }

    const barCount = vocalBars.length;
    if (barCount === 0) return;

    if (freqArray && freqArray.length > 0) {
      // Map frequency bins to bars
      const step = Math.floor(freqArray.length / barCount) || 1;
      vocalBars.forEach((bar, i) => {
        const binVal = freqArray[i * step] || 0;
        const norm = binVal / 255;
        // Vocal length height: 4px min up to 40px max
        const height = Math.max(4, Math.round(norm * 38));
        bar.style.height = `${height}px`;
        if (norm > 0.15) {
          bar.classList.add('active');
        } else {
          bar.classList.remove('active');
        }
      });
    } else {
      // Synthetic vocal wave based on scalar level
      vocalBars.forEach((bar, i) => {
        const centerDistance = Math.abs(i - barCount / 2) / (barCount / 2);
        const curve = 1 - (centerDistance * 0.45);
        const height = Math.max(4, Math.round((lvl / 100) * 36 * curve));
        bar.style.height = `${height}px`;
        if (lvl > 10) {
          bar.classList.add('active');
        } else {
          bar.classList.remove('active');
        }
      });
    }

    // Dynamic reactive glow on arc reactor
    if (reactorCore && (currentAudioState === 'idle' || currentAudioState === 'listening')) {
      if (lvl > 15) {
        const glowRadius = Math.round(15 + (lvl / 100) * 35);
        reactorCore.style.boxShadow = `0 0 ${glowRadius}px rgba(0, 229, 255, 0.7), inset 0 0 15px rgba(0, 229, 255, 0.4)`;
      } else {
        reactorCore.style.boxShadow = '';
      }
    }

    // Voice Activity Detection: Auto-detect speech and natural pauses
    if (lvl >= 15 && currentAudioState !== 'speaking' && currentAudioState !== 'processing') {
      if (!isRecordingTurn) {
        startVoiceTurnRecording('vad_energy');
      }
      hasVoicedEnergy = true;
      clearTimeout(silenceTimeout);
      silenceTimeout = setTimeout(() => {
        if (isRecordingTurn && hasVoicedEnergy) {
          console.log('[HUD:VAD] Natural speech pause detected, dispatching to Faster-Whisper...');
          stopVoiceTurnRecording();
        }
      }, 1200);
    }
  }

  // Attempt Web Audio API microphone initialization on startup
  initWebAudioMic();

  // ==========================================================================
  // Hybrid Speech: Conversational Audio Recording & Faster-Whisper Pipeline
  // ==========================================================================
  let mediaRecorder = null;
  let audioChunks = [];
  let isRecordingTurn = false;
  let silenceTimeout = null;
  let speechStartTime = 0;
  let hasVoicedEnergy = false;

  function startVoiceTurnRecording(reason = 'vad') {
    if (!micMediaStream || isRecordingTurn) return;
    if (currentAudioState === 'speaking' || currentAudioState === 'processing') return;

    try {
      audioChunks = [];
      hasVoicedEnergy = (reason === 'ptt');
      speechStartTime = Date.now();

      const mime = (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) ? 'audio/webm;codecs=opus' : 'audio/webm';
      mediaRecorder = new MediaRecorder(micMediaStream, { mimeType: mime });

      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunks.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const totalDuration = Date.now() - speechStartTime;
        if (audioChunks.length === 0 || totalDuration < 450) {
          audioChunks = [];
          return;
        }

        const blob = new Blob(audioChunks, { type: mime });
        audioChunks = [];

        if (blob.size >= 800) {
          const arrayBuffer = await blob.arrayBuffer();
          setVoiceStatus('TRANSCRIBING (FASTER-WHISPER)...', 'active');
          if (speechSubtext) speechSubtext.textContent = 'Transcribing voice via Faster-Whisper...';

          if (window.jarvisAPI && typeof window.jarvisAPI.transcribeAudio === 'function') {
            try {
              updateAudioState('processing');
              await window.jarvisAPI.transcribeAudio(arrayBuffer);
            } catch (err) {
              console.error('[HUD:Whisper] Transcribe error:', err.message);
              updateAudioState('idle');
            }
          }
        }
      };

      mediaRecorder.start(100);
      isRecordingTurn = true;
      setVoiceStatus('🎙️ RECORDING VOICE • SPEAK NOW', 'active');
      console.log(`[HUD:Whisper] Voice turn recording started (${reason})...`);
    } catch (err) {
      console.warn('[HUD:Whisper] MediaRecorder initialization notice:', err.message);
    }
  }

  function stopVoiceTurnRecording() {
    clearTimeout(silenceTimeout);
    silenceTimeout = null;
    if (!mediaRecorder || !isRecordingTurn) return;
    try {
      isRecordingTurn = false;
      if (mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
        console.log('[HUD:Whisper] Recording turn concluded, dispatched to Faster-Whisper.');
      }
    } catch (err) {
      console.warn('[HUD:Whisper] Error stopping recorder:', err.message);
    }
  }

  // ==========================================================================
  // Central Authoritative State Machine
  // ==========================================================================
  function updateAudioState(state, message = '') {
    const s = (state || 'idle').toLowerCase();
    currentAudioState = s;

    // 1. Reactor Core Visuals
    if (reactorCore) {
      reactorCore.className = `arc-reactor ${s}`;
    }

    // 2. Audio State Badge
    if (audioBadge) {
      audioBadge.className = `badge badge-audio audio-${s}`;
      audioBadge.textContent = s.toUpperCase();
    }

    // 3. Stop Speaking Button
    if (stopBtn) {
      if (s === 'speaking') {
        stopBtn.classList.remove('hidden');
      } else {
        stopBtn.classList.add('hidden');
      }
    }

    // 4. Input Controls Gating
    if (messageInput) {
      messageInput.disabled = (s === 'processing');
      if (s !== 'processing') messageInput.focus();
    }
    if (sendBtn) {
      sendBtn.disabled = (s === 'processing');
    }

    // 5. PTT Button State
    if (pttBtn) {
      pttBtn.disabled = (s === 'processing');
      if (s === 'listening') {
        pttBtn.classList.add('active');
      } else {
        pttBtn.classList.remove('active');
      }
    }

    // 6. Vocal Monitor Labels & Reactor Text
    switch (s) {
      case 'listening':
        if (reactorStatusText) reactorStatusText.textContent = 'LISTENING';
        if (speechSubtext) speechSubtext.textContent = 'Microphone listening — speak naturally...';
        setVoiceStatus('MIC LISTENING • SPEAK NOW', 'active');
        clearBannerError();
        startVoiceTurnRecording();
        break;

      case 'processing':
        if (reactorStatusText) reactorStatusText.textContent = 'THINKING';
        if (speechSubtext) speechSubtext.textContent = 'Analyzing query & reasoning locally...';
        setVoiceStatus('THINKING • PROCESSING QUERY', 'active');
        stopVoiceTurnRecording();
        break;

      case 'speaking':
        if (reactorStatusText) reactorStatusText.textContent = 'SPEAKING';
        if (speechSubtext) speechSubtext.textContent = 'JARVIS is speaking (click Interrupt to stop)';
        setVoiceStatus('VOCALIZING • TTS ACTIVE', 'hearing');
        stopVoiceTurnRecording();
        // Animate vocal bars during assistant vocalization
        animateSpeakingVocalBars();
        break;

      case 'error':
        if (reactorStatusText) reactorStatusText.textContent = 'ERROR';
        if (speechSubtext) speechSubtext.textContent = message || 'Encountered audio subsystem error.';
        setVoiceStatus('SUBSYSTEM NOTICE', 'idle');
        showBannerError(message || 'Audio subsystem reported an error.');
        stopVoiceTurnRecording();
        break;

      case 'idle':
      default:
        if (reactorStatusText) reactorStatusText.textContent = 'ONLINE';
        if (speechSubtext) speechSubtext.textContent = 'Say "Hey JARVIS" or press Push-to-Talk';
        setVoiceStatus('STANDBY • SAY "HEY JARVIS"', 'idle');
        stopVoiceTurnRecording();
        if (!isHardwareMicActive) {
          updateVocalVisuals(0);
        }
        break;
    }
  }

  function setVoiceStatus(text, mode = 'idle') {
    if (!voiceStatusPill || !voiceStatusText) return;
    voiceStatusText.textContent = text;
    voiceStatusPill.className = `voice-status-pill ${mode}`;
  }

  function animateSpeakingVocalBars() {
    if (currentAudioState !== 'speaking') return;
    vocalBars.forEach((bar, i) => {
      const h = Math.floor(Math.random() * 28) + 8;
      bar.style.height = `${h}px`;
      bar.classList.add('active');
    });
    if (vocalGaugeFill) vocalGaugeFill.style.width = '65%';
    if (micLevelText) micLevelText.textContent = 'TTS';
  }

  // ==========================================================================
  // Conversation Stream & Message Appending
  // ==========================================================================
  function appendMessage(role, text, options = {}) {
    const placeholder = document.getElementById('startupPlaceholder');
    if (placeholder) placeholder.remove();

    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${role}`;
    if (options.isVoice) msgDiv.classList.add('voice-msg');

    const headerDiv = document.createElement('div');
    headerDiv.className = 'msg-header';

    const nameSpan = document.createElement('span');
    nameSpan.className = 'speaker-name';
    if (role === 'user') {
      nameSpan.textContent = options.isVoice ? '🎤 YOU (VOICE)' : 'YOU';
    } else {
      nameSpan.textContent = 'JARVIS';
    }
    headerDiv.appendChild(nameSpan);

    if (options.confidence) {
      const confSpan = document.createElement('span');
      confSpan.className = 'msg-badge';
      confSpan.textContent = `${Math.round(options.confidence * 100)}% conf`;
      headerDiv.appendChild(confSpan);
    }

    const timeSpan = document.createElement('span');
    timeSpan.className = 'msg-time';
    const now = new Date();
    timeSpan.textContent = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    headerDiv.appendChild(timeSpan);

    const bodyDiv = document.createElement('div');
    bodyDiv.className = 'msg-body';
    bodyDiv.textContent = text;

    msgDiv.appendChild(headerDiv);
    msgDiv.appendChild(bodyDiv);

    chatStream.appendChild(msgDiv);
    chatStream.scrollTop = chatStream.scrollHeight;

    return bodyDiv;
  }

  // Send message handler (Typed Input)
  async function handleSend() {
    const text = messageInput.value.trim();
    if (!text || !window.jarvisAPI || currentAudioState === 'processing') return;

    messageInput.value = '';
    appendMessage('user', text, { isVoice: false });

    updateAudioState('processing');
    currentAssistantMsgBody = null;

    try {
      const result = await window.jarvisAPI.sendMessage(text);
      if (result && result.text) {
        if (!currentAssistantMsgBody) {
          appendMessage('assistant', result.text);
        } else {
          currentAssistantMsgBody.textContent = result.text;
        }
      }
      if (result && result.persona && personaBadge) {
        personaBadge.textContent = result.persona.toUpperCase();
      }
    } catch (err) {
      appendMessage('assistant', `Encountered an issue: ${err.message}`);
      updateAudioState('error', err.message);
    } finally {
      currentAssistantMsgBody = null;
      try {
        const currentStatus = await window.jarvisAPI.getStatus();
        if (currentStatus && currentStatus.audioState) {
          updateAudioState(currentStatus.audioState);
        } else {
          updateAudioState('idle');
        }
      } catch (_) {
        updateAudioState('idle');
      }
    }
  }

  sendBtn.addEventListener('click', handleSend);
  messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleSend();
  });

  // Push-to-Talk Button (Click to speak, click again or release to transcribe via Faster-Whisper)
  pttBtn.addEventListener('click', async () => {
    if (!window.jarvisAPI || currentAudioState === 'processing') return;

    if (isRecordingTurn || currentAudioState === 'listening') {
      // User concluded speaking turn
      updateAudioState('processing');
      stopVoiceTurnRecording();
    } else {
      // User initiates speech turn
      updateAudioState('listening');
      startVoiceTurnRecording();
      await window.jarvisAPI.triggerPtt();
    }
  });

  // Interrupt / Stop Speaking Button
  if (stopBtn) {
    stopBtn.addEventListener('click', async () => {
      if (window.jarvisAPI) {
        await window.jarvisAPI.stopSpeaking();
        updateAudioState('idle');
      }
    });
  }

  // Suggestion chips
  document.querySelectorAll('.voice-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const cmd = chip.getAttribute('data-cmd');
      if (cmd && currentAudioState !== 'processing') {
        messageInput.value = cmd;
        handleSend();
      }
    });
  });

  // Action Confirmation Modal
  confirmActionBtn.addEventListener('click', async () => {
    actionModal.classList.add('hidden');
    if (window.jarvisAPI) {
      const res = await window.jarvisAPI.confirmAction(true);
      if (res && res.response) appendMessage('assistant', res.response);
    }
  });

  cancelActionBtn.addEventListener('click', async () => {
    actionModal.classList.add('hidden');
    if (window.jarvisAPI) {
      const res = await window.jarvisAPI.confirmAction(false);
      if (res && res.response) appendMessage('assistant', res.response);
    }
  });

  // ==========================================================================
  // IPC Event Subscriptions
  // ==========================================================================
  if (window.jarvisAPI) {
    // 0. Verified Startup Welcome Status
    if (typeof window.jarvisAPI.onWelcome === 'function') {
      window.jarvisAPI.onWelcome(({ text, llmHealthy }) => {
        const placeholder = document.getElementById('startupPlaceholder');
        if (placeholder) placeholder.remove();
        appendMessage('assistant', text);
        if (!llmHealthy) {
          if (personaBadge) personaBadge.textContent = 'BASIC';
          showBannerError('Language engine offline. System control commands active.');
        }
      });
    }

    // 1. Audio state updates
    window.jarvisAPI.onAudioState(({ state }) => {
      updateAudioState(state);
    });

    // 2. Transcribed voice caption
    window.jarvisAPI.onVoiceHeard(({ transcript }) => {
      if (transcript) {
        if (speechSubtext) speechSubtext.textContent = `Heard: "${transcript}"`;
        setVoiceStatus(`HEARD: "${transcript}"`, 'hearing');
      }
    });

    // 3. Streamed token updates
    window.jarvisAPI.onStreamToken(({ token }) => {
      if (!currentAssistantMsgBody) {
        currentAssistantMsgBody = appendMessage('assistant', token);
      } else {
        currentAssistantMsgBody.textContent += token;
        chatStream.scrollTop = chatStream.scrollHeight;
      }
    });

    // 4. Pending destructive action modal
    window.jarvisAPI.onActionPending(({ action, warning }) => {
      actionTargetName.textContent = action || 'system action';
      actionWarningText.textContent = warning || 'This action modifies critical system state. Proceed, sir?';
      actionModal.classList.remove('hidden');
    });

    // 5. Voice-originated user message
    if (typeof window.jarvisAPI.onVoiceUserMessage === 'function') {
      window.jarvisAPI.onVoiceUserMessage(({ text, confidence }) => {
        if (text) {
          appendMessage('user', text, { isVoice: true, confidence });
          updateAudioState('processing');
          currentAssistantMsgBody = null;
        }
      });
    }

    // 6. Assistant Response
    const handleIncomingResponse = ({ text, persona }) => {
      if (text) {
        if (!currentAssistantMsgBody) {
          appendMessage('assistant', text);
        } else {
          currentAssistantMsgBody.textContent = text;
        }
        currentAssistantMsgBody = null;
      }
      if (persona && personaBadge) {
        personaBadge.textContent = persona.toUpperCase();
      }
    };

    if (typeof window.jarvisAPI.onResponse === 'function') {
      window.jarvisAPI.onResponse(handleIncomingResponse);
    } else if (typeof window.jarvisAPI.onVoiceResponse === 'function') {
      window.jarvisAPI.onVoiceResponse(handleIncomingResponse);
    }

    // 7. Voice diagnostic events
    if (typeof window.jarvisAPI.onVoiceDiag === 'function') {
      window.jarvisAPI.onVoiceDiag(({ type, data }) => {
        switch (type) {
          case 'detected':
            setVoiceStatus('🎙️ VOCAL ENERGY DETECTED • CAPTURING...', 'active');
            if (speechSubtext) speechSubtext.textContent = 'Microphone capturing speech energy...';
            break;

          case 'hypothesis':
            setVoiceStatus(`💬 HEARING: "${data.text}"`, 'hearing');
            if (speechSubtext) speechSubtext.textContent = `Interim: "${data.text}"`;
            if (confidenceLabel && confidenceText && data.confidence) {
              confidenceLabel.classList.remove('hidden');
              confidenceText.textContent = `${Math.round(data.confidence * 100)}%`;
            }
            break;

          case 'rejected':
            setVoiceStatus('🟡 AUDIO HEARD BUT NOT RECOGNIZED', 'idle');
            if (speechSubtext) speechSubtext.textContent = 'Audio was below recognition threshold — speak closer or clearer';
            break;

          case 'lowConfidence':
            setVoiceStatus(`⚠️ LOW CONFIDENCE (${Math.round((data.confidence || 0) * 100)}%)`, 'idle');
            break;

          case 'error':
            setVoiceStatus('❌ MIC ERROR', 'idle');
            updateAudioState('error', data.message);
            break;
        }

        clearTimeout(speechStatusTimeout);
        speechStatusTimeout = setTimeout(() => {
          if (currentAudioState === 'idle') {
            setVoiceStatus('STANDBY • SAY "HEY JARVIS"', 'idle');
            if (confidenceLabel) confidenceLabel.classList.add('hidden');
          }
        }, 4000);
      });
    }

    // 8. Backend Audio Level telemetry fallback / augmentation
    if (typeof window.jarvisAPI.onAudioLevel === 'function') {
      window.jarvisAPI.onAudioLevel(({ level }) => {
        // If Web Audio API hardware mic is not active, use engine telemetry
        if (!isHardwareMicActive && currentAudioState !== 'speaking') {
          updateVocalVisuals(level || 0);
        }
      });
    }

    // Initial status check
    try {
      const status = await window.jarvisAPI.getStatus();
      if (status) {
        if (status.persona && personaBadge) personaBadge.textContent = status.persona.toUpperCase();
        if (status.audioState) updateAudioState(status.audioState);
      }
    } catch (_) {}
  }
});
