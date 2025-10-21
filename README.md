📘 Video-to-Text Transcriber
A FastAPI-based web app for converting audio/video into text and subtitles (TXT/SRT/VTT) using Faster-Whisper.
🧠 支持 GPU 加速、自动语言识别、实时上传与转写进度条、准确 ETA 预估，并输出中英文字稿与字幕文件。


🚀 Features
✅ Accurate transcription using Faster-Whisper    
✅ GPU acceleration (CUDA 12.1) – runs much faster on RTX cards  
✅ Supports large-v2 & medium models (auto cached locally)  
✅ Automatic language detection (auto / English / Chinese)  
✅ Simplified Chinese conversion (via OpenCC)  
✅ Downloadable results: .txt, .srt, .vtt  
✅ Upload & transcription progress bars with ETA  
✅ FastAPI web UI (frontend auto-updates progress in real time)  


🧩 Directory Structure    
D:\Video2Text  
│  
├── app.py                     # FastAPI main app (backend API & routing)  
├── transcrive.py              # Core transcription logic (ffmpeg + Faster-Whisper)  
│  
├── templates/  
│   └── index.html             # Web UI (upload, progress, download)  
│  
├── static/                    # Static resources (optional)  
│   └── style.css   
│    
├── requirements.txt           # Dependency list  
└── README.md                  # (this file)  

  
⚙️ Installation
1️⃣ Clone or copy project
git clone https://github.com/<yourname>/Video2Text.git
cd Video2Text

2️⃣ Create & activate virtual environment
python -m venv .venv311
.venv311\Scripts\activate

3️⃣ Install dependencies (with CUDA 12.1)
pip install --upgrade pip
# ✅ Recommended (CUDA 12.1 GPU version)
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121
# Core dependencies
pip install fastapi uvicorn faster-whisper opencc-python-reimplemented ffmpeg-python
4️⃣ (Optional) Add ffmpeg to PATH
Ensure ffmpeg is available:
ffmpeg -version
If not, download from: https://ffmpeg.org/download.html
and add its /bin folder to PATH.

▶️ Run the app
uvicorn app:app --reload --port 7860

Then open your browser at
👉 http://127.0.0.1:7860

💻 Usage Flow
1. Select your video/audio file (.mp4, .mov, .wav, .mp3...)
2. Choose language (Auto detect / English / Chinese)
3. Choose model (medium or large-v2)
4. Click Transcribe

App will:
1. Convert file to 16kHz mono WAV (via ffmpeg)
2. Transcribe with Faster-Whisper
3. Estimate ETA in real time
4. Display progress bars for both upload & transcription
5. Output downloadable TXT / SRT / VTT files

📊 Performance Tips
| Mode       | Speed    | Accuracy     | GPU Memory | Recommended                       |
| ---------- | -------- | ------------ | ---------- | --------------------------------- |
| `medium`   | ⚡ Fast   | Good         | ~2 GB      | For short videos or quick results |
| `large-v2` | ⏳ Slower | 🔥 Very High | ~5–7 GB    | For full accuracy or long talks   |

✅ The model is auto-cached (download once only).    
✅ GPU (CUDA) automatically detected — falls back to CPU if unavailable.


🧮 ETA Calculation
Upload ETA: computed in frontend via sliding average (5s window)
Transcription ETA: computed in backend using actual processing speed (processed_seconds / elapsed_time)
Both update every ~0.8 seconds to give near real-time feedback.


🧾 Outputs Example
After transcription, results are saved in:
outputs/<job_id>/
 ├── transcript.txt   ← Full plain text
 ├── subtitles.srt    ← SubRip subtitle
 └── subtitles.vtt    ← WebVTT subtitle


🧠 Credits
Faster-Whisper
OpenCC
FastAPI
ffmpeg


📜 License
MIT License © 2025 [Your Name]

🌟 Future Improvements (可选后续优化)
 添加任务队列与并行处理（Celery + Redis）
 自动检测音频语言、批量转录目录
 WebSocket 实时推送转写进度
 前端样式美化（Tailwind / Bootstrap）


