# Test Windows Speech Recognition Microphone
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Windows Speech Recognition Test" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

try {
    # Step 1: Load System.Speech
    Write-Host "[1/6] Loading System.Speech assembly..." -ForegroundColor Yellow
    Add-Type -AssemblyName System.Speech
    Write-Host "      Success - Assembly loaded" -ForegroundColor Green
    Write-Host ""
    
    # Step 2: Check installed recognizers
    Write-Host "[2/6] Checking installed speech recognizers..." -ForegroundColor Yellow
    $recognizers = [System.Speech.Recognition.SpeechRecognitionEngine]::InstalledRecognizers()
    
    if ($recognizers.Count -eq 0) {
        Write-Host "      ERROR - NO SPEECH RECOGNIZERS FOUND!" -ForegroundColor Red
        Write-Host ""
        Write-Host "SOLUTION:" -ForegroundColor Yellow
        Write-Host "  1. Go to Windows Settings" -ForegroundColor White
        Write-Host "  2. Search for Speech Recognition" -ForegroundColor White
        Write-Host "  3. Set up Windows Speech Recognition" -ForegroundColor White
        Write-Host "  4. Download speech language pack if prompted" -ForegroundColor White
        exit 1
    }
    
    Write-Host "      Success - Found $($recognizers.Count) recognizer(s):" -ForegroundColor Green
    foreach($r in $recognizers) {
        Write-Host "        - Language: $($r.Culture.DisplayName) ($($r.Culture.Name))" -ForegroundColor Cyan
        Write-Host "          Name: $($r.Name)" -ForegroundColor Cyan
    }
    Write-Host ""
    
    # Step 3: Create speech engine
    Write-Host "[3/6] Creating SpeechRecognitionEngine..." -ForegroundColor Yellow
    $engine = New-Object System.Speech.Recognition.SpeechRecognitionEngine
    Write-Host "      Success - Engine created" -ForegroundColor Green
    Write-Host ""
    
    # Step 4: Create simple grammar
    Write-Host "[4/6] Creating test grammar..." -ForegroundColor Yellow
    $choices = New-Object System.Speech.Recognition.Choices
    $choices.Add(@("test", "hello", "computer"))
    $grammarBuilder = New-Object System.Speech.Recognition.GrammarBuilder
    $grammarBuilder.Append($choices)
    $grammar = New-Object System.Speech.Recognition.Grammar($grammarBuilder)
    $engine.LoadGrammar($grammar)
    Write-Host "      Success - Grammar loaded (words: test, hello, computer)" -ForegroundColor Green
    Write-Host ""
    
    # Step 5: Set up microphone
    Write-Host "[5/6] Connecting to default microphone..." -ForegroundColor Yellow
    try {
        $engine.SetInputToDefaultAudioDevice()
        Write-Host "      Success - Microphone connected" -ForegroundColor Green
    }
    catch {
        Write-Host "      ERROR - MICROPHONE FAILED: $($_.Exception.Message)" -ForegroundColor Red
        Write-Host ""
        Write-Host "SOLUTION:" -ForegroundColor Yellow
        Write-Host "  1. Check if microphone is plugged in" -ForegroundColor White
        Write-Host "  2. Go to Windows Settings - System - Sound" -ForegroundColor White
        Write-Host "  3. Select your microphone as the default input device" -ForegroundColor White
        Write-Host "  4. Test microphone in Windows settings" -ForegroundColor White
        Write-Host "  5. Give microphone permission to apps" -ForegroundColor White
        $engine.Dispose()
        exit 1
    }
    Write-Host ""
    
    # Step 6: Try recognition
    Write-Host "[6/6] Testing speech recognition..." -ForegroundColor Yellow
    Write-Host "      Say one of these words: TEST, HELLO, or COMPUTER" -ForegroundColor Cyan
    Write-Host "      (You have 10 seconds...)" -ForegroundColor Cyan
    Write-Host ""
    
    $result = $engine.Recognize([TimeSpan]::FromSeconds(10))
    
    if ($result -ne $null) {
        Write-Host "========================================" -ForegroundColor Green
        Write-Host "SUCCESS! I heard you say: '$($result.Text)'" -ForegroundColor Green
        Write-Host "Confidence: $([math]::Round($result.Confidence * 100, 2))%" -ForegroundColor Green
        Write-Host "========================================" -ForegroundColor Green
        Write-Host ""
        Write-Host "Your microphone and speech recognition are working!" -ForegroundColor Green
        Write-Host "You can now run: node index.js" -ForegroundColor Green
    }
    else {
        Write-Host "========================================" -ForegroundColor Yellow
        Write-Host "NO SPEECH DETECTED (timeout)" -ForegroundColor Yellow
        Write-Host "========================================" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "POSSIBLE ISSUES:" -ForegroundColor Yellow
        Write-Host "  1. Microphone volume too low" -ForegroundColor White
        Write-Host "  2. Did not say exact words: test, hello, or computer" -ForegroundColor White
        Write-Host "  3. Background noise is too loud" -ForegroundColor White
        Write-Host "  4. Windows Speech Recognition needs training" -ForegroundColor White
        Write-Host ""
        Write-Host "TRY THIS:" -ForegroundColor Cyan
        Write-Host "  1. Search Speech Recognition in Windows" -ForegroundColor White
        Write-Host "  2. Click Train your computer option" -ForegroundColor White
        Write-Host "  3. Complete the training process" -ForegroundColor White
        Write-Host "  4. Run this test again" -ForegroundColor White
    }
    
    $engine.Dispose()
}
catch {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Red
    Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "========================================" -ForegroundColor Red
    Write-Host ""
    Write-Host $_.Exception.StackTrace -ForegroundColor Red
}

Write-Host ""
Write-Host "Press any key to exit..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
