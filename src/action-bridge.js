/**
 * JARVIS Conversational AI - Action Executor Bridge
 * 
 * Bridges natural language understanding with the 60+ local system actions in Executor.
 * Provides semantic action matching, ambiguous intent clarification,
 * LLM-based action extraction fallback, safe execution, and hybrid execution sequencing.
 * 
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 8.4
 */

import Executor from '../executor.js';
import CommandRouter from '../commandRouter.js';
import { FastIntentMatcher } from './intent-classifier.js';
import { buildActionExtractionPrompt, SAMPLING_PRESETS, cleanResponse } from './prompt-templates.js';

/**
 * All 60 valid action codes supported by Executor
 */
export const VALID_ACTIONS = new Set([
  // Applications (31)
  'open_chrome', 'open_notepad', 'open_calculator', 'open_explorer',
  'open_settings', 'open_cmd', 'open_powershell', 'open_taskmanager',
  'open_control_panel', 'open_outlook', 'open_gmail', 'open_discord',
  'open_teams', 'open_whatsapp', 'open_facebook', 'open_twitter',
  'open_instagram', 'open_linkedin', 'open_reddit', 'open_youtube',
  'open_google', 'open_netflix', 'open_spotify', 'open_prime',
  'open_steam', 'open_word', 'open_excel', 'open_powerpoint',
  'open_paint', 'open_vscode', 'open_github',

  // System & Window Controls (19)
  'volume_up', 'volume_down', 'mute', 'volume_app_up', 'volume_app_down', 'get_volume', 'get_brightness',
  'lock', 'sleep', 'shutdown', 'restart',
  'maximize', 'minimize', 'switch_tab', 'previous_tab',
  'close_chrome', 'close_notepad', 'close_app', 'set_volume',
  'youtube_play_pause', 'youtube_next', 'youtube_mute', 'visual_context',

  // Files & Directories (6)
  'open_downloads', 'open_documents', 'open_desktop', 'open_pictures',
  'create_file', 'create_folder', 'delete_file',

  // Assistant & Utilities (10)
  'greeting', 'time', 'date', 'write_email', 'joke', 'thanks',
  'test_speech', 'sleep_assistant', 'repeat', 'help'
]);

/**
 * Destructive system actions requiring explicit confirmation (Priority 0)
 */
export const DESTRUCTIVE_ACTIONS = new Set(['shutdown', 'restart', 'delete_file']);

/**
 * Action Categories
 */
export const ACTION_CATEGORIES = {
  APPLICATION: 'application',
  SYSTEM: 'system',
  FILES: 'files',
  ASSISTANT: 'assistant'
};

/**
 * Metadata and semantic mapping dictionary for all 60 actions.
 * Contains labels, default responses, natural patterns, keywords, and suggested alternatives on failure.
 */
export const ACTION_METADATA = {
  // Applications
  open_chrome: {
    label: 'Google Chrome',
    category: ACTION_CATEGORIES.APPLICATION,
    defaultResponse: 'Opening Chrome',
    patterns: ['open chrome', 'start chrome', 'launch chrome', 'browse the web', 'surf the internet', 'open google chrome', 'open browser', 'launch browser', 'fire up chrome'],
    keywords: ['chrome', 'google chrome', 'browser', 'web', 'internet'],
    alternatives: ['open_google', 'open_explorer']
  },
  open_notepad: {
    label: 'Notepad',
    category: ACTION_CATEGORIES.APPLICATION,
    defaultResponse: 'Opening Notepad',
    patterns: ['open notepad', 'start notepad', 'launch notepad', 'take notes', 'open text editor', 'note pad', 'start note pad', 'fire up notepad'],
    keywords: ['notepad', 'notes', 'text editor'],
    alternatives: ['create_file', 'open_word']
  },
  open_calculator: {
    label: 'Calculator',
    category: ACTION_CATEGORIES.APPLICATION,
    defaultResponse: 'Opening Calculator',
    patterns: ['open calculator', 'start calculator', 'launch calculator', 'calculator', 'calc', 'open calc', 'math app', 'calculate something'],
    keywords: ['calculator', 'calc', 'math'],
    alternatives: ['open_excel']
  },
  open_explorer: {
    label: 'File Explorer',
    category: ACTION_CATEGORIES.APPLICATION,
    defaultResponse: 'Opening File Explorer',
    patterns: ['open file explorer', 'file explorer', 'files', 'open explorer', 'browse files', 'view files', 'open files', 'file manager'],
    keywords: ['explorer', 'files', 'file explorer', 'directories'],
    alternatives: ['open_documents', 'open_downloads']
  },
  open_settings: {
    label: 'Windows Settings',
    category: ACTION_CATEGORIES.APPLICATION,
    defaultResponse: 'Opening Settings',
    patterns: ['open settings', 'settings', 'system settings', 'pc settings', 'windows settings', 'preferences', 'configuration'],
    keywords: ['settings', 'preferences', 'configuration'],
    alternatives: ['open_control_panel']
  },
  open_cmd: {
    label: 'Command Prompt',
    category: ACTION_CATEGORIES.APPLICATION,
    defaultResponse: 'Opening Command Prompt',
    patterns: ['open command prompt', 'command prompt', 'cmd', 'open cmd', 'terminal', 'dos prompt', 'start cmd'],
    keywords: ['cmd', 'command prompt', 'dos'],
    alternatives: ['open_powershell']
  },
  open_powershell: {
    label: 'PowerShell',
    category: ACTION_CATEGORIES.APPLICATION,
    defaultResponse: 'Opening PowerShell',
    patterns: ['open powershell', 'powershell', 'start powershell', 'launch powershell', 'ps terminal', 'open posix'],
    keywords: ['powershell', 'terminal'],
    alternatives: ['open_cmd']
  },
  open_taskmanager: {
    label: 'Task Manager',
    category: ACTION_CATEGORIES.APPLICATION,
    defaultResponse: 'Opening Task Manager',
    patterns: ['task manager', 'open task manager', 'start task manager', 'show processes', 'kill processes', 'system monitor', 'taskmgr'],
    keywords: ['task manager', 'processes', 'taskmgr'],
    alternatives: ['open_settings']
  },
  open_control_panel: {
    label: 'Control Panel',
    category: ACTION_CATEGORIES.APPLICATION,
    defaultResponse: 'Opening Control Panel',
    patterns: ['open control panel', 'control panel', 'start control panel', 'classic settings', 'admin panel'],
    keywords: ['control panel', 'admin panel'],
    alternatives: ['open_settings']
  },
  open_outlook: {
    label: 'Outlook',
    category: ACTION_CATEGORIES.APPLICATION,
    defaultResponse: 'Opening Outlook',
    patterns: ['open outlook', 'start outlook', 'launch outlook', 'ms outlook', 'microsoft outlook', 'work email'],
    keywords: ['outlook', 'ms outlook'],
    alternatives: ['open_gmail', 'write_email']
  },
  open_gmail: {
    label: 'Gmail',
    category: ACTION_CATEGORIES.APPLICATION,
    defaultResponse: 'Opening Gmail',
    patterns: ['open gmail', 'start gmail', 'google mail', 'check gmail', 'web mail', 'my gmail'],
    keywords: ['gmail', 'google mail'],
    alternatives: ['open_outlook', 'open_chrome']
  },
  open_discord: {
    label: 'Discord',
    category: ACTION_CATEGORIES.APPLICATION,
    defaultResponse: 'Opening Discord',
    patterns: ['open discord', 'start discord', 'launch discord', 'discord app', 'chat server', 'open chat'],
    keywords: ['discord', 'chat'],
    alternatives: ['open_teams', 'open_whatsapp']
  },
  open_teams: {
    label: 'Microsoft Teams',
    category: ACTION_CATEGORIES.APPLICATION,
    defaultResponse: 'Opening Teams',
    patterns: ['open teams', 'start teams', 'ms teams', 'microsoft teams', 'meeting app'],
    keywords: ['teams', 'ms teams', 'meetings'],
    alternatives: ['open_discord', 'open_outlook']
  },
  open_whatsapp: {
    label: 'WhatsApp',
    category: ACTION_CATEGORIES.APPLICATION,
    defaultResponse: 'Opening WhatsApp',
    patterns: ['open whatsapp', 'start whatsapp', 'launch whatsapp', 'whatsapp web', 'text messages'],
    keywords: ['whatsapp', 'wa'],
    alternatives: ['open_discord', 'open_teams']
  },
  open_facebook: {
    label: 'Facebook',
    category: ACTION_CATEGORIES.APPLICATION,
    defaultResponse: 'Opening Facebook',
    patterns: ['open facebook', 'start facebook', 'fb', 'check facebook', 'meta'],
    keywords: ['facebook', 'fb'],
    alternatives: ['open_instagram', 'open_twitter']
  },
  open_twitter: {
    label: 'Twitter / X',
    category: ACTION_CATEGORIES.APPLICATION,
    defaultResponse: 'Opening Twitter',
    patterns: ['open twitter', 'start twitter', 'twitter', 'open x', 'check twitter', 'tweets'],
    keywords: ['twitter', 'tweets'],
    alternatives: ['open_reddit', 'open_facebook']
  },
  open_instagram: {
    label: 'Instagram',
    category: ACTION_CATEGORIES.APPLICATION,
    defaultResponse: 'Opening Instagram',
    patterns: ['open instagram', 'start instagram', 'insta', 'open insta', 'ig', 'check insta'],
    keywords: ['instagram', 'insta', 'ig'],
    alternatives: ['open_facebook', 'open_pictures']
  },
  open_linkedin: {
    label: 'LinkedIn',
    category: ACTION_CATEGORIES.APPLICATION,
    defaultResponse: 'Opening LinkedIn',
    patterns: ['open linkedin', 'start linkedin', 'linkedin', 'check linkedin', 'professional network'],
    keywords: ['linkedin', 'jobs', 'network'],
    alternatives: ['open_twitter']
  },
  open_reddit: {
    label: 'Reddit',
    category: ACTION_CATEGORIES.APPLICATION,
    defaultResponse: 'Opening Reddit',
    patterns: ['open reddit', 'start reddit', 'reddit', 'browse reddit', 'subreddit'],
    keywords: ['reddit', 'subreddits'],
    alternatives: ['open_twitter', 'open_chrome']
  },
  open_youtube: {
    label: 'YouTube',
    category: ACTION_CATEGORIES.APPLICATION,
    defaultResponse: 'Opening YouTube',
    patterns: ['open youtube', 'start youtube', 'youtube', 'watch youtube', 'yt', 'stream video'],
    keywords: ['youtube', 'yt', 'video', 'videos'],
    alternatives: ['open_netflix', 'open_prime']
  },
  open_google: {
    label: 'Google',
    category: ACTION_CATEGORIES.APPLICATION,
    defaultResponse: 'Opening Google',
    patterns: ['open google', 'search google', 'google', 'google search', 'look up on google'],
    keywords: ['google', 'google search'],
    alternatives: ['open_chrome']
  },
  open_netflix: {
    label: 'Netflix',
    category: ACTION_CATEGORIES.APPLICATION,
    defaultResponse: 'Opening Netflix',
    patterns: ['open netflix', 'start netflix', 'netflix', 'watch netflix', 'stream movie', 'watch a movie'],
    keywords: ['netflix', 'movies', 'series'],
    alternatives: ['open_prime', 'open_youtube']
  },
  open_spotify: {
    label: 'Spotify',
    category: ACTION_CATEGORIES.APPLICATION,
    defaultResponse: 'Opening Spotify',
    patterns: ['play music', 'open spotify', 'start spotify', 'spotify', 'listen to music', 'play songs', 'music player', 'tunes'],
    keywords: ['spotify', 'music', 'songs', 'tunes'],
    alternatives: ['open_youtube']
  },
  open_prime: {
    label: 'Amazon Prime Video',
    category: ACTION_CATEGORIES.APPLICATION,
    defaultResponse: 'Opening Prime Video',
    patterns: ['open amazon prime', 'prime video', 'open prime', 'amazon video', 'watch prime', 'amazon prime video'],
    keywords: ['prime video', 'amazon prime', 'prime'],
    alternatives: ['open_netflix', 'open_youtube']
  },
  open_steam: {
    label: 'Steam',
    category: ACTION_CATEGORIES.APPLICATION,
    defaultResponse: 'Opening Steam',
    patterns: ['play game', 'open steam', 'start steam', 'steam', 'launch steam', 'play video games', 'game library', 'steam games'],
    keywords: ['steam', 'games', 'gaming'],
    alternatives: ['open_discord']
  },
  open_word: {
    label: 'Microsoft Word',
    category: ACTION_CATEGORIES.APPLICATION,
    defaultResponse: 'Opening Word',
    patterns: ['open word', 'microsoft word', 'ms word', 'start word', 'launch word', 'word processor', 'write document'],
    keywords: ['word', 'ms word', 'document'],
    alternatives: ['open_notepad', 'open_documents']
  },
  open_excel: {
    label: 'Microsoft Excel',
    category: ACTION_CATEGORIES.APPLICATION,
    defaultResponse: 'Opening Excel',
    patterns: ['open excel', 'microsoft excel', 'ms excel', 'start excel', 'spreadsheet', 'open spreadsheet', 'calc sheet'],
    keywords: ['excel', 'spreadsheet', 'sheets'],
    alternatives: ['open_calculator']
  },
  open_powerpoint: {
    label: 'Microsoft PowerPoint',
    category: ACTION_CATEGORIES.APPLICATION,
    defaultResponse: 'Opening PowerPoint',
    patterns: ['open powerpoint', 'microsoft powerpoint', 'powerpoint', 'ms powerpoint', 'slides', 'open slides', 'presentation'],
    keywords: ['powerpoint', 'slides', 'presentation', 'ppt'],
    alternatives: ['open_word']
  },
  open_paint: {
    label: 'Paint',
    category: ACTION_CATEGORIES.APPLICATION,
    defaultResponse: 'Opening Paint',
    patterns: ['open paint', 'paint', 'ms paint', 'start paint', 'drawing app', 'draw something', 'mspaint'],
    keywords: ['paint', 'mspaint', 'draw'],
    alternatives: ['open_pictures']
  },
  open_vscode: {
    label: 'Visual Studio Code',
    category: ACTION_CATEGORIES.APPLICATION,
    defaultResponse: 'Opening VS Code',
    patterns: ['open visual studio code', 'vs code', 'open vscode', 'code editor', 'start vscode', 'open vs code', 'visual studio code', 'ide'],
    keywords: ['vscode', 'vs code', 'code editor', 'ide'],
    alternatives: ['open_notepad', 'open_github']
  },
  open_github: {
    label: 'GitHub',
    category: ACTION_CATEGORIES.APPLICATION,
    defaultResponse: 'Opening GitHub',
    patterns: ['open github', 'github', 'start github', 'check github', 'git repos', 'view repositories'],
    keywords: ['github', 'git', 'repos'],
    alternatives: ['open_vscode', 'open_chrome']
  },

  // System & Window Controls
  volume_up: {
    label: 'Volume Up',
    category: ACTION_CATEGORIES.SYSTEM,
    defaultResponse: 'Volume up',
    patterns: ['volume up', 'increase volume', 'turn up volume', 'crank it up', 'make it louder', 'louder please', 'turn up sound', 'sound higher', 'raise volume'],
    keywords: ['volume up', 'increase volume', 'louder'],
    alternatives: ['volume_app_up']
  },
  volume_down: {
    label: 'Volume Down',
    category: ACTION_CATEGORIES.SYSTEM,
    defaultResponse: 'Volume down',
    patterns: ['volume down', 'decrease volume', 'turn down volume', 'quieter please', 'make it softer', 'lower volume', 'turn down sound', 'sound lower', 'reduce volume'],
    keywords: ['volume down', 'decrease volume', 'softer', 'quieter'],
    alternatives: ['volume_app_down', 'mute']
  },
  mute: {
    label: 'Mute Audio',
    category: ACTION_CATEGORIES.SYSTEM,
    defaultResponse: 'Mute toggled',
    patterns: ['mute', 'unmute', 'silence', 'toggle mute', 'shut up audio', 'quiet sound', 'turn off sound'],
    keywords: ['mute', 'unmute', 'silence'],
    alternatives: ['volume_down']
  },
  volume_app_up: {
    label: 'App Volume Up',
    category: ACTION_CATEGORIES.SYSTEM,
    defaultResponse: 'App volume up',
    patterns: ['volume app up', 'increase app volume', 'turn up application volume', 'app louder'],
    keywords: ['app volume up', 'application volume up'],
    alternatives: ['volume_up']
  },
  volume_app_down: {
    label: 'App Volume Down',
    category: ACTION_CATEGORIES.SYSTEM,
    defaultResponse: 'App volume down',
    patterns: ['volume app down', 'decrease app volume', 'turn down application volume', 'app quieter'],
    keywords: ['app volume down', 'application volume down'],
    alternatives: ['volume_down']
  },
  get_volume: {
    label: 'Current Volume',
    category: ACTION_CATEGORIES.SYSTEM,
    defaultResponse: 'The current system volume is not available.',
    patterns: ['current volume', 'whats the current volume', 'what is the current volume', 'whats the volume', 'what is the volume', 'system volume', 'sound level', 'volume level'],
    keywords: ['volume', 'current volume', 'sound level', 'volume level'],
    alternatives: ['volume_up', 'volume_down']
  },
  get_brightness: {
    label: 'Current Brightness',
    category: ACTION_CATEGORIES.SYSTEM,
    defaultResponse: 'The current screen brightness is not available.',
    patterns: ['current brightness', 'whats the current brightness', 'what is the brightness', 'whats the brightness', 'screen brightness', 'display brightness', 'monitor brightness'],
    keywords: ['brightness', 'screen brightness', 'display brightness'],
    alternatives: ['get_volume']
  },
  lock: {
    label: 'Lock Computer',
    category: ACTION_CATEGORIES.SYSTEM,
    defaultResponse: 'Locking screen',
    patterns: ['lock screen', 'lock computer', 'lock pc', 'lock workstation', 'lock my computer', 'lock machine'],
    keywords: ['lock screen', 'lock computer', 'lock pc'],
    alternatives: ['sleep']
  },
  sleep: {
    label: 'Put PC to Sleep',
    category: ACTION_CATEGORIES.SYSTEM,
    defaultResponse: 'Putting computer to sleep',
    patterns: ['sleep', 'hibernate', 'put computer to sleep', 'suspend system', 'standby', 'pc sleep', 'enter standby'],
    keywords: ['sleep', 'hibernate', 'standby'],
    alternatives: ['lock']
  },
  shutdown: {
    label: 'Shutdown System',
    category: ACTION_CATEGORIES.SYSTEM,
    defaultResponse: 'Shutting down in 10 seconds',
    patterns: ['shutdown', 'shut down', 'power off', 'turn off computer', 'turn off pc', 'power down machine'],
    keywords: ['shutdown', 'power off', 'turn off computer'],
    alternatives: ['sleep', 'restart']
  },
  restart: {
    label: 'Restart System',
    category: ACTION_CATEGORIES.SYSTEM,
    defaultResponse: 'Restarting in 10 seconds',
    patterns: ['restart', 'reboot', 'restart computer', 'reboot pc', 'bounce system', 'reboot system'],
    keywords: ['restart', 'reboot'],
    alternatives: ['shutdown']
  },
  maximize: {
    label: 'Maximize Window',
    category: ACTION_CATEGORIES.SYSTEM,
    defaultResponse: 'Maximizing window',
    patterns: ['maximize window', 'maximize', 'make full screen', 'fullscreen', 'expand window', 'maximize screen'],
    keywords: ['maximize', 'fullscreen'],
    alternatives: ['minimize']
  },
  minimize: {
    label: 'Minimize Window',
    category: ACTION_CATEGORIES.SYSTEM,
    defaultResponse: 'Minimizing window',
    patterns: ['minimize window', 'minimize', 'hide window', 'collapse window', 'send to taskbar'],
    keywords: ['minimize', 'hide window'],
    alternatives: ['maximize']
  },
  close_chrome: {
    label: 'Google Chrome',
    category: ACTION_CATEGORIES.APPLICATION,
    defaultResponse: 'Closing Chrome',
    patterns: ['close chrome', 'exit chrome', 'terminate chrome', 'kill chrome'],
    keywords: ['close chrome', 'exit chrome'],
    alternatives: ['close_app']
  },
  close_notepad: {
    label: 'Notepad',
    category: ACTION_CATEGORIES.APPLICATION,
    defaultResponse: 'Closing Notepad',
    patterns: ['close notepad', 'exit notepad', 'terminate notepad', 'kill notepad'],
    keywords: ['close notepad', 'exit notepad'],
    alternatives: ['close_app']
  },
  close_app: {
    label: 'Active Window',
    category: ACTION_CATEGORIES.SYSTEM,
    defaultResponse: 'Closing active window',
    patterns: ['close it', 'close window', 'close active window', 'close this', 'close app'],
    keywords: ['close it', 'close window', 'close app'],
    alternatives: ['minimize']
  },
  set_volume: {
    label: 'Set Volume',
    category: ACTION_CATEGORIES.SYSTEM,
    defaultResponse: 'Setting volume level',
    patterns: ['set volume', 'set the volume', 'lower volume to', 'turn volume to', 'volume to'],
    keywords: ['set volume', 'volume to'],
    alternatives: ['volume_up', 'volume_down']
  },
  switch_tab: {
    label: 'Switch to Next Tab',
    category: ACTION_CATEGORIES.SYSTEM,
    defaultResponse: 'Switched to next tab',
    patterns: ['switch tab', 'next tab', 'cycle tab', 'forward tab', 'tab right', 'switch to next tab'],
    keywords: ['switch tab', 'next tab'],
    alternatives: ['previous_tab']
  },
  previous_tab: {
    label: 'Switch to Previous Tab',
    category: ACTION_CATEGORIES.SYSTEM,
    defaultResponse: 'Switched to previous tab',
    patterns: ['previous tab', 'prev tab', 'tab left', 'backward tab', 'switch to previous tab', 'back tab'],
    keywords: ['previous tab', 'prev tab'],
    alternatives: ['switch_tab']
  },
  youtube_play_pause: {
    label: 'YouTube Play/Pause',
    category: ACTION_CATEGORIES.SYSTEM,
    defaultResponse: 'Toggled media playback',
    patterns: ['pause youtube', 'play youtube', 'pause video', 'resume video', 'unpause video', 'toggle playback', 'pause the video', 'resume the video'],
    keywords: ['youtube', 'pause', 'play', 'resume', 'video'],
    alternatives: ['youtube_next', 'youtube_mute']
  },
  youtube_next: {
    label: 'YouTube Next Track',
    category: ACTION_CATEGORIES.SYSTEM,
    defaultResponse: 'Skipped to next media track',
    patterns: ['next video', 'skip video', 'next track', 'skip song', 'next song', 'skip track'],
    keywords: ['next video', 'skip video', 'next song', 'skip track'],
    alternatives: ['youtube_play_pause']
  },
  youtube_mute: {
    label: 'YouTube Mute',
    category: ACTION_CATEGORIES.SYSTEM,
    defaultResponse: 'Toggled media audio mute',
    patterns: ['mute youtube', 'mute video', 'silence youtube', 'unmute youtube'],
    keywords: ['mute youtube', 'mute video'],
    alternatives: ['mute', 'volume_down']
  },
  visual_context: {
    label: 'Visual Context & Screen Analysis',
    category: ACTION_CATEGORIES.SYSTEM,
    defaultResponse: 'Observing your active screen and browser context',
    patterns: ['what am i seeing', 'what am i watching', 'tell me what is on screen', 'what is on my screen', 'what\'s on my screen', 'tell me what i am seeing', 'look at my screen'],
    keywords: ['screen', 'seeing', 'watching', 'look', 'display', 'context'],
    alternatives: ['get_brightness']
  },

  // Files & Directories
  open_downloads: {
    label: 'Downloads Folder',
    category: ACTION_CATEGORIES.FILES,
    defaultResponse: 'Opening Downloads',
    patterns: ['open downloads', 'downloads folder', 'show downloads', 'view downloads', 'downloads'],
    keywords: ['downloads', 'downloads folder'],
    alternatives: ['open_explorer', 'open_documents']
  },
  open_documents: {
    label: 'Documents Folder',
    category: ACTION_CATEGORIES.FILES,
    defaultResponse: 'Opening Documents',
    patterns: ['open documents', 'documents folder', 'my documents', 'view documents', 'show documents', 'docs folder'],
    keywords: ['documents', 'docs'],
    alternatives: ['open_explorer', 'open_desktop']
  },
  open_desktop: {
    label: 'Desktop Folder',
    category: ACTION_CATEGORIES.FILES,
    defaultResponse: 'Opening Desktop',
    patterns: ['open desktop', 'desktop folder', 'show desktop folder', 'view desktop'],
    keywords: ['desktop folder'],
    alternatives: ['open_explorer']
  },
  open_pictures: {
    label: 'Pictures Folder',
    category: ACTION_CATEGORIES.FILES,
    defaultResponse: 'Opening Pictures',
    patterns: ['open pictures', 'pictures folder', 'photos folder', 'my pictures', 'view photos', 'show pictures', 'open photos'],
    keywords: ['pictures', 'photos', 'images'],
    alternatives: ['open_explorer', 'open_paint']
  },
  create_file: {
    label: 'Create New File',
    category: ACTION_CATEGORIES.FILES,
    defaultResponse: 'File created',
    patterns: ['create file', 'new file', 'make a file', 'create text file', 'new text file', 'touch file', 'start new file'],
    keywords: ['create file', 'new file', 'text file'],
    alternatives: ['open_notepad']
  },
  create_folder: {
    label: 'Create New Folder',
    category: ACTION_CATEGORIES.FILES,
    defaultResponse: 'Folder created',
    patterns: ['create folder', 'new folder', 'make a folder', 'mkdir', 'new directory', 'create directory'],
    keywords: ['create folder', 'new folder', 'directory'],
    alternatives: ['open_explorer']
  },
  delete_file: {
    label: 'Delete File',
    category: ACTION_CATEGORIES.FILES,
    defaultResponse: 'Deleting file',
    patterns: ['delete file', 'remove file', 'delete the file', 'erase file'],
    keywords: ['delete file', 'remove file'],
    alternatives: ['create_file']
  },

  // Assistant & Utilities
  greeting: {
    label: 'Greeting',
    category: ACTION_CATEGORIES.ASSISTANT,
    defaultResponse: "Hello! I'm listening. What can I do for you?",
    patterns: ['hello', 'hi', 'hey', 'greetings', 'good morning', 'good afternoon', 'good evening', 'yo', 'sup'],
    keywords: ['hello', 'hi', 'hey', 'greetings'],
    alternatives: ['help']
  },
  time: {
    label: 'Check Time',
    category: ACTION_CATEGORIES.ASSISTANT,
    defaultResponse: `The time is ${new Date().toLocaleTimeString()}`,
    patterns: ['what time is it', 'what time', 'tell me the time', 'current time', 'check clock', 'what hour is it', 'whats the time', 'what is the time'],
    keywords: ['current time', 'what time', 'clock time'],
    alternatives: ['date']
  },
  date: {
    label: 'Check Date',
    category: ACTION_CATEGORIES.ASSISTANT,
    defaultResponse: `Today is ${new Date().toLocaleDateString()}`,
    patterns: ['what date is it', 'what date', "today's date", 'what day is it', 'current date', 'calendar date', 'whats the date', 'what is the date', 'what day is today'],
    keywords: ['current date', 'calendar date', "today's date"],
    alternatives: ['time']
  },
  write_email: {
    label: 'Compose Email',
    category: ACTION_CATEGORIES.ASSISTANT,
    defaultResponse: 'Email draft created',
    patterns: ['write email', 'compose email', 'new email', 'draft an email', 'draft a mail', 'draft mail', 'draft email', 'write an email', 'compose mail', 'send email draft'],
    keywords: ['write email', 'compose email', 'email draft', 'draft mail', 'draft a mail'],
    alternatives: ['open_outlook', 'open_gmail']
  },
  joke: {
    label: 'Tell a Joke',
    category: ACTION_CATEGORIES.ASSISTANT,
    defaultResponse: "Why don't scientists trust atoms? Because they make up everything!",
    patterns: ['tell joke', 'joke', 'tell me a joke', 'make me laugh', 'say something funny', 'tell another joke', 'crack a joke'],
    keywords: ['joke', 'funny', 'laugh'],
    alternatives: ['greeting']
  },
  thanks: {
    label: 'Thanks',
    category: ACTION_CATEGORIES.ASSISTANT,
    defaultResponse: "You're very welcome!",
    patterns: ['thank you', 'thanks', 'thanks a lot', 'much appreciated', 'appreciate it', 'thank you jarvis'],
    keywords: ['thank you', 'thanks', 'appreciated'],
    alternatives: ['greeting']
  },
  test_speech: {
    label: 'Test Speech',
    category: ACTION_CATEGORIES.ASSISTANT,
    defaultResponse: 'Speech test completed',
    patterns: ['test speech', 'test voice', 'speech test', 'voice check', 'sound check'],
    keywords: ['test speech', 'test voice'],
    alternatives: ['help']
  },
  sleep_assistant: {
    label: 'Assistant Sleep',
    category: ACTION_CATEGORIES.ASSISTANT,
    defaultResponse: 'Going to sleep',
    patterns: ['sleep now', 'go to sleep', 'stop listening', 'rest now jarvis', 'sleep assistant', 'stand by jarvis'],
    keywords: ['sleep now', 'stop listening', 'go to sleep'],
    alternatives: ['help']
  },
  repeat: {
    label: 'Repeat Last Response',
    category: ACTION_CATEGORIES.ASSISTANT,
    defaultResponse: 'Nothing to repeat yet',
    patterns: ['repeat', 'say that again', 'what was that', 'pardon', 'repeat that', 'say again'],
    keywords: ['repeat', 'say again'],
    alternatives: ['help']
  },
  help: {
    label: 'Show Help',
    category: ACTION_CATEGORIES.ASSISTANT,
    defaultResponse: 'Help displayed',
    patterns: ['what can you do', 'help', 'commands', 'show help', 'available commands', 'list commands', 'what commands are available'],
    keywords: ['help', 'commands', 'what can you do'],
    alternatives: ['greeting']
  }
};

/**
 * Explicit ambiguous input mappings where user intent could mean multiple distinct actions.
 * Requirements: 6.5
 */
export const AMBIGUOUS_INTENT_MAP = [
  {
    patterns: [/\b(?:open|check|view|read|access)\s+(?:my\s+)?(?:mail|email|emails)\b/i, /^(?:mail|email)$/i],
    candidates: ['open_gmail', 'open_outlook'],
    clarificationPrompt: 'Did you want to open Gmail or Outlook?'
  },
  {
    patterns: [/\b(?:stream|watch)\s+(?:video|videos|movie|movies|shows)\b/i],
    candidates: ['open_youtube', 'open_netflix', 'open_prime'],
    clarificationPrompt: 'Would you prefer to watch on YouTube, Netflix, or Prime Video?'
  },
  {
    patterns: [/\b(?:play|listen\s+to)\s+(?:music|songs|tracks)\b/i],
    candidates: ['open_spotify', 'open_youtube'],
    clarificationPrompt: 'Would you like to play music via Spotify or YouTube?'
  },
  {
    patterns: [/\b(?:open\s+)?(?:terminal|shell|console)\b/i],
    candidates: ['open_cmd', 'open_powershell'],
    clarificationPrompt: 'Would you like Command Prompt or PowerShell?'
  },
  {
    patterns: [/\b(?:open\s+)?(?:social\s*media|socials)\b/i],
    candidates: ['open_twitter', 'open_instagram', 'open_facebook'],
    clarificationPrompt: 'Which platform would you like: Twitter, Instagram, or Facebook?'
  },
  {
    patterns: [/\b(?:open\s+)?(?:office|microsoft\s*office)\b/i],
    candidates: ['open_word', 'open_excel', 'open_powerpoint'],
    clarificationPrompt: 'Which Office app do you need: Word, Excel, or PowerPoint?'
  },
  {
    patterns: [/^(?:adjust|change)\s+volume$/i],
    candidates: ['volume_up', 'volume_down'],
    clarificationPrompt: 'Would you like to turn the volume up or down?'
  }
];

/**
 * ActionBridge coordinates natural language requests with Executor actions
 */
export class ActionBridge {
  /**
   * @param {object} [options={}]
   * @param {Executor} [options.executor] Existing or mock Executor instance
   * @param {CommandRouter} [options.commandRouter] Existing CommandRouter instance
   * @param {LLMEngine} [options.llmEngine] Local LLM engine for novel phrasing fallback
   * @param {ResponseGenerator} [options.responseGenerator] Optional ResponseGenerator for persona responses
   * @param {boolean} [options.dryRun=false] When true, does not trigger real OS commands
   */
  constructor(options = {}) {
    this.executor = options.executor || new Executor();
    this.commandRouter = options.commandRouter || new CommandRouter();
    this.llmEngine = options.llmEngine || null;
    this.responseGenerator = options.responseGenerator || null;
    this.dryRun = options.dryRun ?? false;
    this.fastMatcher = options.fastMatcher || new FastIntentMatcher(this.commandRouter);

    this.pendingConfirmation = null; // { action, text, options, expiresAt }
    this.confirmationTimeoutMs = options.confirmationTimeoutMs ?? 15000;

    this.metrics = {
      totalRequests: 0,
      directMatches: 0,
      semanticMatches: 0,
      llmExtractions: 0,
      ambiguousQueries: 0,
      executionSuccesses: 0,
      executionFailures: 0
    };
  }

  /**
   * Resolve a pending destructive action confirmation
   * @param {boolean} confirmed
   * @returns {Promise<object|null>}
   */
  async resolvePendingConfirmation(confirmed) {
    if (!this.pendingConfirmation) return null;
    const { action, text, options } = this.pendingConfirmation;
    const expired = Date.now() > this.pendingConfirmation.expiresAt;
    this.pendingConfirmation = null;

    if (expired) {
      return { success: false, action, response: `That confirmation window expired — say the command again if you still want to ${this.getActionMetadata(action)?.label?.toLowerCase() || action}.` };
    }
    if (!confirmed) {
      return { success: false, action, cancelled: true, response: 'Cancelled — no action taken.' };
    }
    return this.executeAction(action, text, { ...options, confirmed: true });
  }

  /**
   * Check if a pending confirmation is active and unexpired
   * @returns {boolean}
   */
  hasPendingConfirmation() {
    return this.pendingConfirmation !== null && Date.now() <= this.pendingConfirmation.expiresAt;
  }

  /**
   * Check whether an action string is a valid executor action code
   * @param {string} action 
   * @returns {boolean}
   */
  isValidAction(action) {
    if (!action || typeof action !== 'string') return false;
    return VALID_ACTIONS.has(action.toLowerCase().trim());
  }

  /**
   * Get list of all valid action codes
   * @returns {string[]}
   */
  getValidActions() {
    return Array.from(VALID_ACTIONS);
  }

  /**
   * Get metadata for an action
   * @param {string} action
   * @returns {object|null}
   */
  getActionMetadata(action) {
    if (!action) return null;
    return ACTION_METADATA[action.toLowerCase().trim()] || null;
  }

  /**
   * Match user text against known ambiguous intent patterns (Requirement 6.5)
   * @param {string} text 
   * @returns {object|null} { ambiguous: true, candidates, clarificationPrompt }
   */
  checkAmbiguity(text) {
    if (!text || typeof text !== 'string') return null;
    const lower = text.toLowerCase().trim();

    for (const item of AMBIGUOUS_INTENT_MAP) {
      for (const pattern of item.patterns) {
        if (pattern.test(lower)) {
          return {
            ambiguous: true,
            candidates: item.candidates,
            clarificationPrompt: item.clarificationPrompt,
            confidence: 0.90
          };
        }
      }
    }

    return null;
  }

  /**
   * Match natural language input against semantic action definitions
   * @param {string} input Raw text input
   * @returns {object|null} Match result with action, score, and match details
   */
  findSemanticMatch(input) {
    if (!input || typeof input !== 'string') return null;
    const lower = input.toLowerCase().replace(/[?!.,;]+$/, '').trim();
    if (lower.length === 0) return null;

    // 1. Check explicit ambiguity first
    const ambiguity = this.checkAmbiguity(lower);
    if (ambiguity) {
      return ambiguity;
    }

    // 2. Score against all 60 actions
    const candidates = [];
    const inputWords = new Set(lower.split(/\s+/).filter(w => w.length > 1));

    for (const [actionName, meta] of Object.entries(ACTION_METADATA)) {
      let score = 0;
      let matchedTerm = null;

      // Check pattern in input
      const normalizedLower = lower.replace(/\b(the|a|an|my|this|please|some)\b/g, ' ').replace(/\s+/g, ' ').trim();

      for (const pattern of meta.patterns) {
        const normalizedPattern = pattern.replace(/\b(the|a|an|my|this|please|some)\b/g, ' ').replace(/\s+/g, ' ').trim();
        if (lower === pattern || normalizedLower === normalizedPattern) {
          score = 1.0;
          matchedTerm = pattern;
          break;
        }

        // Word boundary match of pattern in input
        const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`(^|\\b)${escaped}(\\b|$)`, 'i');
        if (regex.test(lower)) {
          const s = 0.90 + (pattern.length / (lower.length * 10));
          if (s > score) {
            score = Math.min(0.98, s);
            matchedTerm = pattern;
          }
        }

        // Normalized word boundary match
        const normEscaped = normalizedPattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const normRegex = new RegExp(`(^|\\b)${normEscaped}(\\b|$)`, 'i');
        if (normRegex.test(normalizedLower)) {
          const s = 0.88 + (normalizedPattern.length / (normalizedLower.length * 10));
          if (s > score) {
            score = Math.min(0.96, s);
            matchedTerm = pattern;
          }
        }
      }

      // Keyword token overlap scoring if no full pattern match (with word boundary)
      if (score < 0.70 && meta.keywords) {
        let matchedKeywords = 0;
        for (const kw of meta.keywords) {
          const kwEscaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const kwRegex = new RegExp(`(^|\\b)${kwEscaped}(\\b|$)`, 'i');
          if (kwRegex.test(lower)) {
            matchedKeywords++;
          }
        }
        if (matchedKeywords > 0) {
          const overlapScore = 0.70 + (matchedKeywords * 0.08);
          if (overlapScore > score) {
            score = Math.min(0.88, overlapScore);
            matchedTerm = meta.keywords.join(', ');
          }
        }
      }

      if (score >= 0.70) {
        candidates.push({
          action: actionName,
          label: meta.label,
          score,
          matchedTerm
        });
      }
    }

    if (candidates.length === 0) return null;

    // Sort candidates by score descending
    candidates.sort((a, b) => b.score - a.score);

    // Dynamic ambiguity detection: if top 2 candidates have very close scores and different actions
    if (candidates.length >= 2) {
      const top1 = candidates[0];
      const top2 = candidates[1];
      const diff = Math.abs(top1.score - top2.score);

      // Only flag ambiguity if scores are high (>0.80) and difference is negligible (<0.05)
      // and one is not a strict subtype (e.g. volume_up vs volume_app_up)
      if (diff < 0.05 && top1.score >= 0.85) {
        // Distinguish volume_up vs volume_app_up: "volume up" should prefer volume_up
        if (top1.action === 'volume_up' && top2.action === 'volume_app_up' && !lower.includes('app')) {
          return { action: top1.action, confidence: top1.score, ambiguous: false };
        }
        if (top1.action === 'volume_down' && top2.action === 'volume_app_down' && !lower.includes('app')) {
          return { action: top1.action, confidence: top1.score, ambiguous: false };
        }

        return {
          ambiguous: true,
          candidates: [top1.action, top2.action],
          clarificationPrompt: `Did you mean ${top1.label} or ${top2.label}?`,
          confidence: top1.score
        };
      }
    }

    return {
      action: candidates[0].action,
      confidence: candidates[0].score,
      ambiguous: false,
      details: candidates[0]
    };
  }

  /**
   * Use local LLM to extract system action from novel natural language phrasing
   * @param {string} input
   * @returns {Promise<{action: string|null, confidence: number}>}
   */
  async extractActionWithLLM(input) {
    if (!this.llmEngine) {
      return { action: null, confidence: 0.0 };
    }

    try {
      this.metrics.llmExtractions++;
      const availableActions = this.getValidActions();
      const prompt = buildActionExtractionPrompt({
        userInput: input,
        availableActions
      });

      const response = await this.llmEngine.generate(prompt, {
        preset: SAMPLING_PRESETS.CLASSIFICATION,
        maxTokens: 20
      });

      const cleaned = cleanResponse(response.text).toLowerCase().replace(/[^a-z0-9_]/g, '').trim();

      if (cleaned === 'none' || cleaned === 'null' || !cleaned) {
        return { action: null, confidence: 0.0 };
      }

      if (this.isValidAction(cleaned)) {
        return { action: cleaned, confidence: 0.75 };
      }

      // Check if cleaned response contains a valid action name as substring
      for (const validAct of availableActions) {
        if (cleaned.includes(validAct)) {
          return { action: validAct, confidence: 0.70 };
        }
      }

      return { action: null, confidence: 0.0 };
    } catch (err) {
      return { action: null, confidence: 0.0, error: err.message };
    }
  }

  /**
   * Resolve an input query into an action through multi-stage analysis:
   * Stage 1: CommandRouter direct match
   * Stage 2: Semantic mapping & keyword match
   * Stage 3: LLM extraction fallback (if confidence < 0.70)
   * 
   * @param {string} input User text
   * @param {object} [options={}]
   * @returns {Promise<object>} Resolved action state
   */
  async resolveAction(input, options = {}) {
    this.metrics.totalRequests++;

    if (!input || typeof input !== 'string' || input.trim().length === 0) {
      return {
        matched: false,
        action: null,
        confidence: 0.0,
        source: 'none',
        ambiguous: false,
        reason: 'Empty input'
      };
    }

    const trimmed = input.trim();
    const lower = trimmed.toLowerCase();

    // 1. Check explicit ambiguity patterns first (Requirement 6.5)
    const ambiguity = this.checkAmbiguity(lower);
    if (ambiguity) {
      this.metrics.ambiguousQueries++;
      return {
        matched: false,
        action: null,
        confidence: ambiguity.confidence,
        source: 'ambiguity_detector',
        ambiguous: true,
        candidates: ambiguity.candidates,
        clarificationPrompt: ambiguity.clarificationPrompt
      };
    }

    // 2. Stage 1: Direct match via CommandRouter
    const routerMatch = this._matchRouterWithWordBoundary(lower);
    if (routerMatch && this.isValidAction(routerMatch.action)) {
      this.metrics.directMatches++;
      return {
        matched: true,
        action: routerMatch.action,
        confidence: 0.95,
        source: 'direct',
        ambiguous: false,
        matchedPattern: routerMatch.matchedPattern
      };
    }

    // 3. Stage 2: Semantic mapping
    const semanticMatch = this.findSemanticMatch(trimmed);
    if (semanticMatch) {
      if (semanticMatch.ambiguous) {
        this.metrics.ambiguousQueries++;
        return {
          matched: false,
          action: null,
          confidence: semanticMatch.confidence,
          source: 'semantic',
          ambiguous: true,
          candidates: semanticMatch.candidates,
          clarificationPrompt: semanticMatch.clarificationPrompt
        };
      }

      if (semanticMatch.action && this.isValidAction(semanticMatch.action)) {
        this.metrics.semanticMatches++;
        return {
          matched: true,
          action: semanticMatch.action,
          confidence: semanticMatch.confidence,
          source: 'semantic',
          ambiguous: false,
          details: semanticMatch.details
        };
      }
    }

    // 4. Stage 3: LLM action extraction fallback
    if (this.llmEngine && !options.skipLLM) {
      const llmResult = await this.extractActionWithLLM(trimmed);
      if (llmResult.action && this.isValidAction(llmResult.action)) {
        return {
          matched: true,
          action: llmResult.action,
          confidence: llmResult.confidence,
          source: 'llm',
          ambiguous: false
        };
      }
    }

    // 5. Unrecognized action
    return {
      matched: false,
      action: null,
      confidence: 0.0,
      source: 'unknown',
      ambiguous: false,
      reason: 'No matching action found'
    };
  }

  /**
   * Execute an action safely, capturing timing and handling errors gracefully.
   * Supports dryRun mode to prevent executing real OS commands during testing.
   * 
   * @param {string} action Action code
   * @param {string} [text=''] Original text query
   * @param {object} [options={}] Execution options
   * @returns {Promise<object>} Execution result
   */
  async executeAction(action, text = '', options = {}) {
    const isDryRun = options.dryRun ?? this.dryRun;
    const startTime = Date.now();

    // Validate action
    if (!this.isValidAction(action)) {
      this.metrics.executionFailures++;
      return {
        success: false,
        action,
        error: `Action "${action}" is not a recognized system action.`,
        suggestedAlternatives: ['help'],
        latencyMs: 0
      };
    }

    const meta = this.getActionMetadata(action);
    const defaultResponse = meta ? meta.defaultResponse : 'Action executed';

    // Priority 0: Destructive Action Gate
    if (DESTRUCTIVE_ACTIONS.has(action) && !options.confirmed) {
      this.pendingConfirmation = {
        action, text, options,
        expiresAt: Date.now() + this.confirmationTimeoutMs
      };
      return {
        success: false,
        requiresConfirmation: true,
        action,
        response: `Are you sure you want me to ${meta?.label?.toLowerCase() || action}? This can't be undone. Say "yes" to confirm or "cancel" to stop.`,
        latencyMs: Date.now() - startTime
      };
    }

    // Dry-run mode: do not execute modifying/destructive system binaries,
    // but allow read-only queries (get_volume, get_brightness, time, date) to fetch truthful state
    const isReadOnlyQuery = ['get_volume', 'get_brightness', 'time', 'date'].includes(action);
    if (isDryRun && !isReadOnlyQuery) {
      this.metrics.executionSuccesses++;
      const formatted = (this.responseGenerator && typeof this.responseGenerator.formatActionConfirmation === 'function')
        ? this.responseGenerator.formatActionConfirmation(meta?.label || action, defaultResponse)
        : defaultResponse;
      return {
        success: true,
        action,
        response: formatted,
        dryRun: true,
        latencyMs: Date.now() - startTime
      };
    }

    // Live execution
    try {
      await this.executor.run(action, text);
      const response = this.executor.lastResponse || defaultResponse;

      // Check if executor reported an internal failure message
      const isFailed = /error|failed|don't understand/i.test(response) && !/speech test/i.test(response);

      if (isFailed) {
        this.metrics.executionFailures++;
        const alternatives = meta?.alternatives || ['help'];
        return {
          success: false,
          action,
          response,
          error: response,
          suggestedAlternatives: alternatives,
          suggestion: this._formatAlternativeSuggestion(action, alternatives),
          latencyMs: Date.now() - startTime
        };
      }

      this.metrics.executionSuccesses++;
      const formatted = (this.responseGenerator && typeof this.responseGenerator.formatActionConfirmation === 'function')
        ? this.responseGenerator.formatActionConfirmation(meta?.label || action, response)
        : response;
      return {
        success: true,
        action,
        response: formatted,
        dryRun: false,
        latencyMs: Date.now() - startTime
      };
    } catch (err) {
      this.metrics.executionFailures++;
      const alternatives = meta?.alternatives || ['help'];
      return {
        success: false,
        action,
        error: err.message,
        suggestedAlternatives: alternatives,
        suggestion: this._formatAlternativeSuggestion(action, alternatives),
        latencyMs: Date.now() - startTime
      };
    }
  }

  /**
   * Execute action directly from natural language input
   * @param {string} input User text
   * @param {object} [options={}]
   * @returns {Promise<object>}
   */
  async executeFromNaturalLanguage(input, options = {}) {
    const resolution = await this.resolveAction(input, options);

    if (resolution.ambiguous) {
      return {
        success: false,
        ambiguous: true,
        clarificationPrompt: resolution.clarificationPrompt,
        candidates: resolution.candidates,
        message: resolution.clarificationPrompt
      };
    }

    if (!resolution.matched || !resolution.action) {
      return {
        success: false,
        ambiguous: false,
        message: "I'm not sure how to execute that action. Could you rephrase or type 'help'?",
        reason: resolution.reason
      };
    }

    const execResult = await this.executeAction(resolution.action, input, options);
    return {
      ...execResult,
      resolution
    };
  }

  /**
   * Execute a sequence of multiple actions in order (Task 6.3 - Multi-action sequencing)
   * @param {Array<string|object>} actionItems Array of action strings or { action, text } objects
   * @param {object} [options={}]
   * @returns {Promise<object>} Combined execution result
   */
  async executeSequence(actionItems, options = {}) {
    if (!Array.isArray(actionItems) || actionItems.length === 0) {
      return {
        success: false,
        results: [],
        combinedResponse: 'No actions to execute.'
      };
    }

    const results = [];
    const completedActionLabels = [];
    const failedActions = [];

    for (let i = 0; i < actionItems.length; i++) {
      const item = actionItems[i];
      const actionName = typeof item === 'string' ? item : item.action;
      const text = typeof item === 'object' ? item.raw || item.text || '' : '';

      const res = await this.executeAction(actionName, text, options);
      results.push(res);

      if (res.requiresConfirmation) {
        return {
          success: false,
          results,
          executedCount: completedActionLabels.length,
          failedCount: failedActions.length,
          requiresConfirmation: true,
          pendingAction: actionName,
          remainingActions: actionItems.slice(i + 1),
          combinedResponse: res.response
        };
      }

      const meta = this.getActionMetadata(actionName);
      const label = meta ? meta.label : actionName;

      if (res.success) {
        completedActionLabels.push(label);
      } else {
        failedActions.push({ action: actionName, label, error: res.error, suggestion: res.suggestion });
      }
    }

    // Synthesize natural language combined response
    let combinedResponse = '';
    const allSucceeded = failedActions.length === 0;

    if (completedActionLabels.length > 0) {
      const formattedClauses = results.filter(r => r.success).map(r => {
        const meta = this.getActionMetadata(r.action);
        const label = meta ? meta.label : r.action;
        if (r.action.startsWith('volume_') || r.action === 'set_volume') {
          return `adjusted volume`;
        } else if (r.action.startsWith('open_')) {
          return `opened ${label}`;
        } else if (r.action.startsWith('close_')) {
          return `closed ${label}`;
        } else {
          return `executed ${label}`;
        }
      });

      if (formattedClauses.length === 1) {
        combinedResponse = `${formattedClauses[0].charAt(0).toUpperCase() + formattedClauses[0].slice(1)}.`;
      } else if (formattedClauses.length === 2) {
        combinedResponse = `${formattedClauses[0].charAt(0).toUpperCase() + formattedClauses[0].slice(1)} and ${formattedClauses[1]}.`;
      } else {
        const remaining = [...formattedClauses];
        const last = remaining.pop();
        combinedResponse = `${remaining[0].charAt(0).toUpperCase() + remaining[0].slice(1)}, ${remaining.slice(1).join(', ')}, and ${last}.`;
      }
    }

    if (failedActions.length > 0) {
      const failSummary = failedActions.map(f => `unable to execute ${f.label}`).join('; ');
      if (combinedResponse) {
        combinedResponse += ` However, I was ${failSummary}.`;
      } else {
        combinedResponse = `I was ${failSummary}.`;
      }
      if (failedActions[0].suggestion) {
        combinedResponse += ` ${failedActions[0].suggestion}`;
      }
    }

    return {
      success: allSucceeded,
      results,
      executedCount: completedActionLabels.length,
      failedCount: failedActions.length,
      combinedResponse
    };
  }

  /**
   * Execute a hybrid intent containing both system actions and conversational query (Task 6.3)
   * Coordinates execution order and combines action confirmation with conversation response.
   * 
   * @param {object} hybridIntent
   * @param {Array<string|object>} hybridIntent.actions Actions to execute
   * @param {string} [hybridIntent.conversationalQuery] Attached conversational question or chat
   * @param {string[]} [hybridIntent.executionOrder=['action', 'conversation']]
   * @param {object} [options={}]
   * @returns {Promise<object>} Combined hybrid execution result
   */
  async executeHybrid(hybridIntent, options = {}) {
    if (!hybridIntent) {
      return { success: false, message: 'Invalid hybrid intent provided.' };
    }

    // Support raw string input: parse via fastMatcher
    if (typeof hybridIntent === 'string') {
      const match = this.fastMatcher ? this.fastMatcher.match(hybridIntent) : null;
      if (match && (match.type === 'hybrid' || match.isMultiAction)) {
        hybridIntent = match;
      } else if (match && match.type === 'action') {
        hybridIntent = {
          actions: match.actions || [{ action: match.action }],
          conversationalQuery: '',
          executionOrder: ['action']
        };
      } else {
        return this.executeFromNaturalLanguage(hybridIntent, options);
      }
    }

    const {
      actions = [],
      conversationalQuery = '',
      executionOrder = ['action', 'conversation']
    } = hybridIntent;

    let actionSummary = '';
    let sequenceResult = null;

    // 1. Execute system actions in sequence
    if (actions.length > 0) {
      sequenceResult = await this.executeSequence(actions, options);
      if (sequenceResult.requiresConfirmation) {
        return {
          success: false,
          requiresConfirmation: true,
          pendingAction: sequenceResult.pendingAction,
          remainingActions: sequenceResult.remainingActions,
          conversationalQuery,
          combinedResponse: sequenceResult.combinedResponse,
          unifiedResponse: sequenceResult.combinedResponse
        };
      }
      actionSummary = sequenceResult.combinedResponse;
    }

    // 2. Generate or fetch conversational response
    let conversationalResponse = '';

    if (conversationalQuery && conversationalQuery.trim().length > 0) {
      const lowerQuery = conversationalQuery.toLowerCase().trim();

      // Check if conversational query matches a fast assistant action (e.g. joke, time, date)
      if (/\b(?:tell\s+me\s+a\s+joke|joke|make\s+me\s+laugh)\b/i.test(lowerQuery)) {
        const jokes = [
          "Why don't scientists trust atoms? Because they make up everything!",
          "Why did the robot cross the road? It was programmed to!",
          "Why do programmers prefer dark mode? Because light attracts bugs!"
        ];
        conversationalResponse = jokes[Math.floor(Math.random() * jokes.length)];
      } else if (/\b(?:time|what\s+time)\b/i.test(lowerQuery)) {
        conversationalResponse = `The current time is ${new Date().toLocaleTimeString()}.`;
      } else if (/\b(?:date|today)\b/i.test(lowerQuery)) {
        conversationalResponse = `Today is ${new Date().toLocaleDateString()}.`;
      } else if (this.responseGenerator) {
        // Use ResponseGenerator if available
        try {
          const genResult = await this.responseGenerator.generateResponse(conversationalQuery, {
            context: options.context || []
          });
          conversationalResponse = genResult.text;
        } catch {
          conversationalResponse = 'All requested tasks completed.';
        }
      } else if (this.llmEngine) {
        // Generate via LLMEngine
        try {
          const genRes = await this.llmEngine.generate(conversationalQuery, {
            preset: SAMPLING_PRESETS.CONCISE,
            maxTokens: 100
          });
          conversationalResponse = cleanResponse(genRes.text);
        } catch {
          conversationalResponse = 'Task completed.';
        }
      } else {
        conversationalResponse = `In regards to your question: I am ready to assist.`;
      }
    }

    // 3. Assemble unified response adhering to JARVIS persona
    let unifiedResponse = '';
    const order = executionOrder[0] || 'action';

    if (order === 'action') {
      if (actionSummary && conversationalResponse) {
        unifiedResponse = `${actionSummary} ${conversationalResponse}`;
      } else {
        unifiedResponse = actionSummary || conversationalResponse;
      }
    } else {
      if (conversationalResponse && actionSummary) {
        unifiedResponse = `${conversationalResponse} ${actionSummary}`;
      } else {
        unifiedResponse = conversationalResponse || actionSummary;
      }
    }

    return {
      success: sequenceResult ? sequenceResult.success : true,
      sequenceResult,
      conversationalResponse,
      unifiedResponse
    };
  }

  /**
   * Helper: check CommandRouter with strict word boundaries
   * @private
   */
  _matchRouterWithWordBoundary(lower) {
    const match = this.commandRouter.match(lower);
    if (!match || !match.matchedPattern) return null;

    const escaped = match.matchedPattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const wordBoundaryRegex = new RegExp(`(^|\\b)${escaped}(\\b|$)`, 'i');
    if (wordBoundaryRegex.test(lower)) {
      return match;
    }
    return null;
  }

  /**
   * Format a polite suggestion of alternatives when an action fails (Requirement 6.6, 8.4)
   * @private
   */
  _formatAlternativeSuggestion(action, alternatives) {
    if (!alternatives || alternatives.length === 0) {
      return "Would you like me to try another command or show available options with 'help'?";
    }

    const altLabels = alternatives
      .map(alt => this.getActionMetadata(alt)?.label || alt)
      .slice(0, 2);

    return `Would you like me to try ${altLabels.join(' or ')} instead?`;
  }
}

export const ActionExecutorBridge = ActionBridge;
export default ActionBridge;
