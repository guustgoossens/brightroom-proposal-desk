"""Local neural TTS for the demo narration (Kokoro-82M via kokoro-onnx).

Usage: python -I kokoro_tts.py MODEL_DIR TEXT_FILE OUT_WAV
MODEL_DIR must contain kokoro-v1.0.onnx and voices-v1.0.bin
(https://github.com/thewh1teagle/kokoro-onnx/releases/tag/model-files-v1.0).
Env: KOKORO_VOICE (default af_heart), KOKORO_SPEED (default 0.95).
"""
import os
import re
import sys

import numpy as np
import soundfile as sf
from kokoro_onnx import Kokoro
from kokoro_onnx.config import EspeakConfig

# The espeak-ng binary bundled with the pip package fails on macOS (baked-in build path), so use the
# Homebrew one: `brew install espeak-ng`. Override with KOKORO_ESPEAK_LIB / KOKORO_ESPEAK_DATA.
ESPEAK = EspeakConfig(
    lib_path=os.environ.get("KOKORO_ESPEAK_LIB", "/opt/homebrew/lib/libespeak-ng.dylib"),
    data_path=os.environ.get("KOKORO_ESPEAK_DATA", "/opt/homebrew/share/espeak-ng-data"),
)

model_dir, text_file, out = sys.argv[1:4]
voice = os.environ.get("KOKORO_VOICE", "af_heart")
speed = float(os.environ.get("KOKORO_SPEED", "0.95"))

text = open(text_file, encoding="utf-8").read().strip()
# Respell the few tokens the phonemizer would read badly.
text = re.sub(r"\bQ(\d)\b", lambda m: "Q " + ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"][int(m.group(1))], text)
text = text.replace("LLM", "L L M").replace("Jev", "Jev")

kokoro = Kokoro(os.path.join(model_dir, "kokoro-v1.0.onnx"), os.path.join(model_dir, "voices-v1.0.bin"), espeak_config=ESPEAK)
sentences = [s.strip() for s in re.split(r"(?<=[.!?:])\s+", text) if s.strip()]
pause = np.zeros(int(24000 * 0.28), dtype=np.float32)
chunks, sr = [], 24000
for s in sentences:
    samples, sr = kokoro.create(s, voice=voice, speed=speed, lang="en-us")
    chunks += [samples, pause]
sf.write(out, np.concatenate(chunks), sr)
