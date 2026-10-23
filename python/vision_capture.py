#!/usr/bin/env python3
"""
vision_capture.py — JARVIS Vision & Screen Intelligence
========================================================
Captures the active window screenshot, extracts text via OCR (Tesseract),
and returns structured JSON for the VisionProvider.

Output format (stdout):
    {
        "success": true,
        "imagePath": "C:\\...\\screenshot.png",
        "windowTitle": "Google Chrome - YouTube",
        "app": "chrome.exe",
        "text": "Extracted OCR text..."
    }

Requirements:
    pip install pillow pytesseract
    (Tesseract-OCR must be installed: https://github.com/tesseract-ocr/tesseract)
"""

import json
import os
import subprocess
import sys
import tempfile
from datetime import datetime

try:
    from PIL import Image, ImageGrab
except ImportError:
    print(json.dumps({"success": False, "error": "Pillow not installed"}))
    sys.exit(1)

try:
    import pytesseract
    # Auto-detect default Windows installation path if not in system PATH
    default_tesseract = r"C:\Program Files\Tesseract-OCR\tesseract.exe"
    if os.path.exists(default_tesseract):
        pytesseract.pytesseract.tesseract_cmd = default_tesseract
except ImportError:
    pytesseract = None


def get_active_window_title():
    """Get the title of the currently active window."""
    try:
        import win32gui
        hwnd = win32gui.GetForegroundWindow()
        return win32gui.GetWindowText(hwnd)
    except ImportError:
        pass

    try:
        # Fallback: use PowerShell to get active window title
        ps_script = (
            "Add-Type -AssemblyName System;"
            "$win = [System.Diagnostics.Process]::GetProcesses() | "
            "Where-Object { $_.MainWindowTitle -ne [string]::Empty } | "
            "Select-Object -First 1;"
            "if ($win) { $win.MainWindowTitle } else { 'Unknown' }"
        )
        result = subprocess.run(
            ["powershell.exe", "-NoProfile", "-Command", ps_script],
            capture_output=True, text=True, timeout=3
        )
        title = result.stdout.strip()
        return title if title else "Unknown"
    except Exception:
        return "Unknown"


def get_active_process_name():
    """Get the executable name of the active process."""
    try:
        import win32gui
        import win32process
        hwnd = win32gui.GetForegroundWindow()
        _, pid = win32process.GetWindowThreadProcessId(hwnd)
        return subprocess.check_output(
            ["powershell.exe", "-NoProfile", "-Command",
             f"(Get-Process -Id {pid}).ProcessName"],
            text=True, timeout=3
        ).strip()
    except Exception:
        return "unknown"


def capture_screenshot():
    """Capture the full screen and save to a temp file."""
    try:
        screenshot = ImageGrab.grab()
        tmp_dir = tempfile.gettempdir()
        filename = f"jarvis_vision_{datetime.now().strftime('%Y%m%d_%H%M%S')}.png"
        image_path = os.path.join(tmp_dir, filename)
        screenshot.save(image_path)
        return image_path
    except Exception as e:
        return None


def ocr_image(image_path):
    """Extract text from image using Tesseract OCR."""
    if pytesseract is None:
        return ""
    try:
        from PIL import Image
        img = Image.open(image_path)
        text = pytesseract.image_to_string(img)
        return text.strip()
    except Exception:
        return ""


def main():
    result = {
        "success": False,
        "imagePath": None,
        "windowTitle": "",
        "app": "",
        "text": ""
    }

    # Capture screenshot
    image_path = capture_screenshot()
    if image_path:
        result["imagePath"] = image_path

    # Get active window info
    result["windowTitle"] = get_active_window_title()
    result["app"] = get_active_process_name()

    # OCR the screenshot
    if image_path:
        ocr_text = ocr_image(image_path)
        result["text"] = ocr_text

    result["success"] = True
    print(json.dumps(result))


if __name__ == "__main__":
    main()