try {
    $brightness = (Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightness -ErrorAction Stop).CurrentBrightness
    Write-Output $brightness
} catch {
    # Honest failure - no fake fallback
}
