from pathlib import Path
import uuid
import shutil
import json
import threading
from typing import Dict, Optional

from fastapi import FastAPI, UploadFile, File, Form, Request
from fastapi.templating import Jinja2Templates
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, JSONResponse, FileResponse

from faster_whisper import WhisperModel
# 注意：这里按你当前文件名导入（transcrive.py）
from transcrive import transcribe_media, write_srt, write_vtt


app = FastAPI(title="Video-to-Text Transcriber")
app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

OUTPUT_DIR = Path("outputs")
OUTPUT_DIR.mkdir(exist_ok=True)

# ---------- 全局模型缓存 ----------
MODEL_CACHE: Dict[str, WhisperModel] = {}


def get_model(model_size: str) -> WhisperModel:
    """获取/缓存 Whisper 模型；自动选择 CUDA/CPU 与 compute_type。"""
    if model_size not in MODEL_CACHE:
        try:
            import torch
            device = "cuda" if torch.cuda.is_available() else "cpu"
        except Exception:
            device = "cpu"

        compute = "float16" if device == "cuda" else "int8"
        MODEL_CACHE[model_size] = WhisperModel(model_size, device=device, compute_type=compute)
    return MODEL_CACHE[model_size]


# ---------- 进度/结果状态 ----------
# PROGRESS[job_id] = {"phase": "queued|transcribing|done|error", "pct": float(0~1), "eta": seconds or None, "message": str}
PROGRESS: Dict[str, Dict] = {}
# RESULT_META[job_id] = {"text_url": "...", "srt_url": "...", "vtt_url": "..."}
RESULT_META: Dict[str, Dict] = {}


@app.on_event("startup")
def preload_models():
    """可选：预热 large-v2，首个请求更快。"""
    try:
        get_model("large-v2")
    except Exception:
        # 即使预热失败也不影响服务启动
        pass


@app.get("/", response_class=HTMLResponse)
def home(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})


def _worker_transcribe(
    job_id: str,
    input_path: str,
    language: Optional[str],
    model_size: str,
):
    """后台线程：执行转写并写出文件，同时持续更新 PROGRESS。"""
    try:
        PROGRESS[job_id] = {"phase": "transcribing", "pct": 0.0, "eta": None, "message": ""}

        # 复用缓存模型
        model = get_model(model_size)

        def _cb(pct: float, eta: Optional[float], phase: str):
            # 这里只会传来 "transcribing"
            PROGRESS[job_id] = {"phase": phase, "pct": float(pct), "eta": eta, "message": ""}

        segments, text = transcribe_media(
            input_path=input_path,
            language=language,
            model_size=model_size,
            model_obj=model,
            progress_cb=_cb,   # 实时进度 & ETA
        )

        job_dir = OUTPUT_DIR / job_id
        txt_path = job_dir / "transcript.txt"
        srt_path = job_dir / "subtitles.srt"
        vtt_path = job_dir / "subtitles.vtt"

        txt_path.write_text(text, encoding="utf-8")
        write_srt(segments, srt_path)
        write_vtt(segments, vtt_path)

        RESULT_META[job_id] = {
            "text_url": f"/download/{job_id}/transcript.txt",
            "srt_url": f"/download/{job_id}/subtitles.srt",
            "vtt_url": f"/download/{job_id}/subtitles.vtt",
        }

        PROGRESS[job_id] = {"phase": "done", "pct": 1.0, "eta": 0.0, "message": ""}

    except Exception as e:
        PROGRESS[job_id] = {"phase": "error", "pct": 0.0, "eta": None, "message": str(e)}


@app.post("/api/transcribe")
def api_transcribe(
    media: UploadFile = File(...),
    language: str = Form("auto"),        # "auto", "en", "zh"
    model_size: str = Form("large-v2"),  # 只保留 "medium", "large-v2"
):
    """
    步骤：
      1) 保存上传文件
      2) 立即返回 job_id（前端开始轮询 /api/progress/{job_id}）
      3) 后台线程开始转写
    """
    # 校验模型选项
    allowed = {"medium", "large-v2"}
    if model_size not in allowed:
        model_size = "large-v2"

    job_id = str(uuid.uuid4())
    job_dir = OUTPUT_DIR / job_id
    job_dir.mkdir(parents=True, exist_ok=True)

    # 初始化进度：队列中
    PROGRESS[job_id] = {"phase": "queued", "pct": 0.0, "eta": None, "message": ""}

    # 保存上传到 job 目录
    tmp_in = job_dir / media.filename
    with tmp_in.open("wb") as f:
        shutil.copyfileobj(media.file, f)

    # 开线程做转写
    lang = None if language == "auto" else language
    t = threading.Thread(
        target=_worker_transcribe,
        args=(job_id, str(tmp_in), lang, model_size),
        daemon=True,
    )
    t.start()

    # 立即返回 job_id（和预期下载 URL；文件准备好后即可下载）
    resp = {
        "job_id": job_id,
        "text_url": f"/download/{job_id}/transcript.txt",
        "srt_url": f"/download/{job_id}/subtitles.srt",
        "vtt_url": f"/download/{job_id}/subtitles.vtt",
    }
    (job_dir / "request.json").write_text(json.dumps({"language": language, "model": model_size}, ensure_ascii=False), encoding="utf-8")
    return JSONResponse(resp)


@app.get("/api/progress/{job_id}")
def api_progress(job_id: str):
    data = PROGRESS.get(job_id, {"phase": "unknown", "pct": 0.0, "eta": None, "message": ""})
    # 附带是否可下载（文件是否已生成）
    meta = RESULT_META.get(job_id)
    data["download_ready"] = meta is not None
    return JSONResponse(data)


@app.get("/download/{job_id}/{filename}")
def download(job_id: str, filename: str):
    file_path = OUTPUT_DIR / job_id / filename
    if not file_path.exists():
        return JSONResponse({"error": "File not found"}, status_code=404)
    return FileResponse(file_path, filename=filename)
