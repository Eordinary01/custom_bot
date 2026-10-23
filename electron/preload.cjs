/**
 * JARVIS Conversational AI - Electron Preload Script
 * 
 * Strict Security Architecture:
 * - contextIsolation: true
 * - nodeIntegration: false
 * - Whitelisted IPC APIs only (zero raw ipcRenderer exposure)
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('jarvisAPI', {
  // Commands
  sendMessage: (text) => ipcRenderer.invoke('jarvis:sendMessage', text),
  triggerPtt: () => ipcRenderer.invoke('jarvis:triggerPtt'),
  transcribeAudio: (buffer) => ipcRenderer.invoke('jarvis:transcribeAudio', buffer),
  stopSpeaking: () => ipcRenderer.invoke('jarvis:stopSpeaking'),
  confirmAction: (confirmed) => ipcRenderer.invoke('jarvis:confirmAction', confirmed),
  getStatus: () => ipcRenderer.invoke('jarvis:getStatus'),

  // Window Controls
  minimizeWindow: () => ipcRenderer.send('window:minimize'),
  hideWindow: () => ipcRenderer.send('window:hide'),

  // Event Listeners (with unregister functions)
  onAudioState: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('jarvis:audioState', subscription);
    return () => ipcRenderer.removeListener('jarvis:audioState', subscription);
  },

  onVoiceHeard: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('jarvis:voiceHeard', subscription);
    return () => ipcRenderer.removeListener('jarvis:voiceHeard', subscription);
  },

  onStreamToken: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('jarvis:streamToken', subscription);
    return () => ipcRenderer.removeListener('jarvis:streamToken', subscription);
  },

  onResponse: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('jarvis:response', subscription);
    return () => ipcRenderer.removeListener('jarvis:response', subscription);
  },

  onActionPending: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('jarvis:actionPending', subscription);
    return () => ipcRenderer.removeListener('jarvis:actionPending', subscription);
  },

  onWelcome: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('jarvis:welcome', subscription);
    return () => ipcRenderer.removeListener('jarvis:welcome', subscription);
  },

  onVoiceUserMessage: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('jarvis:voiceUserMessage', subscription);
    return () => ipcRenderer.removeListener('jarvis:voiceUserMessage', subscription);
  },

  onVoiceResponse: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('jarvis:voiceResponse', subscription);
    return () => ipcRenderer.removeListener('jarvis:voiceResponse', subscription);
  },

  onVoiceDiag: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('jarvis:voiceDiag', subscription);
    return () => ipcRenderer.removeListener('jarvis:voiceDiag', subscription);
  },

  onAudioLevel: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('jarvis:audioLevel', subscription);
    return () => ipcRenderer.removeListener('jarvis:audioLevel', subscription);
  }
});
