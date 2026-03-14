# Lumi MVP — Build Summary

## What Was Built

The full project is at `C:/Users/rayen/Desktop/SMU Hack/lumi/` and builds cleanly.

### 38 files across:

| Layer | Files |
|-------|-------|
| Electron main | `main.ts`, `preload.ts`, `ipc-handlers.ts` |
| Engine | `trigger-engine.ts` (distraction/stuck/fatigue/wandering state machine) |
| Services | `eye-tracker.ts`, `ocr-service.ts`, `speech-service.ts`, `session-tracker.ts` |
| Components | `LumiCharacter`, `ChatBubble`, `BionicReader`, `SessionSummary`, `CalibrationOverlay`, `StatusIndicator` |
| State | `lumi-store.ts` (Zustand) |
| Config | `constants.ts`, `distractions.ts`, `prompts.ts` |
| MCP Server | `mcp-server/index.js` — HTTP on port 3001, indexes PDFs |
| Scripts | `start-demo.bat` / `start-demo.sh` — one-click launch |

---

## To Run the Demo

```bash
# 1. Install & start Ollama (one time)
ollama pull llama3.2:3b

# 2. Start everything (Windows)
cd "C:/Users/rayen/Desktop/SMU Hack/lumi"
start-demo.bat

# Or manually:
# Terminal 1: node mcp-server/index.js
# Terminal 2: npm run dev
```

---

## To Add Course PDFs

Drop any `.pdf` files into `mcp-server/data/courses/` — the MCP server auto-indexes them on start.

---

## What Needs Attention Before Demo

1. **WebGazer**: Download `webgazer.js` from https://webgazer.cs.brown.edu/webgazer.js and place in `src/renderer/public/` for eye tracking. App works without it (graceful degradation).

2. **Lottie animations**: Replace placeholder `.json` files in `assets/lottie/` with real animations from lottiefiles.com (search "cute robot"). App falls back to animated emojis without them.

3. **Sound effects**: Add `nudge.mp3`, `celebrate.mp3`, `break-time.mp3` to `src/renderer/public/sounds/`.
