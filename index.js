import fs from "fs";
import { exec, spawn } from "child_process";
import dotenv from "dotenv";
import path from "path";

dotenv.config();

class RealVoiceAssistant {
  constructor() {
    this.isListening = false;
    this.isAwake = false;
    this.speechProcess = null;
    this.wakeWords = [
      "hey bot",
      "hello bot",
      "wake up",
      "computer",
      "assistant",
    ];
    this.commands = this.initializeCommands();
    this.isProcessingCommand = false;
    this.speechRetries = 0;
    this.maxSpeechRetries = 3;
  }

  initializeCommands() {
    return [
      // Basic commands
      {
        patterns: ["hello", "hi", "hey"],
        action: "greeting",
        response: "Hello! I'm listening. What can I do for you?",
      },
      { patterns: ["time", "what time"], action: "time" },
      { patterns: ["date", "what date", "today"], action: "date" },

      // Application commands
      {
        patterns: ["open chrome", "start chrome", "launch chrome"],
        action: "open_chrome",
      },
      { patterns: ["open notepad", "start notepad"], action: "open_notepad" },
      {
        patterns: ["open calculator", "calculator"],
        action: "open_calculator",
      },
      {
        patterns: ["open file explorer", "file explorer", "files"],
        action: "open_explorer",
      },
      { patterns: ["open control panel"], action: "open_control_panel" },
      {
        patterns: ["open command prompt", "command prompt", "cmd"],
        action: "open_cmd",
      },
      { patterns: ["open powershell"], action: "open_powershell" },
      { patterns: ["task manager"], action: "open_taskmanager" },
      { patterns: ["open settings", "settings"], action: "open_settings" },

      // Email and communication
      {
        patterns: ["write email", "compose email", "new email"],
        action: "write_email",
      },
      { patterns: ["open outlook"], action: "open_outlook" },
      { patterns: ["open gmail"], action: "open_gmail" },
      { patterns: ["open discord"], action: "open_discord" },
      { patterns: ["open teams"], action: "open_teams" },
      { patterns: ["open whatsapp"], action: "open_whatsapp" },

      // System commands
      { patterns: ["shutdown", "shut down"], action: "shutdown" },
      { patterns: ["restart", "reboot"], action: "restart" },
      { patterns: ["lock screen", "lock computer"], action: "lock" },
      { patterns: ["sleep", "hibernate"], action: "sleep" },
      { patterns: ["volume up", "increase volume"], action: "volume_up" },
      { patterns: ["volume down", "decrease volume"], action: "volume_down" },
      { patterns: ["mute", "unmute"], action: "mute" },
      { patterns: ["maximize window"], action: "maximize" },
      { patterns: ["minimize window"], action: "minimize" },

      // File operations
      { patterns: ["create file", "new file"], action: "create_file" },
      { patterns: ["create folder", "new folder"], action: "create_folder" },
      { patterns: ["open downloads"], action: "open_downloads" },
      { patterns: ["open documents"], action: "open_documents" },
      { patterns: ["open desktop"], action: "open_desktop" },
      { patterns: ["open pictures"], action: "open_pictures" },

      // Web browsing
      { patterns: ["open youtube", "youtube"], action: "open_youtube" },
      { patterns: ["open google", "search google"], action: "open_google" },
      { patterns: ["open facebook"], action: "open_facebook" },
      { patterns: ["open twitter"], action: "open_twitter" },
      { patterns: ["open instagram"], action: "open_instagram" },
      { patterns: ["open linkedin"], action: "open_linkedin" },
      { patterns: ["open reddit"], action: "open_reddit" },

      // Entertainment
      { patterns: ["play music", "open spotify"], action: "open_spotify" },
      { patterns: ["open netflix"], action: "open_netflix" },
      { patterns: ["open amazon prime", "prime video"], action: "open_prime" },
      { patterns: ["tell joke", "joke"], action: "joke" },
      { patterns: ["play game", "open steam"], action: "open_steam" },

      // Productivity
      { patterns: ["open word", "microsoft word"], action: "open_word" },
      { patterns: ["open excel", "microsoft excel"], action: "open_excel" },
      { patterns: ["open powerpoint"], action: "open_powerpoint" },
      { patterns: ["open paint"], action: "open_paint" },
      {
        patterns: ["open visual studio code", "vs code"],
        action: "open_vscode",
      },

      // Assistant control
      {
        patterns: ["sleep now", "go to sleep", "stop listening"],
        action: "sleep_assistant",
      },
      {
        patterns: ["thank you", "thanks"],
        action: "thanks",
        response: "You're welcome! I'm here whenever you need me.",
      },
      { patterns: ["what can you do", "help", "commands"], action: "help" },
      { patterns: ["repeat", "say that again"], action: "repeat" },
      { patterns: ["test speech", "test voice"], action: "test_speech" },

      // custom
      { patterns: ["open github", "github"], action: "open_github" },
    ];
  }

  // Test speech recognition availability
  async testSpeechAvailability() {
    console.log("🔍 Testing Speech Recognition availability...");

    return new Promise((resolve) => {
      const testScript = `
      try {
        Add-Type -AssemblyName System.Speech
        Write-Host "✅ System.Speech assembly loaded"
        
        $engine = New-Object System.Speech.Recognition.SpeechRecognitionEngine
        Write-Host "✅ SpeechRecognitionEngine created"
        
        $recognizers = [System.Speech.Recognition.SpeechRecognitionEngine]::InstalledRecognizers()
        Write-Host "Available recognizers: $($recognizers.Count)"
        
        foreach($r in $recognizers) {
          Write-Host "  - $($r.Culture.Name): $($r.Description)"
        }
        
        $engine.SetInputToDefaultAudioDevice()
        Write-Host "✅ Audio input configured"
        $engine.Dispose()
        
        Write-Host "SPEECH_TEST_PASSED"
      }
      catch {
        Write-Host "❌ Speech Recognition Error: $($_.Exception.Message)"
        Write-Host "SPEECH_TEST_FAILED"
      }
      `;

      const testProcess = spawn("powershell", ["-Command", testScript], {
        stdio: ["inherit", "pipe", "pipe"],
      });

      let testResult = false;

      testProcess.stdout.on("data", (data) => {
        const output = data.toString();
        console.log(output.trim());

        if (output.includes("SPEECH_TEST_PASSED")) {
          testResult = true;
        } else if (output.includes("SPEECH_TEST_FAILED")) {
          testResult = false;
        }
      });

      testProcess.on("close", () => {
        resolve(testResult);
      });
    });
  }

  // Start the voice assistant with real speech recognition
  async start() {
    console.log("🤖 Real Voice Assistant Starting...");
    console.log("================================================");
    console.log("🎤 Using Windows Speech Recognition Engine");
    console.log(`🔥 Wake words: ${this.wakeWords.join(", ")}`);
    console.log("⚡ Starting continuous speech recognition...");
    console.log("================================================\n");

    // Test speech recognition first
    const speechAvailable = await this.testSpeechAvailability();

    if (speechAvailable) {
      console.log(
        "✅ Speech Recognition is available! Starting voice listening...\n",
      );
      this.startContinuousListening();
    } else {
      console.log(
        "❌ Speech Recognition not available. Running in text-only mode...\n",
      );
      console.log("💡 To enable speech recognition:");
      console.log(
        "   1. Enable 'Speech Recognition' in Windows accessibility settings",
      );
      console.log("   2. Download speech language pack if prompted");
      console.log("   3. Restart the application\n");
    }

    // Always provide text input as fallback
    this.setupFallbackInput();
  }


  // Start continuous speech recognition
  startContinuousListening() {
    console.log("👂 Starting speech recognition...\n");

    // Create a temporary PowerShell script file
    const psScriptPath = path.join(process.cwd(), "speech_recognition.ps1");

    // FIXED: Use synchronous recognition with timeout and better debugging
    const psScript = `
Add-Type -AssemblyName System.Speech

try {
    Write-Host "INIT: Speech recognition starting..."
    Write-Host "DEBUG: Loading System.Speech assembly..."
    
    $speechEngine = New-Object System.Speech.Recognition.SpeechRecognitionEngine
    Write-Host "DEBUG: SpeechRecognitionEngine created"
    
    # Check available recognizers
    $recognizers = [System.Speech.Recognition.SpeechRecognitionEngine]::InstalledRecognizers()
    Write-Host "DEBUG: Found $($recognizers.Count) speech recognizer(s)"
    foreach($r in $recognizers) {
        Write-Host "DEBUG: Recognizer - Culture: $($r.Culture.Name), Name: $($r.Name)"
    }
    
    # Create grammar with ALL command patterns from index.js
    Write-Host "DEBUG: Creating grammar with command phrases..."
    $choices = New-Object System.Speech.Recognition.Choices
    $choices.Add(@(
        "hey bot", "hello bot", "wake up", "computer", "assistant",
        "hello", "hi", "hey", "time", "what time", "date", "what date", "today",
        "open chrome", "start chrome", "launch chrome", "open notepad", "start notepad",
        "open calculator", "calculator", "open file explorer", "file explorer", "files",
        "open control panel", "open command prompt", "command prompt", "cmd",
        "open powershell", "task manager", "open settings", "settings",
        "write email", "compose email", "new email", "open outlook", "open gmail",
        "open discord", "open teams", "open whatsapp",
        "shutdown", "shut down", "restart", "reboot", "lock screen", "lock computer",
        "sleep", "hibernate", "sleep now", "go to sleep", "stop listening",
        "volume up", "increase volume", "volume down", "decrease volume", "mute", "unmute",
        "maximize window", "minimize window",
        "create file", "new file", "create folder", "new folder",
        "open downloads", "open documents", "open desktop", "open pictures",
        "open youtube", "youtube", "open google", "search google",
        "open facebook", "open twitter", "open instagram", "open linkedin", "open reddit",
        "play music", "open spotify", "open netflix", "open amazon prime", "prime video",
        "tell joke", "joke", "play game", "open steam",
        "open word", "microsoft word", "open excel", "microsoft excel", "open powerpoint",
        "open paint", "open visual studio code", "vs code", "open github", "github",
        "thank you", "thanks", "what can you do", "help", "commands",
        "repeat", "say that again", "test speech", "test voice"
    ))
    
    $grammarBuilder = New-Object System.Speech.Recognition.GrammarBuilder
    $grammarBuilder.Append($choices)
    $grammar = New-Object System.Speech.Recognition.Grammar($grammarBuilder)
    
    Write-Host "DEBUG: Loading grammar into speech engine..."
    $speechEngine.LoadGrammar($grammar)
    
    Write-Host "DEBUG: Setting audio input to default microphone..."
    $speechEngine.SetInputToDefaultAudioDevice()
    
    Write-Host "READY: Listening for commands..."
    Write-Host "READY: Microphone is active - please speak clearly!"
    Write-Host "READY: Try saying: 'hey bot' or 'open calculator'"
    Write-Host "DEBUG: Entering recognition loop..."
    
    $loopCount = 0
    # Use synchronous recognition with timeout
    while($true) {
        $loopCount++
        if ($loopCount % 10 -eq 0) {
            Write-Host "DEBUG: Still listening... (loop iteration: $loopCount)"
        }
        
        # Recognize with 5 second timeout
        $result = $speechEngine.Recognize([TimeSpan]::FromSeconds(5))
        
        if ($result -ne $null) {
            $text = $result.Text
            $confidence = $result.Confidence
            Write-Host "YOU_SAID: $text (confidence: $confidence)"
        }
    }
}
catch {
    Write-Host "ERROR: $($_.Exception.Message)"
    Write-Host "ERROR: Stack trace: $($_.Exception.StackTrace)"
    Write-Host "ERROR: Inner exception: $($_.Exception.InnerException)"
    exit 1
}
finally {
    Write-Host "DEBUG: Cleaning up speech engine..."
    if ($speechEngine -ne $null) {
        $speechEngine.Dispose()
    }
}
`;

    // Write the script to a file with proper encoding
    fs.writeFileSync(psScriptPath, psScript, "utf8");

    console.log(`📝 Created PowerShell script: ${psScriptPath}`);

    // Kill any existing speech process
    if (this.speechProcess) {
      this.speechProcess.kill();
    }

    // Start the PowerShell process with the script file
    this.speechProcess = spawn("powershell.exe", [
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      psScriptPath,
    ]);

    this.speechProcess.stdout.on("data", (data) => {
      const output = data.toString("utf8").trim();
      
      // Split by lines in case multiple messages come at once
      const lines = output.split('\n');
      
      lines.forEach(line => {
        line = line.trim();
        if (!line) return;
        
        if (line.startsWith("YOU_SAID:")) {
          // Extract the spoken text
          const match = line.match(/YOU_SAID:\s*(.+?)\s*\(confidence:/);
          if (match) {
            const recognizedText = match[1];
            console.log(`\n🎤 You said: "${recognizedText}"`);
            this.processSpeechInput(recognizedText);
          }
        } else if (line.startsWith("READY:")) {
          console.log(`✅ ${line.replace("READY:", "").trim()}`);
        } else if (line.startsWith("INIT:")) {
          console.log(`🔄 ${line.replace("INIT:", "").trim()}`);
        } else if (line.startsWith("DEBUG:")) {
          console.log(`🔍 ${line.replace("DEBUG:", "").trim()}`);
        } else if (line.startsWith("ERROR:")) {
          console.log(`❌ ${line.replace("ERROR:", "").trim()}`);
        } else if (line && !line.includes("WARNING")) {
          // Show other output but clean it up
          const cleanOutput = line.replace(/[^\x20-\x7E]/g, "").trim();
          if (cleanOutput) {
            console.log(`📢 ${cleanOutput}`);
          }
        }
      });
    });

    this.speechProcess.stderr.on("data", (data) => {
      const error = data.toString("utf8").trim();
      if (error) {
        // Show all errors for debugging
        console.log(`⚠️ STDERR: ${error}`);
      }
    });

    this.speechProcess.on("close", (code) => {
      console.log(`\n💤 Speech recognition stopped (code: ${code})`);

      if (code !== 0 && this.speechRetries < this.maxSpeechRetries) {
        this.speechRetries++;
        console.log(
          `🔄 Restarting (attempt ${this.speechRetries}/${this.maxSpeechRetries})...`,
        );
        setTimeout(() => this.startContinuousListening(), 2000);
      }
    });
  }

  handleSpeechError() {
    console.log(
      "🔧 Speech recognition encountered an error. Switching to text-only mode.",
    );
    console.log("💡 You can still use text commands by typing them below.\n");
  }

  // Setup fallback text input
  setupFallbackInput() {
    console.log(
      "⌨️  Text input available: Type commands if speech isn't working\n",
    );
    console.log("💡 Try typing: 'hey bot' then 'help'\n");

    process.stdin.setEncoding("utf8");
    process.stdin.on("readable", () => {
      const chunk = process.stdin.read();
      if (chunk !== null) {
        const input = chunk.trim();
        if (input) {
          console.log(`📝 Text input: ${input}`);
          this.processSpeechInput(input);
        }
      }
    });
  }


  // Process speech input (both voice and text)
  processSpeechInput(text) {
    if (this.isProcessingCommand) return;

    const lowerText = text.toLowerCase().trim();
    console.log(`\n🔍 Processing: "${text}"`);

    // Check for wake word
    if (this.isWakeWord(lowerText) && !this.isAwake) {
      console.log("🔥 Wake word detected!");
      this.wakeUp();
      return;
    }

    // If awake, process command
    if (this.isAwake) {
      console.log("⚡ Processing command...");
      this.processCommand(text);
    } else {
      // Check if it's a direct command (bypass wake word)
      const action = this.recognizeCommand(text);
      if (action !== "unknown") {
        console.log("🚀 Direct command detected! Waking up...");
        this.wakeUp();
        setTimeout(() => this.processCommand(text), 500);
      } else {
        console.log(
          `💤 Assistant sleeping. Say a wake word first: ${this.wakeWords.join(", ")}`,
        );
      }
    }
  }

  // Check if input contains wake word
  isWakeWord(input) {
    return this.wakeWords.some((wakeWord) => input.includes(wakeWord));
  }

  // Wake up the assistant
  wakeUp() {
    if (!this.isAwake) {
      this.isAwake = true;
      console.log("\n🔥 ===== ASSISTANT ACTIVATED ===== 🔥");
      console.log("🎤 I'm listening! What can I do for you?");
      console.log("💡 Say your command or 'help' for options");
      console.log("💤 Say 'sleep now' to deactivate\n");

      // Auto-sleep after 45 seconds of inactivity
      this.scheduleAutoSleep();

      // Text-to-speech confirmation (optional)
      this.speak("Assistant activated. How can I help?");
    }
  }

  // Schedule auto-sleep
  scheduleAutoSleep() {
    if (this.sleepTimer) {
      clearTimeout(this.sleepTimer);
    }

    this.sleepTimer = setTimeout(() => {
      if (this.isAwake) {
        console.log("\n😴 Auto-sleeping due to inactivity...");
        this.goToSleep();
      }
    }, 45000); // 45 seconds
  }

  // Put assistant to sleep
  goToSleep() {
    this.isAwake = false;
    if (this.sleepTimer) {
      clearTimeout(this.sleepTimer);
    }
    console.log("😴 Assistant going to sleep...");
    console.log("🔇 Listening for wake words...\n");
    this.speak("Going to sleep");
  }

  // Recognize command - FIXED: Sort patterns by length (longest first) to avoid premature matches
  recognizeCommand(text) {
    const lowerText = text.toLowerCase().trim();

    // Create a sorted list of all patterns with their actions
    const allPatterns = [];
    for (const command of this.commands) {
      for (const pattern of command.patterns) {
        allPatterns.push({ pattern, action: command.action });
      }
    }

    // Sort by pattern length (longest first) to match "sleep now" before "sleep"
    allPatterns.sort((a, b) => b.pattern.length - a.pattern.length);

    // Find the first matching pattern
    for (const { pattern, action } of allPatterns) {
      if (lowerText.includes(pattern)) {
        return action;
      }
    }
    return "unknown";
  }

  // Process and execute commands
  async processCommand(text) {
    if (this.isProcessingCommand) return;

    this.isProcessingCommand = true;
    this.scheduleAutoSleep(); // Reset sleep timer

    const action = this.recognizeCommand(text);
    console.log(`🚀 Executing: ${action}`);

    await this.executeCommand(action, text);

    this.isProcessingCommand = false;
  }

  // Execute the command
  async executeCommand(action, text) {
    try {
      switch (action) {
        case "test_speech":
          console.log("🎤 Testing speech recognition...");
          this.speak(
            "Speech recognition test. If you can hear this, the speech output is working.",
          );
          break;

        case "greeting":
          console.log("🤖 Hello! How can I help you today?");
          this.speak("Hello! How can I help you today?");
          break;

        case "time":
          const time = new Date().toLocaleTimeString();
          console.log(`⏰ Current time: ${time}`);
          this.speak(`The current time is ${time}`);
          break;

        case "date":
          const date = new Date().toLocaleDateString();
          console.log(`📅 Today is: ${date}`);
          this.speak(`Today is ${date}`);
          break;

        case "open_chrome":
          console.log("🌐 Opening Chrome...");
          this.speak("Opening Chrome");
          exec("start chrome");
          break;

        case "open_notepad":
          console.log("📝 Opening Notepad...");
          this.speak("Opening Notepad");
          exec("notepad");
          break;

        case "open_calculator":
          console.log("🔢 Opening Calculator...");
          this.speak("Opening Calculator");
          exec("calc");
          break;

        case "open_explorer":
          console.log("📁 Opening File Explorer...");
          this.speak("Opening File Explorer");
          exec("explorer");
          break;

        case "open_settings":
          console.log("⚙️ Opening Windows Settings...");
          this.speak("Opening Windows Settings");
          exec("start ms-settings:");
          break;

        case "volume_up":
          console.log("🔊 Volume up...");
          this.speak("Volume up");
          exec(
            'powershell -c "(New-Object -comObject WScript.Shell).SendKeys([char]175)"',
          );
          break;

        case "volume_down":
          console.log("🔉 Volume down...");
          this.speak("Volume down");
          exec(
            'powershell -c "(New-Object -comObject WScript.Shell).SendKeys([char]174)"',
          );
          break;

        case "mute":
          console.log("🔇 Toggle mute...");
          this.speak("Mute toggled");
          exec(
            'powershell -c "(New-Object -comObject WScript.Shell).SendKeys([char]173)"',
          );
          break;

        case "lock":
          console.log("🔒 Locking screen...");
          this.speak("Locking screen");
          exec("rundll32.exe user32.dll,LockWorkStation");
          break;

        case "sleep":
          console.log("😴 Putting computer to sleep...");
          this.speak("Putting computer to sleep");
          exec("rundll32.exe powrprof.dll,SetSuspendState 0,1,0");
          break;

        case "shutdown":
          console.log("⚠️ Shutdown in 10 seconds...");
          this.speak("Shutting down computer in 10 seconds");
          exec("shutdown /s /t 10");
          break;

        case "restart":
          console.log("🔄 Restart in 10 seconds...");
          this.speak("Restarting computer in 10 seconds");
          exec("shutdown /r /t 10");
          break;

        case "open_youtube":
          console.log("📺 Opening YouTube...");
          this.speak("Opening YouTube");
          exec("start https://youtube.com");
          break;

        case "open_google":
          console.log("🔍 Opening Google...");
          this.speak("Opening Google");
          exec("start https://google.com");
          break;

        case "open_gmail":
          console.log("📧 Opening Gmail...");
          this.speak("Opening Gmail");
          exec("start https://gmail.com");
          break;

        case "write_email":
          console.log("📧 Opening email composer...");
          this.speak("Opening email composer");
          this.writeEmail();
          break;

        case "joke":
          const jokes = [
            "Why don't scientists trust atoms? Because they make up everything!",
            "Why did the robot cross the road? It was programmed to!",
            "I told my computer a joke about UDP, but I'm not sure if it got it!",
            "Why do programmers prefer dark mode? Because light attracts bugs!",
          ];
          const joke = jokes[Math.floor(Math.random() * jokes.length)];
          console.log(`😄 ${joke}`);
          this.speak(joke);
          break;

        case "help":
          this.showHelp();
          this.speak("Help information displayed");
          break;

        case "sleep_assistant":
          console.log("💤 Going to sleep as requested...");
          this.speak("Going to sleep");
          this.goToSleep();
          break;

        case "thanks":
          console.log("🤖 You're very welcome!");
          this.speak("You're very welcome!");
          break;

        case "open_github":
          console.log("🐙 Opening GitHub...");
          this.speak("Opening GitHub");
          exec("start https://github.com/Eordinary01");
          break;

        case "open_spotify":
          console.log("🎵 Opening Spotify...");
          this.speak("Opening Spotify");
          exec("start spotify:");
          break;

        case "open_vscode":
          console.log("💻 Opening Visual Studio Code...");
          this.speak("Opening Visual Studio Code");
          exec("code");
          break;

        case "open_word":
          console.log("📝 Opening Microsoft Word...");
          this.speak("Opening Microsoft Word");
          exec("start winword");
          break;

        case "open_excel":
          console.log("📊 Opening Microsoft Excel...");
          this.speak("Opening Microsoft Excel");
          exec("start excel");
          break;

        case "open_powerpoint":
          console.log("📊 Opening PowerPoint...");
          this.speak("Opening PowerPoint");
          exec("start powerpnt");
          break;

        case "open_paint":
          console.log("🎨 Opening Paint...");
          this.speak("Opening Paint");
          exec("mspaint");
          break;

        case "open_downloads":
          console.log("📥 Opening Downloads folder...");
          this.speak("Opening Downloads");
          exec("explorer %USERPROFILE%\\Downloads");
          break;

        case "open_documents":
          console.log("📄 Opening Documents folder...");
          this.speak("Opening Documents");
          exec("explorer %USERPROFILE%\\Documents");
          break;

        case "open_desktop":
          console.log("🖥️ Opening Desktop...");
          this.speak("Opening Desktop");
          exec("explorer %USERPROFILE%\\Desktop");
          break;

        case "open_pictures":
          console.log("🖼️ Opening Pictures folder...");
          this.speak("Opening Pictures");
          exec("explorer %USERPROFILE%\\Pictures");
          break;

        case "maximize":
          console.log("⬆️ Maximizing window...");
          this.speak("Maximizing window");
          exec(
            'powershell -c "(New-Object -comObject WScript.Shell).SendKeys({F11})"',
          );
          break;

        case "minimize":
          console.log("⬇️ Minimizing window...");
          this.speak("Minimizing window");
          exec('powershell -c "(New-Object -comObject WScript.Shell).SendKeys(% {SPACE}n)"');
          break;

        case "open_control_panel":
          console.log("⚙️ Opening Control Panel...");
          this.speak("Opening Control Panel");
          exec("control");
          break;

        case "open_cmd":
          console.log("⌨️ Opening Command Prompt...");
          this.speak("Opening Command Prompt");
          exec("start cmd");
          break;

        case "open_powershell":
          console.log("⚡ Opening PowerShell...");
          this.speak("Opening PowerShell");
          exec("start powershell");
          break;

        case "open_taskmanager":
          console.log("📊 Opening Task Manager...");
          this.speak("Opening Task Manager");
          exec("taskmgr");
          break;

        case "open_outlook":
          console.log("📧 Opening Outlook...");
          this.speak("Opening Outlook");
          exec("start outlook:");
          break;

        case "open_discord":
          console.log("💬 Opening Discord...");
          this.speak("Opening Discord");
          exec("start https://discord.com/app");
          break;

        case "open_teams":
          console.log("👥 Opening Teams...");
          this.speak("Opening Teams");
          exec("start msteams:");
          break;

        case "open_whatsapp":
          console.log("💬 Opening WhatsApp...");
          this.speak("Opening WhatsApp");
          exec("start https://web.whatsapp.com");
          break;

        case "open_facebook":
          console.log("👥 Opening Facebook...");
          this.speak("Opening Facebook");
          exec("start https://facebook.com");
          break;

        case "open_twitter":
          console.log("🐦 Opening Twitter...");
          this.speak("Opening Twitter");
          exec("start https://twitter.com");
          break;

        case "open_instagram":
          console.log("📸 Opening Instagram...");
          this.speak("Opening Instagram");
          exec("start https://instagram.com");
          break;

        case "open_linkedin":
          console.log("💼 Opening LinkedIn...");
          this.speak("Opening LinkedIn");
          exec("start https://linkedin.com");
          break;

        case "open_reddit":
          console.log("🔴 Opening Reddit...");
          this.speak("Opening Reddit");
          exec("start https://reddit.com");
          break;

        case "open_netflix":
          console.log("🎬 Opening Netflix...");
          this.speak("Opening Netflix");
          exec("start https://netflix.com");
          break;

        case "open_prime":
          console.log("📺 Opening Amazon Prime Video...");
          this.speak("Opening Amazon Prime Video");
          exec("start https://www.amazon.com/primevideo");
          break;

        case "open_steam":
          console.log("🎮 Opening Steam...");
          this.speak("Opening Steam");
          exec("start steam://open/main");
          break;

        case "create_file":
          console.log("📄 Creating new file...");
          this.speak("Creating new file");
          const filename = `voice_file_${Date.now()}.txt`;
          fs.writeFileSync(filename, "Created by voice command\n");
          exec(`notepad ${filename}`);
          break;

        case "create_folder":
          console.log("📁 Creating new folder...");
          this.speak("Creating new folder");
          const foldername = `voice_folder_${Date.now()}`;
          fs.mkdirSync(foldername);
          exec(`explorer ${foldername}`);
          break;

        case "repeat":
          console.log("🔁 Repeat last response...");
          this.speak("I said: " + (this.lastResponse || "nothing yet"));
          break;

        default:
          console.log(
            `🤔 I heard: "${text}" but I don't understand that command.`,
          );
          this.speak("I don't understand that command. Say help for options.");
      }
    } catch (error) {
      console.error("❌ Error executing command:", error.message);
    }
  }

  // Text-to-speech function
  speak(text) {
    exec(
      `powershell -Command "Add-Type -AssemblyName System.Speech; $synth = New-Object System.Speech.Synthesis.SpeechSynthesizer; $synth.Rate = 0; $synth.Speak('${text.replace(/'/g, "''")}')"`,
      (error) => {
        if (error && error.message.includes("System.Speech")) {
          // Speech synthesis not available, that's fine
        }
      },
    );
  }

  // Write email function
  writeEmail() {
    const emailTemplate = `Voice Email Draft
Created: ${new Date().toLocaleString()}

Subject: [Voice Created Email]

Dear [Recipient],

[Your email content here]

Best regards,
[Your name]

---
This email was created using voice commands.
`;

    const filename = `voice_email_${Date.now()}.txt`;
    fs.writeFileSync(filename, emailTemplate);
    console.log(`✅ Email draft created: ${filename}`);
    exec(`notepad ${filename}`);
  }

  // Show help
  showHelp() {
    console.log("\n🎯 VOICE ASSISTANT COMMANDS:");
    console.log("=============================");
    console.log("🔥 Wake up: hey bot, hello bot, wake up, computer, assistant");
    console.log("\n📱 Applications:");
    console.log("  • 'open chrome/notepad/calculator/file explorer'");
    console.log("  • 'open youtube/google/gmail/settings'");
    console.log("\n💻 System:");
    console.log("  • 'what time is it', 'what date is it'");
    console.log("  • 'volume up/down', 'mute'");
    console.log("  • 'lock screen', 'sleep computer'");
    console.log("  • 'shutdown', 'restart'");
    console.log("\n📧 Communication:");
    console.log("  • 'write email'");
    console.log("\n🎮 Fun:");
    console.log("  • 'tell me a joke'");
    console.log("\n🔧 Testing:");
    console.log("  • 'test speech', 'test voice'");
    console.log("\n💤 Control:");
    console.log("  • 'sleep now', 'help', 'thank you'");
    console.log("=============================\n");
  }

  // Cleanup on exit
  cleanup() {
    if (this.speechProcess) {
      this.speechProcess.kill();
    }
  }
}

// Handle cleanup on exit - FIXED: properly cleanup PowerShell process
process.on("SIGINT", () => {
  console.log("\n👋 Shutting down voice assistant...");
  if (assistant) {
    assistant.cleanup();
  }
  process.exit();
});

// Start the real voice assistant
const assistant = new RealVoiceAssistant();
assistant.start();
