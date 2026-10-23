import { exec, execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

class Executor {
  constructor() {
    this.lastResponse = null;
  }

  async _execCommand(cmd, successMsg, failMsg) {
    return new Promise((resolve) => {
      this.lastResponse = successMsg;
      try {
        const child = exec(cmd, { timeout: 2000, windowsHide: true }, (error) => {
          if (error && !error.killed) {
            this.lastResponse = failMsg;
          }
        });
        if (child && typeof child.unref === 'function') {
          child.unref();
        }
        resolve();
      } catch (_) {
        this.lastResponse = failMsg;
        resolve();
      }
    });
  }

  async run(action, text) {
    // Edge case: validate inputs
    if (!action || typeof action !== 'string') {
      this.lastResponse = 'Invalid action provided';
      return;
    }

    text = text || '';

    try {
      switch (action) {
        case 'greeting':
          this.lastResponse = "Hello! I'm listening. What can I do for you?";
          break;

        case 'time':
          this.lastResponse = `The time is ${new Date().toLocaleTimeString()}`;
          break;

        case 'get_volume': {
          let vol = null;
          try {
            const scriptPath = path.join(process.cwd(), 'scripts', 'get_system_volume.ps1');
            if (fs.existsSync(scriptPath)) {
              const out = execSync(`powershell -NoProfile -ExecutionPolicy Bypass -File "${scriptPath}"`, { timeout: 3500 }).toString().trim();
              const num = parseInt(out, 10);
              if (!isNaN(num) && num >= 0 && num <= 100) {
                vol = `${num}%`;
              }
            }
          } catch (_) {}

          this.lastResponse = vol
            ? `The current system volume is ${vol}`
            : 'I was unable to read the current volume just now.';
          break;
        }

        case 'get_brightness': {
          let brightness = null;
          try {
            const scriptPath = path.join(process.cwd(), 'scripts', 'get_system_brightness.ps1');
            if (fs.existsSync(scriptPath)) {
              const out = execSync(`powershell -NoProfile -ExecutionPolicy Bypass -File "${scriptPath}"`, { timeout: 3500 }).toString().trim();
              const num = parseInt(out, 10);
              if (!isNaN(num) && num >= 0 && num <= 100) {
                brightness = `${num}%`;
              }
            }
          } catch (_) {}

          this.lastResponse = brightness
            ? `The current screen brightness is ${brightness}`
            : 'I was unable to read the screen brightness just now.';
          break;
        }

        case 'date':
          this.lastResponse = `Today is ${new Date().toLocaleDateString()}`;
          break;

        case 'open_chrome':
          await this._execCommand('start chrome', 'Opening Chrome', "I wasn't able to open Chrome just now.");
          break;

        case 'open_notepad':
          await this._execCommand('start notepad', 'Opening Notepad', "I wasn't able to open Notepad just now.");
          break;

        case 'open_calculator':
          await this._execCommand('start calc', 'Opening Calculator', "I wasn't able to open Calculator just now.");
          break;

        case 'open_explorer':
          await this._execCommand('explorer', 'Opening File Explorer', "I wasn't able to open File Explorer just now.");
          break;

        case 'open_settings':
          await this._execCommand('start ms-settings:', 'Opening Settings', "I wasn't able to open Settings just now.");
          break;

        case 'open_cmd':
          await this._execCommand('start cmd', 'Opening Command Prompt', "I wasn't able to open Command Prompt just now.");
          break;

        case 'open_powershell':
          await this._execCommand('start powershell', 'Opening PowerShell', "I wasn't able to open PowerShell just now.");
          break;

        case 'open_taskmanager':
          await this._execCommand('taskmgr', 'Opening Task Manager', "I wasn't able to open Task Manager just now.");
          break;

        case 'open_control_panel':
          await this._execCommand('control', 'Opening Control Panel', "I wasn't able to open Control Panel just now.");
          break;

        case 'open_outlook':
          await this._execCommand('start outlook:', 'Opening Outlook', "I wasn't able to open Outlook just now.");
          break;

        case 'open_gmail':
          await this._execCommand('start https://gmail.com', 'Opening Gmail', "I wasn't able to open Gmail just now.");
          break;

        case 'open_discord':
          await this._execCommand('start https://discord.com/app', 'Opening Discord', "I wasn't able to open Discord just now.");
          break;

        case 'open_teams':
          await this._execCommand('start msteams:', 'Opening Teams', "I wasn't able to open Teams just now.");
          break;

        case 'open_whatsapp':
          await this._execCommand('start https://web.whatsapp.com', 'Opening WhatsApp', "I wasn't able to open WhatsApp just now.");
          break;

        case 'open_facebook':
          await this._execCommand('start https://facebook.com', 'Opening Facebook', "I wasn't able to open Facebook just now.");
          break;

        case 'open_twitter':
          await this._execCommand('start https://twitter.com', 'Opening Twitter', "I wasn't able to open Twitter just now.");
          break;

        case 'open_instagram':
          await this._execCommand('start https://instagram.com', 'Opening Instagram', "I wasn't able to open Instagram just now.");
          break;

        case 'open_linkedin':
          await this._execCommand('start https://linkedin.com', 'Opening LinkedIn', "I wasn't able to open LinkedIn just now.");
          break;

        case 'open_reddit':
          await this._execCommand('start https://reddit.com', 'Opening Reddit', "I wasn't able to open Reddit just now.");
          break;

        case 'open_youtube':
          await this._execCommand('start https://youtube.com', 'Opening YouTube', "I wasn't able to open YouTube just now.");
          break;

        case 'open_google':
          await this._execCommand('start https://google.com', 'Opening Google', "I wasn't able to open Google just now.");
          break;

        case 'open_netflix':
          await this._execCommand('start https://netflix.com', 'Opening Netflix', "I wasn't able to open Netflix just now.");
          break;

        case 'open_spotify':
          await this._execCommand('start spotify:', 'Opening Spotify', "I wasn't able to open Spotify just now.");
          break;

        case 'open_prime':
          await this._execCommand('start https://www.amazon.com/primevideo', 'Opening Prime Video', "I wasn't able to open Prime Video just now.");
          break;

        case 'open_steam':
          await this._execCommand('start steam://open/main', 'Opening Steam', "I wasn't able to open Steam just now.");
          break;

        case 'open_word':
          await this._execCommand('start winword', 'Opening Word', "I wasn't able to open Word just now.");
          break;

        case 'open_excel':
          await this._execCommand('start excel', 'Opening Excel', "I wasn't able to open Excel just now.");
          break;

        case 'open_powerpoint':
          await this._execCommand('start powerpnt', 'Opening PowerPoint', "I wasn't able to open PowerPoint just now.");
          break;

        case 'open_paint':
          await this._execCommand('mspaint', 'Opening Paint', "I wasn't able to open Paint just now.");
          break;

        case 'open_vscode':
          await this._execCommand('code', 'Opening VS Code', "I wasn't able to open VS Code just now.");
          break;

        case 'open_github':
          await this._execCommand('start https://github.com', 'Opening GitHub', "I wasn't able to open GitHub just now.");
          break;

        case 'open_downloads':
          await this._execCommand('explorer %USERPROFILE%\\Downloads', 'Opening Downloads', "I wasn't able to open Downloads just now.");
          break;

        case 'open_documents':
          await this._execCommand('explorer %USERPROFILE%\\Documents', 'Opening Documents', "I wasn't able to open Documents just now.");
          break;

        case 'open_desktop':
          await this._execCommand('explorer %USERPROFILE%\\Desktop', 'Opening Desktop', "I wasn't able to open Desktop just now.");
          break;

        case 'open_pictures':
          await this._execCommand('explorer %USERPROFILE%\\Pictures', 'Opening Pictures', "I wasn't able to open Pictures just now.");
          break;

        case 'volume_up':
          this.execPowershell('(New-Object -comObject WScript.Shell).SendKeys([char]175)');
          this.lastResponse = 'Volume up';
          break;

        case 'volume_down':
          this.execPowershell('(New-Object -comObject WScript.Shell).SendKeys([char]174)');
          this.lastResponse = 'Volume down';
          break;

        case 'mute':
          this.execPowershell('(New-Object -comObject WScript.Shell).SendKeys([char]173)');
          this.lastResponse = 'Mute toggled';
          break;

        case 'volume_app_up':
          this.execPowershell('(New-Object -comObject WScript.Shell).SendKeys([char]175)');
          this.lastResponse = 'App volume up';
          break;

        case 'volume_app_down':
          this.execPowershell('(New-Object -comObject WScript.Shell).SendKeys([char]174)');
          this.lastResponse = 'App volume down';
          break;

        case 'youtube_play_pause':
          this.execPowershell('(New-Object -comObject WScript.Shell).SendKeys([char]179)');
          this.lastResponse = 'Toggled media playback';
          break;

        case 'youtube_next':
          this.execPowershell('(New-Object -comObject WScript.Shell).SendKeys([char]176)');
          this.lastResponse = 'Skipped to next media track';
          break;

        case 'youtube_mute':
          this.execPowershell('(New-Object -comObject WScript.Shell).SendKeys([char]173)');
          this.lastResponse = 'Toggled media audio mute';
          break;

        case 'visual_context': {
          try {
            const { VisionProvider } = await import('./src/vision.js');
            const vision = new VisionProvider();
            const ctx = await vision.getVisualContext();
            this.lastResponse = ctx.text || 'I checked your active screen and tabs, Sir.';
          } catch (_) {
            this.lastResponse = 'I was unable to inspect the visual context at this moment, Sir.';
          }
          break;
        }

        case 'lock':
          await this._execCommand('rundll32.exe user32.dll,LockWorkStation', 'Locking screen', 'Failed to lock workstation');
          break;

        case 'sleep':
          await this._execCommand('rundll32.exe powrprof.dll,SetSuspendState 0,1,0', 'Putting computer to sleep', 'Failed to initiate sleep');
          break;

        case 'shutdown':
          await this._execCommand('shutdown /s /t 10', 'Shutting down in 10 seconds', 'Failed to schedule shutdown');
          break;

        case 'close_chrome':
          await this._execCommand('taskkill /IM chrome.exe /F', 'Closing Chrome', "Chrome doesn't appear to be running.");
          break;

        case 'close_notepad':
          await this._execCommand('taskkill /IM notepad.exe /F', 'Closing Notepad', "Notepad doesn't appear to be running.");
          break;

        case 'close_app':
        case 'close_window':
          this.execPowershell('(New-Object -comObject WScript.Shell).SendKeys("%{F4}")');
          this.lastResponse = 'Closing active window';
          break;

        case 'set_volume': {
          const matchVol = text.match(/(\d{1,3})\s*(?:%|percent)?/i);
          const percent = matchVol ? Math.min(100, Math.max(0, parseInt(matchVol[1], 10))) : 50;
          const upSteps = Math.round(percent / 2);
          const script = `$w = New-Object -comObject WScript.Shell; 1..50 | ForEach-Object { $w.SendKeys([char]174) }; 1..${upSteps} | ForEach-Object { $w.SendKeys([char]175) }`;
          this.execPowershell(script);
          this.lastResponse = `Volume set to ${percent} percent`;
          break;
        }

        case 'delete_file': {
          let targetPath = null;
          const userProfile = process.env.USERPROFILE || 'C:\\Users\\Default';
          const allowedDirs = [
            path.join(userProfile, 'Desktop'),
            path.join(userProfile, 'Downloads'),
            path.join(userProfile, 'Documents')
          ];

          const desktopMatch = text.match(/delete\s+(?:the|this|that\s+)?(?:file\s+)?([a-zA-Z0-9_\-\.]+)\s+(?:from|on)\s+(?:my\s+)?desktop/i);
          if (desktopMatch) {
            const fileName = desktopMatch[1];
            targetPath = path.join(userProfile, 'Desktop', fileName);
          } else {
            const genericMatch = text.match(/delete\s+(?:the|this|that\s+)?(?:file\s+)?([a-zA-Z0-9_\-\.]+)/i);
            if (genericMatch) {
              const fileName = genericMatch[1];
              for (const dir of allowedDirs) {
                const candidate = path.join(dir, fileName);
                if (fs.existsSync(candidate)) {
                  targetPath = candidate;
                  break;
                }
              }
              if (!targetPath) {
                targetPath = path.join(userProfile, 'Desktop', fileName);
              }
            }
          }

          const isAllowed = targetPath && allowedDirs.some(dir => targetPath.startsWith(dir));
          if (!isAllowed) {
            this.lastResponse = 'Deletion is only permitted within Desktop, Downloads, or Documents for system safety.';
            break;
          }

          if (targetPath && fs.existsSync(targetPath)) {
            try {
              fs.unlinkSync(targetPath);
              this.lastResponse = `Deleted file ${targetPath}`;
            } catch (err) {
              this.lastResponse = `Failed to delete file: ${err.message}`;
            }
          } else if (targetPath) {
            this.lastResponse = `File not found: ${targetPath}`;
          } else {
            this.lastResponse = 'No file specified for deletion';
          }
          break;
        }

        case 'restart':
          await this._execCommand('shutdown /r /t 10', 'Restarting in 10 seconds', 'Failed to schedule restart');
          break;

        case 'maximize':
          this.execPowershell('(New-Object -comObject WScript.Shell).SendKeys("% x")');
          this.lastResponse = 'Maximizing window';
          break;

        case 'minimize':
          this.execPowershell('(New-Object -comObject WScript.Shell).SendKeys("%(SPACE)n")');
          this.lastResponse = 'Minimizing window';
          break;

        case 'switch_tab':
          this.execPowershell('(New-Object -comObject WScript.Shell).SendKeys("^{TAB}")');
          this.lastResponse = 'Switched to next tab';
          break;


        case 'previous_tab':
          this.execPowershell('(New-Object -comObject WScript.Shell).SendKeys(^+{TAB})');
          this.lastResponse = 'Switched to previous tab';
          break;

        case 'create_file':
          try {
            const filename = `voice_file_${Date.now()}.txt`;
            fs.writeFileSync(filename, 'Created by voice command\n');
            exec(`notepad ${filename}`);
            this.lastResponse = 'File created';
          } catch (err) {
            console.error('Failed to create file:', err.message);
            this.lastResponse = 'Failed to create file';
          }
          break;

        case 'create_folder':
          try {
            const foldername = `voice_folder_${Date.now()}`;
            fs.mkdirSync(foldername);
            exec(`explorer ${foldername}`);
            this.lastResponse = 'Folder created';
          } catch (err) {
            console.error('Failed to create folder:', err.message);
            this.lastResponse = 'Failed to create folder';
          }
          break;

        case 'write_email':
          this.writeEmail();
          this.lastResponse = 'Email draft created';
          break;

        case 'joke':
          const jokes = [
            "Why don't scientists trust atoms? Because they make up everything!",
            "Why did the robot cross the road? It was programmed to!",
            "I told my computer a joke about UDP, but I'm not sure if it got it!",
            "Why do programmers prefer dark mode? Because light attracts bugs!"
          ];
          this.lastResponse = jokes[Math.floor(Math.random() * jokes.length)];
          break;

        case 'thanks':
          this.lastResponse = "You're very welcome!";
          break;

        case 'test_speech':
          this.lastResponse = 'Speech test completed';
          break;

        case 'sleep_assistant':
          this.lastResponse = 'Going to sleep';
          break;

        case 'repeat':
          this.lastResponse = this.lastResponse || 'Nothing to repeat yet';
          break;

        case 'help':
          this.showHelp();
          this.lastResponse = 'Help displayed';
          break;

        default:
          this.lastResponse = `I heard "${text}" but I don't understand that command. Type "help" for options.`;
          console.warn(`[Executor:unknownAction] Unmatched action code: "${action}" (text: "${text}")`);
      }
    } catch (err) {
      console.error('❌ Executor error:', err.message);
      this.lastResponse = 'An error occurred while executing the command.';
    }
  }

  execPowershell(command) {
    // Edge case: validate command
    if (!command || typeof command !== 'string') {
      console.error('Invalid PowerShell command');
      return;
    }

    // Escape double quotes and wrap command safely
    const escaped = command.replace(/"/g, '\\"');
    exec(`powershell -c "${escaped}"`, (error) => {
      if (error) {
        console.error('PowerShell execution error:', error.message);
      }
    });
  }

  writeEmail() {
    try {
      const template = `Voice Email Draft
Created: ${new Date().toLocaleString()}

Subject: [Voice Created Email]

Dear [Recipient],

[Your email content here]

Best regards,
[Your name]

---
This email was created using voice commands.`;
      const filename = `voice_email_${Date.now()}.txt`;
      fs.writeFileSync(filename, template);
      exec(`notepad ${filename}`, (error) => {
        if (error) {
          console.error('Failed to open notepad:', error.message);
        }
      });
    } catch (err) {
      console.error('Failed to create email:', err.message);
    }
  }

  showHelp() {
    console.log('\n=== AVAILABLE COMMANDS ===');
    console.log('Applications: open chrome, notepad, calculator, file explorer, settings, cmd, powershell, task manager');
    console.log('Web: open youtube, google, github, gmail, outlook, discord, teams, whatsapp, facebook, twitter, instagram, linkedin, reddit, netflix, spotify, prime, steam');
    console.log('Office: open word, excel, powerpoint, paint, vs code');
    console.log('System: volume up, volume down, mute, lock, sleep, shutdown, restart, maximize, minimize');
    console.log('Files: create file, create folder, open downloads, open documents, open desktop, open pictures');
    console.log('Tabs: switch tab, previous tab');
    console.log('Fun: tell me a joke');
    console.log('Control: help, sleep now, thank you, repeat');
    console.log('=========================\n');
  }
}

export default Executor;
