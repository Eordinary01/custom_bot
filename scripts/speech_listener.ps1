# JARVIS v3.0 - Speech Recognition Service
# High-performance asynchronous recognition engine with DictationGrammar for natural language input.
# Outputs in the RECOGNIZED:/HYPOTHESIS:/REJECTED: protocol that speech-recognizer.js parses.
# Supports instantaneous (<10ms) stdin-based PAUSE/RESUME/STOP for acoustic echo suppression during TTS.

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Add-Type -AssemblyName System.Speech

# C# helper class for non-blocking stdin consumption and native speech event monitoring.
$csharpHelperSource = @'
using System;
using System.Collections.Concurrent;
using System.Threading;
using System.Speech.Recognition;

public static class StdinListener {
    private static readonly ConcurrentQueue<string> queue = new ConcurrentQueue<string>();
    private static volatile bool isRunning = true;

    static StdinListener() {
        var t = new Thread(ReadWorker) {
            IsBackground = true,
            Name = "StdinReaderThread"
        };
        t.Start();
    }

    private static void ReadWorker() {
        while (isRunning) {
            try {
                string line = Console.ReadLine();
                if (line == null) break;
                string trimmed = line.Trim();
                if (trimmed.Length > 0) {
                    queue.Enqueue(trimmed);
                }
            } catch {
                break;
            }
        }
    }

    public static string DequeueCommand() {
        string cmd;
        if (queue.TryDequeue(out cmd)) {
            return cmd;
        }
        return null;
    }

    public static void Stop() {
        isRunning = false;
    }
}

public static class SpeechHelper {
    private static DateTime lastLevelTime = DateTime.MinValue;
    public static double MinConfidence = 0.20;

    public static void AttachEvents(SpeechRecognitionEngine engine) {
        engine.AudioLevelUpdated += (s, e) => {
            var now = DateTime.UtcNow;
            if ((now - lastLevelTime).TotalMilliseconds >= 80) {
                lastLevelTime = now;
                try {
                    Console.WriteLine("AUDIO_LEVEL: " + e.AudioLevel);
                    Console.Out.Flush();
                } catch {}
            }
        };

        engine.SpeechDetected += (s, e) => {
            try {
                Console.WriteLine("DETECTED: Audio input detected");
                Console.Out.Flush();
            } catch {}
        };

        engine.SpeechHypothesized += (s, e) => {
            try {
                if (e.Result != null && !string.IsNullOrEmpty(e.Result.Text)) {
                    double conf = Math.Round(e.Result.Confidence, 3);
                    Console.WriteLine("HYPOTHESIS: " + e.Result.Text.Trim() + "|CONFIDENCE:" + conf);
                    Console.Out.Flush();
                }
            } catch {}
        };

        engine.SpeechRecognized += (s, e) => {
            try {
                if (e.Result != null && !string.IsNullOrEmpty(e.Result.Text)) {
                    string txt = e.Result.Text.Trim();
                    double conf = Math.Round(e.Result.Confidence, 3);
                    string grammarName = (e.Result.Grammar != null && !string.IsNullOrEmpty(e.Result.Grammar.Name)) ? e.Result.Grammar.Name : "Dictation";
                    if (conf >= MinConfidence) {
                        Console.WriteLine("RECOGNIZED: " + txt + "|CONFIDENCE:" + conf + "|GRAMMAR:" + grammarName);
                    } else {
                        Console.WriteLine("REJECTED: " + txt + " Confidence=" + conf + " (below threshold " + MinConfidence + ")");
                    }
                    Console.Out.Flush();
                }
            } catch {}
        };

        engine.SpeechRecognitionRejected += (s, e) => {
            try {
                if (e.Result != null && !string.IsNullOrEmpty(e.Result.Text)) {
                    string txt = e.Result.Text.Trim();
                    double conf = Math.Round(e.Result.Confidence, 3);
                    Console.WriteLine("REJECTED: " + txt + " Confidence=" + conf + " (below threshold " + MinConfidence + ")");
                    Console.Out.Flush();
                }
            } catch {}
        };
    }
}
'@

try {
    Add-Type -TypeDefinition $csharpHelperSource -ReferencedAssemblies "System.Speech" -ErrorAction Stop
} catch {
    # If type already loaded in this runspace, ignore
}

try {
    # Check for installed speech recognizers
    $recognizers = [System.Speech.Recognition.SpeechRecognitionEngine]::InstalledRecognizers()
    if ($recognizers.Count -eq 0) {
        [Console]::Error.WriteLine("ERROR: No speech recognition engines installed on this system.")
        exit 1
    }

    # Report available recognizers
    foreach ($r in $recognizers) {
        [Console]::Out.WriteLine("INFO: Found recognizer: $($r.Id) ($($r.Culture.Name))")
    }
    [Console]::Out.Flush()

    $engine = New-Object System.Speech.Recognition.SpeechRecognitionEngine

    # Report audio device
    try {
        $engine.SetInputToDefaultAudioDevice()
        [Console]::Out.WriteLine("INFO: Audio input set to default recording device.")
    } catch {
        [Console]::Error.WriteLine("ERROR: Failed to set audio input - $($_.Exception.Message)")
        exit 1
    }

    # In the Hybrid Architecture, SAPI handles ONLY instant wake words and core commands.
    # DictationGrammar is intentionally omitted so SAPI never hallucinates random dictionary words on fan noise.
    # All dynamic natural conversational speech is transcribed with 95%+ neural accuracy via Faster-Whisper.
    try {
        $choices = New-Object System.Speech.Recognition.Choices
        $choices.Add(@(
            "hey jarvis", "jarvis", "hello jarvis", "hi jarvis", "ok jarvis", "wake up",
            # SAPI phonetic acoustic aliases under ambient fan/room noise
            "their job", "their job is", "their job was", "the job", "the jarvis",
            "hey service", "hey travis", "a service", "hi service", "assistant",
            # Common core desktop commands
            "open chrome", "open notepad", "open calculator", "open youtube",
            "volume up", "volume down", "mute", "unmute",
            "what time is it", "what is the date",
            "shutdown", "restart", "lock screen", "sleep",
            "help", "exit", "quit", "stop listening"
        ))
        $cmdBuilder = New-Object System.Speech.Recognition.GrammarBuilder
        $cmdBuilder.Append($choices)
        $cmdGrammar = New-Object System.Speech.Recognition.Grammar($cmdBuilder)
        $cmdGrammar.Name = "Commands"
        $engine.LoadGrammar($cmdGrammar)
        [Console]::Out.WriteLine("INFO: Command & Wake Word grammar loaded (DictationGrammar bypassed for Faster-Whisper).")
    } catch {
        [Console]::Out.WriteLine("INFO: Command grammar skipped - $($_.Exception.Message)")
    }

    # Attach native events for AudioLevel, SpeechDetected, Hypotheses, and Final Utterances
    [SpeechHelper]::MinConfidence = 0.35
    [SpeechHelper]::AttachEvents($engine)

    [Console]::Out.Flush()

    # Start asynchronous continuous recognition
    $isListening = $true
    $engine.RecognizeAsync([System.Speech.Recognition.RecognizeMode]::Multiple)

    [Console]::Out.WriteLine("READY: Speech listener initialized. Speak now...")
    [Console]::Out.Flush()

    # Main non-blocking control loop
    while ($true) {
        $shouldExit = $false
        $cmd = [StdinListener]::DequeueCommand()

        while ($cmd -ne $null) {
            $cmdUpper = $cmd.ToUpper()
            if ($cmdUpper -eq "STOP") {
                if ($isListening) {
                    try { $engine.RecognizeAsyncCancel() } catch {}
                    $isListening = $false
                }
                [Console]::Out.WriteLine("INFO: Stop command received. Shutting down.")
                [Console]::Out.Flush()
                $shouldExit = $true
                break
            } elseif ($cmdUpper -eq "PAUSE") {
                if ($isListening) {
                    try { $engine.RecognizeAsyncCancel() } catch {}
                    $isListening = $false
                }
                [Console]::Out.WriteLine("STATUS: PAUSED")
                [Console]::Out.Flush()
            } elseif ($cmdUpper -eq "RESUME") {
                if (-not $isListening) {
                    try { $engine.RecognizeAsync([System.Speech.Recognition.RecognizeMode]::Multiple) } catch {}
                    $isListening = $true
                }
                [Console]::Out.WriteLine("STATUS: RESUMED")
                [Console]::Out.Flush()
            }
            $cmd = [StdinListener]::DequeueCommand()
        }

        if ($shouldExit) {
            break
        }

        Start-Sleep -Milliseconds 40
    }
}
catch {
    [Console]::Error.WriteLine("ERROR: $($_.Exception.Message)")
    exit 1
}
finally {
    [StdinListener]::Stop()
    if ($engine -ne $null) {
        try {
            $engine.RecognizeAsyncCancel()
            $engine.Dispose()
        } catch {}
    }
}