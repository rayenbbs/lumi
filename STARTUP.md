# Lumi - Startup Guide

## Prerequisites

- **Node.js** 18+ (`node --version`)
- **Python** 3.11+ (`py --version`)
- **Webcam** (for eye tracking & fatigue detection)
- **Microphone** (for voice input)

## First-Time Setup

### 1. Install Node dependencies
```bash
cd lumi
npm install
```

### 2. Install Python dependencies
```bash
py -m pip install mediapipe opencv-python websockets numpy
```

### 3. Configure environment
Create a `.env` file in the `lumi/` root:
```
GEMINI_API_KEY=your_gemini_api_key
ELEVENLABS_API_KEY=your_elevenlabs_api_key    # optional, falls back to browser TTS
ELEVENLABS_VOICE_ID=your_voice_id              # optional
```

### 4. Add course materials (optional)
Drop PDF files into `mcp-server/data/courses/` for syllabus-aware responses.

---

## Running Lumi

### Option A: One-click (Windows)
```bash
start-demo.bat
```
This starts everything automatically.

### Option B: Manual (run each in a separate terminal)

**Terminal 1 — Driver State Detection** (camera tracking, port 8000)
```bash
cd Driver-State-Detection/driver_state_detection
py main.py --debug
```
- Uses webcam for EAR, PERCLOS, gaze, head pose
- Streams metrics via WebSocket on `ws://127.0.0.1:8000`
- `--debug` flag shows the camera feed with annotations

**Terminal 2 — MCP Course Server** (PDF search, port 3001)
```bash
cd mcp-server
node index.js
```
- Indexes PDFs from `mcp-server/data/courses/`
- Optional — Lumi works without it

**Terminal 3 — Lumi App**
```bash
npm run dev
```

---

## Ports Summary

| Service                | Port | Protocol  | Required |
|------------------------|------|-----------|----------|
| Driver State Detection | 8000 | WebSocket | Yes      |
| MCP Course Server      | 3001 | HTTP      | Optional |
| Lumi Dev Server        | 5173 | HTTP      | Auto     |

---

## Troubleshooting

**Camera not working?**
- Check that no other app is using the webcam
- The Driver State Detection terminal should show a debug window with face annotations

**Gemini API errors?**
- Check your `GEMINI_API_KEY` in `.env`
- Free tier has rate limits — wait a minute and retry

**Python `mediapipe` import error?**
- Requires Python 3.11-3.13
- Run: `py -m pip install mediapipe --upgrade`

**`active-win` error on startup?**
- This is ESM-only — it's dynamically imported, should work automatically
- If not: `npm install active-win@8`
