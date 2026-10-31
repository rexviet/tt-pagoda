#!/usr/bin/env python3
"""ZeroTTS worker. Loads the model once, then answers one JSON request per line on stdin with one JSON line on stdout.

Request : {"id": 1, "text": "Thanh Đạt đã dâng hương, chúc bạn bình an", "voice": "maichi"}
Answer  : {"type": "result", "id": 1, "ok": true, "file": "/tmp/zerotts-1.wav", "synthSec": 0.4}
At start: {"type": "ready", ...} once the model is loaded (or {"type": "error", "fatal": true, ...} and exit 1).

Settings come from the environment: ZEROTTS_MODEL_PATH (a directory of real files, not a Hugging Face cache of
symlinks: onnxruntime rejects those), ZEROTTS_VOICE, ZEROTTS_THREADS, ZEROTTS_OUT_DIR.
"""
import json
import os
import sys
import tempfile
import time
import traceback

os.environ.setdefault("OMP_WAIT_POLICY", "PASSIVE")  # no busy-waiting threads while idle

import numpy as np
from zerotts import ZeroTTS, normalize_vi_text

MODEL = os.environ.get("ZEROTTS_MODEL_PATH") or "zeroweight-ai/ZeroTTS"
DEFAULT_VOICE = os.environ.get("ZEROTTS_VOICE", "maichi")
THREADS = int(os.environ.get("ZEROTTS_THREADS", "3"))
OUT_DIR = os.environ.get("ZEROTTS_OUT_DIR") or tempfile.gettempdir()
PEAK_LIMIT = 0.90


def emit(payload: dict) -> None:
    sys.stdout.write(json.dumps(payload, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def polish(wav: np.ndarray, sample_rate: int) -> np.ndarray:
    """Remove DC offset, keep the peak below clipping and fade both ends so the clip does not click."""
    arr = np.asarray(wav, dtype=np.float32).reshape(-1)
    if arr.size == 0:
        return arr.reshape(1, 0)
    arr = arr - np.mean(arr)
    peak = float(np.max(np.abs(arr)))
    if peak > PEAK_LIMIT:
        arr = arr * (PEAK_LIMIT / peak)
    fade_in = min(int(sample_rate * 0.012), arr.size // 4)
    fade_out = min(int(sample_rate * 0.020), arr.size // 4)
    if fade_in > 1:
        arr[:fade_in] *= 0.5 * (1.0 - np.cos(np.linspace(0, np.pi, fade_in, dtype=np.float32)))
    if fade_out > 1:
        arr[-fade_out:] *= 0.5 * (1.0 + np.cos(np.linspace(0, np.pi, fade_out, dtype=np.float32)))
    return arr.reshape(1, -1)


def voice_aliases(tts, voices) -> dict:
    """Lower-case lookup of every voice by its id and by its display name, because a custom voice's id is a random
    mixed-case string (e.g. "sf1hi6y17fPu8tAg8FaJ") while people know it by the name they gave it ("phat-phap")."""
    aliases = {}
    for name in voices:
        aliases[name.lower()] = name
    for name in voices:
        try:
            shown = (tts.load_voice(name).display_name or "").strip().lower()
        except Exception:
            continue
        if shown:
            aliases.setdefault(shown, name)
    return aliases


def speakable(text: str) -> str:
    text = normalize_vi_text((text or "").strip())
    if text and text[-1] not in ".!?":
        text += "."
    return text


def main() -> None:
    started = time.time()
    try:
        tts = ZeroTTS.from_pretrained(MODEL, intra_op_num_threads=THREADS)
        voices = tts.list_voices()
        aliases = voice_aliases(tts, voices)
        voice = aliases.get(DEFAULT_VOICE.strip().lower()) or (voices[0] if voices else None)
        if DEFAULT_VOICE.strip().lower() not in aliases:
            print(f"[zerotts] voice \"{DEFAULT_VOICE}\" not found, using \"{voice}\"; available: {', '.join(voices)}", file=sys.stderr, flush=True)
        try:
            tts.warmup()  # the first synthesis is slow otherwise
        except Exception:
            pass
        emit({
            "type": "ready", "model": MODEL, "voice": voice, "voices": voices,
            "sampleRate": int(tts.sample_rate), "loadSec": round(time.time() - started, 2),
        })
    except Exception as exc:
        emit({"type": "error", "fatal": True, "error": str(exc), "trace": traceback.format_exc()})
        sys.exit(1)

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        req_id = None
        try:
            req = json.loads(line)
            req_id = req.get("id")
            expires = req.get("expires")  # epoch milliseconds; the caller has given up on the line after this
            if expires and time.time() * 1000 > expires:
                emit({"type": "result", "id": req_id, "ok": False, "error": "expired"})
                continue
            text = speakable(req.get("text"))
            if not text:
                emit({"type": "result", "id": req_id, "ok": False, "error": "empty text"})
                continue
            use_voice = aliases.get((req.get("voice") or "").strip().lower()) or voice
            t0 = time.time()
            raw = tts.synthesize(text, voice=use_voice, eoa_extra_frames=2)
            if raw is None or raw.size == 0:
                emit({"type": "result", "id": req_id, "ok": False, "error": "no audio generated"})
                continue
            audio = polish(raw, int(tts.sample_rate))
            path = os.path.join(OUT_DIR, f"zerotts-{os.getpid()}-{req_id}.wav")
            tts.save_audio(audio, path)
            emit({
                "type": "result", "id": req_id, "ok": True, "file": path, "voice": use_voice,
                "synthSec": round(time.time() - t0, 3), "durationSec": round(audio.shape[-1] / float(tts.sample_rate), 2),
            })
        except Exception as exc:
            emit({"type": "result", "id": req_id, "ok": False, "error": str(exc)})


if __name__ == "__main__":
    main()
