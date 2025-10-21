# transcrive.py
from __future__ import annotations

from pathlib import Path
from typing import List, Dict, Optional, Callable
import subprocess
import math
import logging
import time
from faster_whisper import WhisperModel
from opencc import OpenCC

logging.basicConfig(level=logging.INFO)


def _ffmpeg_extract_wav(input_path: str, out_path: str, sr: int = 16000) -> None:
    cmd = [
        "ffmpeg", "-y",
        "-i", input_path,
        "-ac", "1",
        "-ar", str(sr),
        "-f", "wav",
        out_path,
    ]
    logging.info("FFmpeg extracting WAV: %s -> %s", input_path, out_path)
    subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
    logging.info("FFmpeg done.")


def _format_ts(seconds: float) -> str:
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    ms = int((seconds - int(seconds)) * 1000)
    return f"{h:02}:{m:02}:{s:02},{ms:03}"


def transcribe_media(
    input_path: str,
    language: Optional[str] = None,
    model_size: str = "small",
    model_obj: Optional[WhisperModel] = None,
    progress_cb: Optional[Callable[[float, Optional[float], str], None]] = None,
):
    """
    返回 (segments, full_text)
    - progress_cb(pct, eta_seconds, phase): 进度回调，pct [0,1]，ETA 秒，phase="transcribing"
    """
    # 统一转码到 16k WAV
    tmp_wav = str(Path(input_path).with_suffix(".16k.wav"))
    _ffmpeg_extract_wav(input_path, tmp_wav, sr=16000)

    # 模型
    if model_obj is None:
        try:
            import torch
            device = "cuda" if torch.cuda.is_available() else "cpu"
        except Exception:
            device = "cpu"
        compute = "float16" if device == "cuda" else "int8"
        logging.info("Loading Whisper model: %s (device=%s, compute=%s)", model_size, device, compute)
        model = WhisperModel(model_size, device=device, compute_type=compute)
    else:
        model = model_obj

    # 开始转写
    lang = language or None
    logging.info("Start transcribe (language=%s)...", lang or "auto")
    t0 = time.time()

    # 这里的 info.duration 是音频总时长（秒）
    segments_iter, info = model.transcribe(
        tmp_wav,
        language=lang,
        vad_filter=True,
        vad_parameters=dict(min_silence_duration_ms=500),
        word_timestamps=False,
    )
    total = float(getattr(info, "duration", 0.0)) or 0.0

    segments: List[Dict] = []
    texts: List[str] = []
    last_end = 0.0

    # 进度：每处理一个分段就更新
    for seg in segments_iter:
        text = seg.text.strip()
        start_f = float(seg.start)
        end_f = float(seg.end)
        last_end = max(last_end, end_f)

        segments.append({"start": start_f, "end": end_f, "text": text})
        texts.append(text)

        if total > 0 and progress_cb:
            elapsed = time.time() - t0
            processed = last_end
            # 实时处理速度（秒/秒），避免除零 & 抑制刚开始的波动
            speed = (processed / elapsed) if elapsed > 1.0 else None
            eta = ((total - processed) / speed) if (speed and speed > 0) else None
            pct = min(max(processed / total, 0.0), 1.0)
            progress_cb(pct, eta, "transcribing")

    # 完成
    full_text = "\n".join(texts)

    # 统一简体
    cc = OpenCC("t2s")
    full_text = cc.convert(full_text)
    for s in segments:
        s["text"] = cc.convert(s["text"])

    logging.info("Transcribe done. Segments=%d", len(segments))
    # 最后一把进度置 100%
    if total > 0 and progress_cb:
        progress_cb(1.0, 0.0, "transcribing")

    return segments, full_text


def write_srt(segments: List[Dict], out_path: Path) -> None:
    lines: List[str] = []
    for i, s in enumerate(segments, 1):
        lines.append(str(i))
        lines.append(f"{_format_ts(s['start'])} --> {_format_ts(s['end'])}")
        lines.append(s["text"])
        lines.append("")
    Path(out_path).write_text("\n".join(lines), encoding="utf-8")


def write_vtt(segments: List[Dict], out_path: Path) -> None:
    lines: List[str] = ["WEBVTT", ""]
    for s in segments:
        start = _format_ts(s["start"]).replace(",", ".")
        end = _format_ts(s["end"]).replace(",", ".")
        lines.append(f"{start} --> {end}")
        lines.append(s["text"])
        lines.append("")
    Path(out_path).write_text("\n".join(lines), encoding="utf-8")
