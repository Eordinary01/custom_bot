#!/usr/bin/env python3
"""
JARVIS Conversational AI — Faster-Whisper Speech-to-Text Service

Provides local neural speech transcription with high accuracy (95%+),
robust immunity to background fan noise, and natural language handling.
Supports both single-file CLI transcription and persistent daemon mode.
"""

import sys
import os
import json
import time
from pathlib import Path

# Suppress Hugging Face symlink warnings on Windows
os.environ["HF_HUB_DISABLE_SYMLINKS_WARNING"] = "1"

try:
    from faster_whisper import WhisperModel
except ImportError:
    print(json.dumps({"error": "faster-whisper is not installed in current environment."}))
    sys.exit(1)

MODEL_NAME = os.environ.get("WHISPER_MODEL", "base.en")
DEVICE = os.environ.get("WHISPER_DEVICE", "cpu")
COMPUTE_TYPE = os.environ.get("WHISPER_COMPUTE_TYPE", "int8")

_model = None

def get_model():
    global _model
    if _model is None:
        _model = WhisperModel(MODEL_NAME, device=DEVICE, compute_type=COMPUTE_TYPE)
    return _model

def transcribe_file(audio_path: str):
    p = Path(audio_path)
    if not p.exists():
        return {"error": f"Audio file not found: {audio_path}", "text": ""}

    model = get_model()
    t0 = time.time()
    segments, info = model.transcribe(
        str(p),
        beam_size=5,
        language="en",
        condition_on_previous_text=False,
        vad_filter=True,
        vad_parameters=dict(threshold=0.3)
    )

    text_parts = [segment.text.strip() for segment in segments]
    full_text = " ".join(text_parts).strip()

    # Robust fallback: if VAD was overly aggressive on quiet mic, retry without VAD
    if not full_text:
        segments, info = model.transcribe(
            str(p),
            beam_size=3,
            language="en",
            condition_on_previous_text=False,
            vad_filter=False
        )
        text_parts = [segment.text.strip() for segment in segments]
        full_text = " ".join(text_parts).strip()

    latency_ms = int((time.time() - t0) * 1000)

    return {
        "text": full_text,
        "language": info.language,
        "language_probability": round(info.language_probability, 3),
        "duration": round(info.duration, 2),
        "latency_ms": latency_ms
    }

def run_daemon():
    """Persistent mode: reads JSON or audio paths from stdin line-by-line."""
    # Pre-warm model
    get_model()
    print(json.dumps({"status": "ready", "model": MODEL_NAME}), flush=True)

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        if line.upper() == "QUIT" or line.upper() == "EXIT":
            break

        audio_path = line
        if line.startswith("{"):
            try:
                data = json.loads(line)
                audio_path = data.get("path", "")
            except Exception:
                pass

        res = transcribe_file(audio_path)
        print(json.dumps(res), flush=True)

if __name__ == "__main__":
    if len(sys.argv) > 1:
        cmd = sys.argv[1]
        if cmd == "--daemon":
            run_daemon()
        else:
            result = transcribe_file(cmd)
            print(json.dumps(result))
    else:
        run_daemon()
