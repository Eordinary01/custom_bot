# JARVIS v3.0 - Speech Listener Wrapper
# Launches scripts/speech_listener.ps1 with ExecutionPolicy Bypass and standard I/O redirection

$PSScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$scriptPath = Join-Path $PSScriptRoot "speech_listener.ps1"

if (-not (Test-Path $scriptPath)) {
    Write-Error "Speech listener script not found at: $scriptPath"
    exit 1
}

& powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$scriptPath"
