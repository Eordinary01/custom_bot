# JARVIS v3.0 - Legacy Speech Recognition (standalone test script)
# For the primary speech listener used by the application, see scripts/speech_listener.ps1

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Add-Type -AssemblyName System.Speech

try {
    Write-Host "INIT: Speech recognition starting..."

    $speechEngine = New-Object System.Speech.Recognition.SpeechRecognitionEngine

    # Load dictation grammar for free-form natural language recognition
    $dictation = New-Object System.Speech.Recognition.DictationGrammar
    $dictation.Name = "Dictation"
    $speechEngine.LoadGrammar($dictation)

    # Also load command grammar for high-confidence phrase matching
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
    $grammar.Name = "Commands"
    $speechEngine.LoadGrammar($grammar)

    $speechEngine.SetInputToDefaultAudioDevice()

    Write-Host "READY: Listening for commands..."
    Write-Host "Try saying: 'hey bot', 'open calculator', 'what time is it'"

    $timeout = New-Object System.TimeSpan(0, 0, 5)

    while($true) {
        $result = $speechEngine.Recognize($timeout)
        if ($result -ne $null -and $result.Text -and $result.Text.Trim().Length -gt 0) {
            $text = $result.Text
            $confidence = [math]::Round($result.Confidence, 3)
            Write-Host "YOU_SAID: $text (confidence: $confidence)"
        }
    }
}
catch {
    Write-Host "ERROR: $($_.Exception.Message)"
    exit 1
}
finally {
    if ($speechEngine -ne $null) {
        $speechEngine.Dispose()
    }
}
