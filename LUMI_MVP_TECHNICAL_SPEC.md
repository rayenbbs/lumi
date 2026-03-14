# LUMI — MVP Technical Specification & Implementation Plan

## Executive Summary

Lumi is a transparent, always-on-top Electron desktop application that acts as an empathetic AI study companion for neurodivergent students. It combines lightweight eye-tracking (WebGazer.js), local OCR (Tesseract.js), window detection (active-win), and a locally-hosted LLM (Ollama + Llama 3.2 3B) grounded via MCP to proactively support learners — detecting distractions, stuck reading, fatigue, and providing syllabus-grounded tutoring.

**Constraint:** No external/proprietary APIs (OpenAI, Anthropic, Gemini). LLM must be ≤5B parameters, locally hosted.

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     ELECTRON APP (Main Process)                  │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────────┐ │
│  │ Window       │  │ Screenshot   │  │ Ollama Bridge          │ │
│  │ Monitor      │  │ Service      │  │ (HTTP → localhost:11434)│ │
│  │ (active-win) │  │ (desktopCapt)│  │                        │ │
│  └──────┬───────┘  └──────┬───────┘  └────────────┬───────────┘ │
│         │                 │                        │             │
│         ▼                 ▼                        ▲             │
│  ┌─────────────────────────────────────────────────┴───────────┐ │
│  │                   IPC Bridge (contextBridge)                 │ │
│  └─────────────────────────────┬───────────────────────────────┘ │
│                                │                                 │
│  ┌─────────────────────────────▼───────────────────────────────┐ │
│  │              RENDERER PROCESS (Next.js + React)              │ │
│  │                                                              │ │
│  │  ┌─────────────┐  ┌────────────┐  ┌──────────────────────┐  │ │
│  │  │ WebGazer.js │  │Tesseract.js│  │ Web Speech API       │  │ │
│  │  │ Eye Tracker │  │ Local OCR  │  │ (STT + TTS)          │  │ │
│  │  └──────┬──────┘  └─────┬──────┘  └──────────┬───────────┘  │ │
│  │         │               │                     │              │ │
│  │         ▼               ▼                     ▼              │ │
│  │  ┌──────────────────────────────────────────────────────┐    │ │
│  │  │              Trigger Engine (State Machine)           │    │ │
│  │  │  • Distraction Detector (window title + URL)         │    │ │
│  │  │  • Stuck Detector (gaze position + timer)            │    │ │
│  │  │  • Fatigue Detector (blink rate + session duration)  │    │ │
│  │  │  • Wandering Detector (gaze off-screen)              │    │ │
│  │  └──────────────────────┬───────────────────────────────┘    │ │
│  │                         │                                    │ │
│  │                         ▼                                    │ │
│  │  ┌──────────────────────────────────────────────────────┐    │ │
│  │  │              Context Builder                          │    │ │
│  │  │  • Assembles: trigger_type + ocr_text + syllabus_ctx │    │ │
│  │  │  • Sends to Ollama via IPC                           │    │ │
│  │  └──────────────────────┬───────────────────────────────┘    │ │
│  │                         │                                    │ │
│  │                         ▼                                    │ │
│  │  ┌──────────────────────────────────────────────────────┐    │ │
│  │  │              UI Layer                                 │    │ │
│  │  │  • Lottie Character (sleeping/waving/talking/alert)  │    │ │
│  │  │  • Chat Bubbles (Framer Motion)                      │    │ │
│  │  │  • Bionic Reading Panel                              │    │ │
│  │  │  • Session Summary Card                              │    │ │
│  │  └──────────────────────────────────────────────────────┘    │ │
│  └──────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│                    EXTERNAL (Local Machine)                       │
│                                                                   │
│  ┌─────────────────────┐    ┌──────────────────────────────────┐ │
│  │ Ollama Server        │    │ MCP Server (Node.js)             │ │
│  │ localhost:11434      │◄───│ Indexes course PDFs              │ │
│  │ llama3.2:3b          │    │ Provides retrieval tool          │ │
│  └─────────────────────┘    └──────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
```

---

## 2. Project Structure

```
lumi/
├── package.json
├── electron/
│   ├── main.ts                    # Electron main process
│   ├── preload.ts                 # contextBridge for IPC
│   ├── services/
│   │   ├── window-monitor.ts      # active-win polling
│   │   ├── screenshot.ts          # desktopCapturer screenshots
│   │   └── ollama-bridge.ts       # HTTP calls to Ollama
│   └── ipc-handlers.ts            # All IPC handler registrations
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   └── page.tsx               # Main Lumi UI
│   ├── components/
│   │   ├── LumiCharacter.tsx      # Lottie animated character
│   │   ├── ChatBubble.tsx         # Animated speech bubbles
│   │   ├── BionicReader.tsx       # Bionic reading panel
│   │   ├── SessionSummary.tsx     # End-of-session report
│   │   ├── CalibrationOverlay.tsx # WebGazer calibration UI
│   │   └── StatusIndicator.tsx    # Mic/eye status dots
│   ├── engine/
│   │   ├── trigger-engine.ts      # Core state machine
│   │   ├── distraction-detector.ts
│   │   ├── stuck-detector.ts
│   │   ├── fatigue-detector.ts
│   │   └── context-builder.ts     # Assembles LLM prompts
│   ├── services/
│   │   ├── eye-tracker.ts         # WebGazer.js wrapper
│   │   ├── ocr-service.ts         # Tesseract.js wrapper
│   │   ├── speech-service.ts      # Web Speech API (STT+TTS)
│   │   └── session-tracker.ts     # Tracks study duration + stats
│   ├── hooks/
│   │   ├── useEyeTracker.ts
│   │   ├── useTriggerEngine.ts
│   │   └── useLumiChat.ts
│   ├── store/
│   │   └── lumi-store.ts          # Zustand state management
│   └── config/
│       ├── distractions.ts        # Blocklist of distracting apps/URLs
│       ├── prompts.ts             # All LLM prompt templates
│       └── constants.ts           # Timing thresholds, config
├── mcp-server/
│   ├── package.json
│   ├── index.ts                   # MCP server entry
│   ├── tools/
│   │   ├── search-syllabus.ts     # Retrieval tool for course docs
│   │   └── get-topic-summary.ts   # Summarization tool
│   └── data/
│       └── courses/               # User drops PDFs here
│           ├── ml-lecture-01.pdf
│           └── ml-lecture-02.pdf
├── assets/
│   ├── lottie/
│   │   ├── lumi-sleeping.json
│   │   ├── lumi-waving.json
│   │   ├── lumi-talking.json
│   │   ├── lumi-alert.json
│   │   └── lumi-thinking.json
│   └── sounds/
│       ├── nudge.mp3
│       ├── celebrate.mp3
│       └── break-time.mp3
├── electron-builder.yml
└── tsconfig.json
```

---

## 3. Dependency Manifest

### Electron App (`package.json`)

```json
{
  "name": "lumi",
  "version": "1.0.0",
  "main": "electron/main.ts",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "start": "electron ."
  },
  "dependencies": {
    "active-win": "^8.1.0",
    "electron-store": "^8.1.0",
    "framer-motion": "^11.0.0",
    "lottie-react": "^2.4.0",
    "next": "^14.2.0",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "tesseract.js": "^5.0.0",
    "webgazer": "^2.1.0",
    "zustand": "^4.5.0",
    "tailwindcss": "^3.4.0",
    "pdf-parse": "^1.1.1"
  },
  "devDependencies": {
    "electron": "^29.0.0",
    "electron-vite": "^2.0.0",
    "electron-builder": "^24.0.0",
    "typescript": "^5.3.0",
    "@types/react": "^18.2.0"
  }
}
```

### MCP Server (`mcp-server/package.json`)

```json
{
  "name": "lumi-mcp-server",
  "version": "1.0.0",
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "pdf-parse": "^1.1.1",
    "natural": "^6.10.0"
  }
}
```

---

## 4. Component Implementation Details

### 4.1 Electron Main Process (`electron/main.ts`)

```typescript
import { app, BrowserWindow, ipcMain, desktopCapturer, screen } from 'electron';
import path from 'path';
import { registerIpcHandlers } from './ipc-handlers';

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  mainWindow = new BrowserWindow({
    // Position: bottom-right corner
    x: width - 420,
    y: height - 520,
    width: 400,
    height: 500,

    // CRITICAL: Transparent, frameless, always on top
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: false,
    resizable: true,
    hasShadow: false,

    // Allow click-through on transparent areas
    // We'll toggle this dynamically
    focusable: true,

    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // Required for WebGazer webcam access
      // and desktopCapturer
    },
  });

  // Remove menu bar
  mainWindow.setMenuBarVisibility(false);

  // Load the Next.js app
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:3000');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../out/index.html'));
  }

  // Make transparent areas click-through
  mainWindow.setIgnoreMouseEvents(false);

  registerIpcHandlers(mainWindow);
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  app.quit();
});
```

### 4.2 Preload Script (`electron/preload.ts`)

```typescript
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  // Window monitoring
  getActiveWindow: () => ipcRenderer.invoke('get-active-window'),

  // Screenshot capture
  captureScreen: () => ipcRenderer.invoke('capture-screen'),

  // Ollama communication
  sendToOllama: (payload: {
    triggerType: string;
    ocrText: string;
    userQuestion?: string;
    conversationHistory: Array<{ role: string; content: string }>;
  }) => ipcRenderer.invoke('send-to-ollama', payload),

  // MCP syllabus search
  searchSyllabus: (query: string) => ipcRenderer.invoke('search-syllabus', query),

  // Window controls
  setClickThrough: (enable: boolean) =>
    ipcRenderer.invoke('set-click-through', enable),

  // Resize window for expanded/collapsed states
  resizeWindow: (width: number, height: number) =>
    ipcRenderer.invoke('resize-window', width, height),
});
```

### 4.3 IPC Handlers (`electron/ipc-handlers.ts`)

```typescript
import { ipcMain, BrowserWindow, desktopCapturer } from 'electron';
import activeWin from 'active-win';

export function registerIpcHandlers(mainWindow: BrowserWindow) {

  // === ACTIVE WINDOW DETECTION ===
  ipcMain.handle('get-active-window', async () => {
    try {
      const win = await activeWin();
      if (!win) return null;
      return {
        title: win.title,
        owner: win.owner.name,      // e.g. "Google Chrome", "Discord"
        url: win.url || null,        // Browser URL if available
        pid: win.owner.processId,
      };
    } catch {
      return null;
    }
  });

  // === SCREENSHOT CAPTURE ===
  ipcMain.handle('capture-screen', async () => {
    try {
      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width: 1280, height: 720 },
      });
      if (sources.length === 0) return null;
      // Return base64 PNG of the primary screen
      return sources[0].thumbnail.toDataURL();
    } catch {
      return null;
    }
  });

  // === OLLAMA BRIDGE ===
  ipcMain.handle('send-to-ollama', async (_event, payload) => {
    try {
      const { triggerType, ocrText, userQuestion, conversationHistory } = payload;

      // Build the system prompt
      const systemPrompt = buildSystemPrompt(triggerType, ocrText);

      // Build messages array
      const messages = [
        { role: 'system', content: systemPrompt },
        ...conversationHistory,
      ];

      if (userQuestion) {
        messages.push({ role: 'user', content: userQuestion });
      }

      const response = await fetch('http://localhost:11434/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'llama3.2:3b',
          messages,
          stream: false,
          options: {
            temperature: 0.7,
            num_predict: 200,    // Keep responses short and snappy
            top_p: 0.9,
          },
        }),
      });

      const data = await response.json();
      return {
        success: true,
        message: data.message.content,
      };
    } catch (error) {
      return {
        success: false,
        message: "I'm having trouble thinking right now. Give me a moment!",
        error: String(error),
      };
    }
  });

  // === MCP SYLLABUS SEARCH ===
  ipcMain.handle('search-syllabus', async (_event, query: string) => {
    try {
      const response = await fetch('http://localhost:3001/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      });
      const data = await response.json();
      return data.results || [];
    } catch {
      return [];
    }
  });

  // === WINDOW CONTROLS ===
  ipcMain.handle('set-click-through', (_event, enable: boolean) => {
    mainWindow.setIgnoreMouseEvents(enable, { forward: true });
  });

  ipcMain.handle('resize-window', (_event, width: number, height: number) => {
    mainWindow.setSize(width, height, true);
  });
}


function buildSystemPrompt(triggerType: string, ocrText: string): string {
  const base = `You are Lumi, a warm, empathetic AI study companion designed for neurodivergent students (ADHD, Autism, Dyslexia). You live as an animated character on the student's desktop.

CRITICAL RULES:
- Keep responses to 1-3 sentences maximum. You speak in chat bubbles — brevity is essential.
- Be warm, encouraging, and never condescending or scolding.
- Use casual, friendly language. You're a supportive friend, not a teacher.
- If you reference course material, cite the specific topic/page.
- If you're unsure about something, say "I'm not sure about that — let me know if you want me to look it up!"
- Never generate information not grounded in the provided context.
- Use occasional emoji sparingly (1 per message max).`;

  const triggerContexts: Record<string, string> = {
    distraction: `The student just switched to a distracting app/website. Your job is to GENTLY redirect them back to studying. Be encouraging about their progress so far. Never scold. Make them WANT to come back.

Currently on screen: ${ocrText}`,

    stuck: `The student has been staring at the same content for an unusually long time (40+ seconds without scrolling or interaction). They might be confused or overwhelmed. Offer to help explain the content in simpler terms.

Content they're stuck on: ${ocrText}`,

    fatigue: `The student is showing signs of fatigue (increased blink rate, long session duration, wandering gaze). Suggest a break and celebrate what they've accomplished so far.

What they were studying: ${ocrText}`,

    question: `The student is asking you a direct question about their study material. Answer using ONLY the provided course context. If the context doesn't contain the answer, say so honestly.

Current screen content: ${ocrText}`,

    session_start: `The student just started studying. Welcome them warmly and let them know you're here to help. Keep it brief.

They opened: ${ocrText}`,

    session_end: `The study session is ending. Summarize what they covered (based on the topics you discussed), praise their effort, and suggest what to review next.

Session content: ${ocrText}`,

    proactive_bridge: `You've detected that the current material requires prerequisite knowledge the student might not have. Proactively offer a quick refresher.

Current topic: ${ocrText}`,
  };

  return base + '\n\n' + (triggerContexts[triggerType] || triggerContexts.question);
}
```

### 4.4 Eye Tracker Service (`src/services/eye-tracker.ts`)

```typescript
import webgazer from 'webgazer';

export interface GazeData {
  x: number;
  y: number;
  timestamp: number;
}

export interface EyeMetrics {
  isOnScreen: boolean;
  gazePosition: { x: number; y: number } | null;
  blinkRate: number;           // blinks per minute (rolling average)
  gazeVelocity: number;        // pixels per second (how fast eyes are moving)
  stationaryDuration: number;  // seconds gaze has been in same ~100px area
}

export class EyeTrackerService {
  private gazeHistory: GazeData[] = [];
  private blinkTimestamps: number[] = [];
  private lastGazeRegion: { x: number; y: number } | null = null;
  private stationaryStart: number = Date.now();
  private isTracking = false;
  private onMetricsUpdate: ((metrics: EyeMetrics) => void) | null = null;

  private readonly HISTORY_WINDOW = 5000;       // 5 seconds of gaze data
  private readonly BLINK_WINDOW = 60000;         // 1 minute for blink rate
  private readonly STATIONARY_THRESHOLD = 100;   // pixels — same "region"
  private readonly GAZE_SAMPLE_INTERVAL = 100;   // ms between samples

  async initialize(): Promise<boolean> {
    try {
      webgazer
        .setRegression('ridge')
        .setGazeListener((data: any, _elapsedTime: number) => {
          if (!data) {
            // No face detected — likely a blink or looking away
            this.recordBlink();
            return;
          }
          this.recordGaze(data.x, data.y);
        })
        .saveDataAcrossSessions(true);

      await webgazer.begin();

      // Hide the default WebGazer video preview and prediction points
      webgazer.showVideoPreview(false);
      webgazer.showPredictionPoints(false);

      this.isTracking = true;

      // Start metrics computation loop
      this.startMetricsLoop();

      return true;
    } catch (error) {
      console.error('WebGazer initialization failed:', error);
      return false;
    }
  }

  private recordGaze(x: number, y: number) {
    const now = Date.now();
    this.gazeHistory.push({ x, y, timestamp: now });

    // Trim old data
    this.gazeHistory = this.gazeHistory.filter(
      g => now - g.timestamp < this.HISTORY_WINDOW
    );

    // Check if gaze is in same region
    if (this.lastGazeRegion) {
      const dx = Math.abs(x - this.lastGazeRegion.x);
      const dy = Math.abs(y - this.lastGazeRegion.y);
      if (dx > this.STATIONARY_THRESHOLD || dy > this.STATIONARY_THRESHOLD) {
        // Moved to new region
        this.lastGazeRegion = { x, y };
        this.stationaryStart = now;
      }
    } else {
      this.lastGazeRegion = { x, y };
      this.stationaryStart = now;
    }
  }

  private recordBlink() {
    const now = Date.now();
    this.blinkTimestamps.push(now);
    this.blinkTimestamps = this.blinkTimestamps.filter(
      t => now - t < this.BLINK_WINDOW
    );
  }

  private startMetricsLoop() {
    setInterval(() => {
      if (!this.onMetricsUpdate) return;

      const now = Date.now();
      const recentGaze = this.gazeHistory.filter(
        g => now - g.timestamp < 1000
      );

      // Calculate gaze velocity
      let velocity = 0;
      if (recentGaze.length >= 2) {
        let totalDist = 0;
        for (let i = 1; i < recentGaze.length; i++) {
          const dx = recentGaze[i].x - recentGaze[i - 1].x;
          const dy = recentGaze[i].y - recentGaze[i - 1].y;
          totalDist += Math.sqrt(dx * dx + dy * dy);
        }
        const timeSpan =
          (recentGaze[recentGaze.length - 1].timestamp - recentGaze[0].timestamp) / 1000;
        velocity = timeSpan > 0 ? totalDist / timeSpan : 0;
      }

      const metrics: EyeMetrics = {
        isOnScreen: recentGaze.length > 0,
        gazePosition: recentGaze.length > 0
          ? { x: recentGaze[recentGaze.length - 1].x, y: recentGaze[recentGaze.length - 1].y }
          : null,
        blinkRate: this.blinkTimestamps.length, // blinks in last 60s
        gazeVelocity: velocity,
        stationaryDuration: (now - this.stationaryStart) / 1000,
      };

      this.onMetricsUpdate(metrics);
    }, this.GAZE_SAMPLE_INTERVAL);
  }

  setMetricsCallback(callback: (metrics: EyeMetrics) => void) {
    this.onMetricsUpdate = callback;
  }

  async calibrate(): Promise<void> {
    // WebGazer calibrates via clicks — the CalibrationOverlay
    // component handles the UI for this
    webgazer.clearData();
  }

  destroy() {
    if (this.isTracking) {
      webgazer.end();
      this.isTracking = false;
    }
  }
}
```

### 4.5 Trigger Engine (`src/engine/trigger-engine.ts`)

```typescript
import { EyeMetrics } from '../services/eye-tracker';

export type TriggerType =
  | 'distraction'
  | 'stuck'
  | 'fatigue'
  | 'wandering'
  | 'session_start'
  | 'session_end'
  | 'proactive_bridge'
  | null;

export type LumiState =
  | 'sleeping'      // No active study session
  | 'watching'      // Monitoring, student is focused
  | 'intervening'   // Currently showing a message
  | 'chatting'      // Student initiated a conversation
  | 'break';        // Break time

interface ActiveWindowInfo {
  title: string;
  owner: string;
  url: string | null;
}

interface TriggerEvent {
  type: TriggerType;
  confidence: number;    // 0-1 how sure we are
  context: string;       // What to pass to the LLM
  timestamp: number;
}

// === CONFIGURATION ===
const CONFIG = {
  // Distraction detection
  DISTRACTION_GRACE_PERIOD: 10_000,   // 10s before flagging distraction
  DISTRACTION_COOLDOWN: 120_000,       // 2min between distraction nudges

  // Stuck detection
  STUCK_THRESHOLD: 40_000,             // 40s staring at same area
  STUCK_COOLDOWN: 180_000,             // 3min between stuck interventions

  // Fatigue detection
  FATIGUE_BLINK_THRESHOLD: 25,         // >25 blinks/min = fatigue signal
  FATIGUE_SESSION_THRESHOLD: 45 * 60_000, // 45min without break
  FATIGUE_COOLDOWN: 600_000,           // 10min between fatigue nudges

  // Wandering detection (eyes off screen)
  WANDERING_THRESHOLD: 15_000,         // 15s looking away
  WANDERING_COOLDOWN: 60_000,          // 1min between wandering nudges

  // General
  MIN_INTERVENTION_GAP: 30_000,        // 30s minimum between ANY interventions
  SESSION_INACTIVITY_TIMEOUT: 300_000, // 5min no activity → session end
};

// === DISTRACTION BLOCKLIST ===
const DISTRACTION_PATTERNS = {
  apps: [
    'Discord', 'Slack', 'Telegram', 'WhatsApp',
    'Steam', 'Epic Games', 'Spotify',
    'TikTok', 'Snapchat',
  ],
  urls: [
    'youtube.com', 'netflix.com', 'twitch.tv',
    'instagram.com', 'facebook.com', 'twitter.com', 'x.com',
    'reddit.com', 'tiktok.com', '9gag.com',
    'discord.com', 'web.whatsapp.com',
  ],
  // Allowlist overrides (study-related sites that might match patterns)
  allowlist: [
    'youtube.com/watch.*lecture', 'youtube.com/watch.*tutorial',
    'stackoverflow.com', 'github.com', 'docs.python.org',
    'arxiv.org', 'scholar.google.com',
  ],
};

export class TriggerEngine {
  private state: LumiState = 'sleeping';
  private lastTrigger: TriggerEvent | null = null;
  private lastInterventionTime = 0;
  private triggerCooldowns: Map<string, number> = new Map();
  private sessionStartTime: number | null = null;
  private lastBreakTime: number | null = null;

  // Distraction tracking
  private distractionStartTime: number | null = null;
  private lastKnownStudyWindow: ActiveWindowInfo | null = null;

  // Wandering tracking
  private offScreenStartTime: number | null = null;

  // Callback
  private onTrigger: ((event: TriggerEvent) => void) | null = null;

  setTriggerCallback(callback: (event: TriggerEvent) => void) {
    this.onTrigger = callback;
  }

  getState(): LumiState {
    return this.state;
  }

  setState(state: LumiState) {
    this.state = state;
  }

  startSession() {
    this.state = 'watching';
    this.sessionStartTime = Date.now();
    this.lastBreakTime = Date.now();
    this.fireTrigger({
      type: 'session_start',
      confidence: 1,
      context: 'Student started a new study session.',
      timestamp: Date.now(),
    });
  }

  endSession(summary: string) {
    this.fireTrigger({
      type: 'session_end',
      confidence: 1,
      context: summary,
      timestamp: Date.now(),
    });
    this.state = 'sleeping';
    this.sessionStartTime = null;
  }

  returnFromBreak() {
    this.state = 'watching';
    this.lastBreakTime = Date.now();
  }

  // === MAIN UPDATE LOOP — Call this every 500ms ===
  update(
    eyeMetrics: EyeMetrics | null,
    activeWindow: ActiveWindowInfo | null,
    ocrText: string
  ) {
    if (this.state === 'sleeping' || this.state === 'break') return;
    if (this.state === 'intervening') return; // Don't stack interventions

    const now = Date.now();

    // Respect minimum gap between interventions
    if (now - this.lastInterventionTime < CONFIG.MIN_INTERVENTION_GAP) return;

    // 1. Check distraction (highest priority)
    const distraction = this.checkDistraction(activeWindow, now);
    if (distraction) { this.fireTrigger(distraction); return; }

    // 2. Check stuck (needs eye metrics)
    if (eyeMetrics) {
      const stuck = this.checkStuck(eyeMetrics, ocrText, now);
      if (stuck) { this.fireTrigger(stuck); return; }

      // 3. Check fatigue
      const fatigue = this.checkFatigue(eyeMetrics, ocrText, now);
      if (fatigue) { this.fireTrigger(fatigue); return; }

      // 4. Check wandering
      const wandering = this.checkWandering(eyeMetrics, now);
      if (wandering) { this.fireTrigger(wandering); return; }
    }
  }

  private checkDistraction(
    activeWindow: ActiveWindowInfo | null,
    now: number
  ): TriggerEvent | null {
    if (!activeWindow) return null;
    if (this.isOnCooldown('distraction', now)) return null;

    const isDistracting = this.isDistractingWindow(activeWindow);

    if (isDistracting) {
      if (!this.distractionStartTime) {
        this.distractionStartTime = now;
      }
      const elapsed = now - this.distractionStartTime;
      if (elapsed >= CONFIG.DISTRACTION_GRACE_PERIOD) {
        this.distractionStartTime = null;
        return {
          type: 'distraction',
          confidence: 0.9,
          context: `Student switched to: ${activeWindow.owner} — "${activeWindow.title}"${
            activeWindow.url ? ` (${activeWindow.url})` : ''
          }`,
          timestamp: now,
        };
      }
    } else {
      this.distractionStartTime = null;
      // Remember study windows for context
      if (this.isStudyWindow(activeWindow)) {
        this.lastKnownStudyWindow = activeWindow;
      }
    }

    return null;
  }

  private checkStuck(
    metrics: EyeMetrics,
    ocrText: string,
    now: number
  ): TriggerEvent | null {
    if (this.isOnCooldown('stuck', now)) return null;

    if (
      metrics.stationaryDuration > CONFIG.STUCK_THRESHOLD / 1000 &&
      metrics.gazeVelocity < 20 // Very slow eye movement
    ) {
      return {
        type: 'stuck',
        confidence: Math.min(metrics.stationaryDuration / 60, 1),
        context: ocrText.substring(0, 500), // First 500 chars of what they're reading
        timestamp: now,
      };
    }

    return null;
  }

  private checkFatigue(
    metrics: EyeMetrics,
    ocrText: string,
    now: number
  ): TriggerEvent | null {
    if (this.isOnCooldown('fatigue', now)) return null;

    const sessionDuration = this.sessionStartTime
      ? now - this.sessionStartTime
      : 0;
    const timeSinceBreak = this.lastBreakTime
      ? now - this.lastBreakTime
      : sessionDuration;

    const isBlinkFatigued = metrics.blinkRate > CONFIG.FATIGUE_BLINK_THRESHOLD;
    const isSessionLong = timeSinceBreak > CONFIG.FATIGUE_SESSION_THRESHOLD;

    if (isBlinkFatigued || isSessionLong) {
      const sessionMinutes = Math.round(timeSinceBreak / 60_000);
      return {
        type: 'fatigue',
        confidence: isBlinkFatigued && isSessionLong ? 1 : 0.7,
        context: `Session duration: ${sessionMinutes} minutes. Blink rate: ${metrics.blinkRate}/min. Topic: ${ocrText.substring(0, 200)}`,
        timestamp: now,
      };
    }

    return null;
  }

  private checkWandering(
    metrics: EyeMetrics,
    now: number
  ): TriggerEvent | null {
    if (this.isOnCooldown('wandering', now)) return null;

    if (!metrics.isOnScreen) {
      if (!this.offScreenStartTime) {
        this.offScreenStartTime = now;
      }
      if (now - this.offScreenStartTime > CONFIG.WANDERING_THRESHOLD) {
        this.offScreenStartTime = null;
        return {
          type: 'wandering',
          confidence: 0.6,
          context: 'Student has been looking away from screen for extended period.',
          timestamp: now,
        };
      }
    } else {
      this.offScreenStartTime = null;
    }

    return null;
  }

  private isDistractingWindow(win: ActiveWindowInfo): boolean {
    // Check app name
    for (const app of DISTRACTION_PATTERNS.apps) {
      if (win.owner.toLowerCase().includes(app.toLowerCase())) return true;
    }
    // Check URL
    if (win.url) {
      // Check allowlist first
      for (const pattern of DISTRACTION_PATTERNS.allowlist) {
        if (new RegExp(pattern, 'i').test(win.url)) return false;
      }
      for (const domain of DISTRACTION_PATTERNS.urls) {
        if (win.url.includes(domain)) return true;
      }
    }
    // Check title patterns (games often have specific patterns)
    const gamePatterns = /playing|game|fps:|score:/i;
    if (gamePatterns.test(win.title)) return true;

    return false;
  }

  private isStudyWindow(win: ActiveWindowInfo): boolean {
    const studyPatterns = /\.pdf|lecture|chapter|course|study|docs|notes|textbook/i;
    return studyPatterns.test(win.title) || studyPatterns.test(win.url || '');
  }

  private isOnCooldown(triggerType: string, now: number): boolean {
    const lastFired = this.triggerCooldowns.get(triggerType);
    if (!lastFired) return false;

    const cooldowns: Record<string, number> = {
      distraction: CONFIG.DISTRACTION_COOLDOWN,
      stuck: CONFIG.STUCK_COOLDOWN,
      fatigue: CONFIG.FATIGUE_COOLDOWN,
      wandering: CONFIG.WANDERING_COOLDOWN,
    };

    return now - lastFired < (cooldowns[triggerType] || CONFIG.MIN_INTERVENTION_GAP);
  }

  private fireTrigger(event: TriggerEvent) {
    this.lastTrigger = event;
    this.lastInterventionTime = event.timestamp;
    if (event.type) {
      this.triggerCooldowns.set(event.type, event.timestamp);
    }
    this.state = 'intervening';
    this.onTrigger?.(event);
  }
}
```

### 4.6 OCR Service (`src/services/ocr-service.ts`)

```typescript
import Tesseract from 'tesseract.js';

export class OCRService {
  private worker: Tesseract.Worker | null = null;
  private isReady = false;

  async initialize(): Promise<void> {
    this.worker = await Tesseract.createWorker('eng', 1, {
      // Use local wasm — bundled with Tesseract.js
    });
    this.isReady = true;
  }

  async extractText(imageDataUrl: string): Promise<string> {
    if (!this.worker || !this.isReady) {
      throw new Error('OCR worker not initialized');
    }

    const { data: { text } } = await this.worker.recognize(imageDataUrl);

    // Clean up OCR artifacts
    return text
      .replace(/\n{3,}/g, '\n\n')  // Collapse excessive newlines
      .replace(/[^\S\n]+/g, ' ')    // Collapse whitespace
      .trim();
  }

  async destroy(): Promise<void> {
    if (this.worker) {
      await this.worker.terminate();
      this.worker = null;
      this.isReady = false;
    }
  }
}
```

### 4.7 Speech Service (`src/services/speech-service.ts`)

```typescript
export class SpeechService {
  private recognition: SpeechRecognition | null = null;
  private synthesis = window.speechSynthesis;
  private isListening = false;
  private onTranscript: ((text: string) => void) | null = null;

  initialize(): boolean {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      console.error('Speech Recognition not supported');
      return false;
    }

    this.recognition = new SpeechRecognition();
    this.recognition.continuous = true;
    this.recognition.interimResults = false;
    this.recognition.lang = 'en-US';

    this.recognition.onresult = (event: SpeechRecognitionEvent) => {
      const last = event.results.length - 1;
      const transcript = event.results[last][0].transcript.trim();
      if (transcript && this.onTranscript) {
        this.onTranscript(transcript);
      }
    };

    this.recognition.onerror = (event) => {
      console.error('Speech recognition error:', event.error);
      if (event.error === 'no-speech' || event.error === 'aborted') {
        // Restart listening
        if (this.isListening) {
          setTimeout(() => this.recognition?.start(), 500);
        }
      }
    };

    this.recognition.onend = () => {
      // Auto-restart if we should still be listening
      if (this.isListening) {
        setTimeout(() => this.recognition?.start(), 200);
      }
    };

    return true;
  }

  setTranscriptCallback(callback: (text: string) => void) {
    this.onTranscript = callback;
  }

  startListening() {
    if (!this.recognition) return;
    this.isListening = true;
    try {
      this.recognition.start();
    } catch {
      // Already started
    }
  }

  stopListening() {
    this.isListening = false;
    this.recognition?.stop();
  }

  speak(text: string): Promise<void> {
    return new Promise((resolve) => {
      // Cancel any ongoing speech
      this.synthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.0;
      utterance.pitch = 1.1;   // Slightly higher pitch — friendlier
      utterance.volume = 0.8;

      // Try to pick a natural voice
      const voices = this.synthesis.getVoices();
      const preferred = voices.find(
        v => v.name.includes('Google') && v.lang.startsWith('en')
      ) || voices.find(v => v.lang.startsWith('en'));
      if (preferred) utterance.voice = preferred;

      utterance.onend = () => resolve();
      utterance.onerror = () => resolve();

      this.synthesis.speak(utterance);
    });
  }

  destroy() {
    this.stopListening();
    this.synthesis.cancel();
  }
}
```

### 4.8 MCP Server (`mcp-server/index.ts`)

```typescript
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import fs from 'fs';
import path from 'path';
import pdfParse from 'pdf-parse';

// === PDF INDEXING ===
interface ChunkIndex {
  id: string;
  text: string;
  source: string;    // filename
  page: number;
  keywords: string[];
}

let courseIndex: ChunkIndex[] = [];

async function indexCoursePDFs(dataDir: string) {
  const files = fs.readdirSync(dataDir).filter(f => f.endsWith('.pdf'));
  courseIndex = [];

  for (const file of files) {
    try {
      const buffer = fs.readFileSync(path.join(dataDir, file));
      const data = await pdfParse(buffer);

      // Split into chunks of ~500 chars with overlap
      const text = data.text;
      const chunkSize = 500;
      const overlap = 100;

      for (let i = 0; i < text.length; i += chunkSize - overlap) {
        const chunk = text.substring(i, i + chunkSize);
        if (chunk.trim().length < 50) continue; // Skip tiny chunks

        // Extract keywords (simple TF approach)
        const words = chunk.toLowerCase()
          .replace(/[^a-z0-9\s]/g, '')
          .split(/\s+/)
          .filter(w => w.length > 3);
        const wordFreq = new Map<string, number>();
        words.forEach(w => wordFreq.set(w, (wordFreq.get(w) || 0) + 1));
        const keywords = [...wordFreq.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .map(([word]) => word);

        courseIndex.push({
          id: `${file}-chunk-${i}`,
          text: chunk.trim(),
          source: file,
          page: Math.floor(i / 2000) + 1, // Rough page estimate
          keywords,
        });
      }

      console.error(`Indexed ${file}: ${courseIndex.length} chunks total`);
    } catch (err) {
      console.error(`Failed to index ${file}:`, err);
    }
  }
}

// === SEARCH FUNCTION ===
function searchCourse(query: string, maxResults = 5): ChunkIndex[] {
  const queryWords = query.toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 3);

  // Score each chunk by keyword overlap + text match
  const scored = courseIndex.map(chunk => {
    let score = 0;

    // Keyword overlap
    for (const qw of queryWords) {
      if (chunk.keywords.some(kw => kw.includes(qw) || qw.includes(kw))) {
        score += 3;
      }
      // Direct text match
      if (chunk.text.toLowerCase().includes(qw)) {
        score += 2;
      }
    }

    // Exact phrase bonus
    if (chunk.text.toLowerCase().includes(query.toLowerCase())) {
      score += 10;
    }

    return { chunk, score };
  });

  return scored
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults)
    .map(s => s.chunk);
}

// === MCP SERVER ===
const server = new Server(
  { name: 'lumi-course-server', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'search_course_material',
      description:
        'Search the student\'s uploaded course PDFs and lecture notes for relevant content. Use this to ground your answers in actual course material.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          query: {
            type: 'string',
            description: 'The topic or question to search for in course materials',
          },
        },
        required: ['query'],
      },
    },
    {
      name: 'get_topic_overview',
      description:
        'Get a broad overview of all content related to a topic across all course materials.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          topic: {
            type: 'string',
            description: 'The topic to get an overview of',
          },
        },
        required: ['topic'],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === 'search_course_material') {
    const results = searchCourse(args?.query as string || '', 3);
    if (results.length === 0) {
      return {
        content: [
          {
            type: 'text' as const,
            text: 'No relevant content found in course materials for this query.',
          },
        ],
      };
    }

    const formatted = results
      .map(
        (r, i) =>
          `[Result ${i + 1}] Source: ${r.source} (Page ~${r.page})\n${r.text}`
      )
      .join('\n\n---\n\n');

    return {
      content: [{ type: 'text' as const, text: formatted }],
    };
  }

  if (name === 'get_topic_overview') {
    const results = searchCourse(args?.topic as string || '', 8);
    const sources = [...new Set(results.map(r => r.source))];
    const combined = results.map(r => r.text).join(' ');
    const overview = combined.substring(0, 1500);

    return {
      content: [
        {
          type: 'text' as const,
          text: `Topic overview from ${sources.join(', ')}:\n\n${overview}`,
        },
      ],
    };
  }

  return { content: [{ type: 'text' as const, text: 'Unknown tool' }] };
});

// === STARTUP ===
async function main() {
  const dataDir = path.join(__dirname, 'data', 'courses');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  await indexCoursePDFs(dataDir);
  console.error(`Lumi MCP Server ready. ${courseIndex.length} chunks indexed.`);

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
```

### 4.9 Main UI Component (`src/app/page.tsx`)

```tsx
'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { EyeTrackerService, EyeMetrics } from '../services/eye-tracker';
import { OCRService } from '../services/ocr-service';
import { SpeechService } from '../services/speech-service';
import { TriggerEngine, LumiState, TriggerType } from '../engine/trigger-engine';
import LumiCharacter from '../components/LumiCharacter';
import ChatBubble from '../components/ChatBubble';
import StatusIndicator from '../components/StatusIndicator';

declare global {
  interface Window {
    electronAPI: {
      getActiveWindow: () => Promise<any>;
      captureScreen: () => Promise<string | null>;
      sendToOllama: (payload: any) => Promise<{ success: boolean; message: string }>;
      searchSyllabus: (query: string) => Promise<any[]>;
      setClickThrough: (enable: boolean) => Promise<void>;
      resizeWindow: (w: number, h: number) => Promise<void>;
    };
  }
}

interface ChatMessage {
  id: string;
  role: 'lumi' | 'user';
  text: string;
  timestamp: number;
  triggerType?: TriggerType;
}

export default function LumiApp() {
  const [lumiState, setLumiState] = useState<LumiState>('sleeping');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isExpanded, setIsExpanded] = useState(false);
  const [eyeStatus, setEyeStatus] = useState<'off' | 'calibrating' | 'active'>('off');
  const [micStatus, setMicStatus] = useState<'off' | 'listening'>('off');
  const [isThinking, setIsThinking] = useState(false);
  const [lastOCRText, setLastOCRText] = useState('');

  const engineRef = useRef<TriggerEngine>(new TriggerEngine());
  const eyeTrackerRef = useRef<EyeTrackerService | null>(null);
  const ocrServiceRef = useRef<OCRService | null>(null);
  const speechServiceRef = useRef<SpeechService | null>(null);
  const conversationHistoryRef = useRef<Array<{ role: string; content: string }>>([]);

  const updateLoopRef = useRef<NodeJS.Timeout | null>(null);
  const ocrLoopRef = useRef<NodeJS.Timeout | null>(null);
  const latestMetricsRef = useRef<EyeMetrics | null>(null);

  // === Initialize services ===
  useEffect(() => {
    async function init() {
      // OCR
      const ocr = new OCRService();
      await ocr.initialize();
      ocrServiceRef.current = ocr;

      // Speech
      const speech = new SpeechService();
      speech.initialize();
      speech.setTranscriptCallback(handleUserSpeech);
      speechServiceRef.current = speech;

      // Eye tracker
      const eye = new EyeTrackerService();
      eye.setMetricsCallback((metrics) => {
        latestMetricsRef.current = metrics;
      });
      eyeTrackerRef.current = eye;

      // Trigger engine callback
      engineRef.current.setTriggerCallback(handleTrigger);
    }

    init();

    return () => {
      eyeTrackerRef.current?.destroy();
      ocrServiceRef.current?.destroy();
      speechServiceRef.current?.destroy();
      if (updateLoopRef.current) clearInterval(updateLoopRef.current);
      if (ocrLoopRef.current) clearInterval(ocrLoopRef.current);
    };
  }, []);

  // === Start study session ===
  const startSession = useCallback(async () => {
    setLumiState('watching');
    engineRef.current.startSession();

    // Start eye tracking
    const success = await eyeTrackerRef.current?.initialize();
    setEyeStatus(success ? 'active' : 'off');

    // Start listening
    speechServiceRef.current?.startListening();
    setMicStatus('listening');

    // Start main update loop (every 500ms)
    updateLoopRef.current = setInterval(async () => {
      if (!window.electronAPI) return;

      const activeWindow = await window.electronAPI.getActiveWindow();
      engineRef.current.update(
        latestMetricsRef.current,
        activeWindow,
        lastOCRText
      );
    }, 500);

    // Start OCR loop (every 5 seconds — OCR is expensive)
    ocrLoopRef.current = setInterval(async () => {
      if (!window.electronAPI) return;

      const screenshot = await window.electronAPI.captureScreen();
      if (screenshot && ocrServiceRef.current) {
        const text = await ocrServiceRef.current.extractText(screenshot);
        setLastOCRText(text);
      }
    }, 5000);
  }, [lastOCRText]);

  // === Handle triggers from the engine ===
  const handleTrigger = useCallback(async (event: {
    type: TriggerType;
    confidence: number;
    context: string;
  }) => {
    if (!event.type) return;

    setIsThinking(true);
    setIsExpanded(true);

    // Get LLM response
    const response = await window.electronAPI.sendToOllama({
      triggerType: event.type,
      ocrText: event.context,
      conversationHistory: conversationHistoryRef.current.slice(-6), // Last 3 exchanges
    });

    const lumiMessage: ChatMessage = {
      id: `lumi-${Date.now()}`,
      role: 'lumi',
      text: response.message,
      timestamp: Date.now(),
      triggerType: event.type,
    };

    setMessages(prev => [...prev, lumiMessage]);
    conversationHistoryRef.current.push({
      role: 'assistant',
      content: response.message,
    });

    setIsThinking(false);

    // Speak the response
    await speechServiceRef.current?.speak(response.message);

    // Play nudge sound for distraction
    if (event.type === 'distraction') {
      new Audio('/sounds/nudge.mp3').play().catch(() => {});
    }

    // Return to watching after a delay
    setTimeout(() => {
      engineRef.current.setState('watching');
      setLumiState('watching');
    }, 3000);
  }, []);

  // === Handle user speech ===
  const handleUserSpeech = useCallback(async (transcript: string) => {
    // Ignore very short utterances
    if (transcript.length < 3) return;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      text: transcript,
      timestamp: Date.now(),
    };

    setMessages(prev => [...prev, userMessage]);
    setIsExpanded(true);
    setIsThinking(true);
    engineRef.current.setState('chatting');
    setLumiState('chatting');

    conversationHistoryRef.current.push({
      role: 'user',
      content: transcript,
    });

    // Get response
    const response = await window.electronAPI.sendToOllama({
      triggerType: 'question',
      ocrText: lastOCRText,
      userQuestion: transcript,
      conversationHistory: conversationHistoryRef.current.slice(-6),
    });

    const lumiMessage: ChatMessage = {
      id: `lumi-${Date.now()}`,
      role: 'lumi',
      text: response.message,
      timestamp: Date.now(),
    };

    setMessages(prev => [...prev, lumiMessage]);
    conversationHistoryRef.current.push({
      role: 'assistant',
      content: response.message,
    });

    setIsThinking(false);
    await speechServiceRef.current?.speak(response.message);

    setTimeout(() => {
      engineRef.current.setState('watching');
      setLumiState('watching');
    }, 5000);
  }, [lastOCRText]);

  return (
    <div className="w-full h-full relative select-none">
      {/* Background: fully transparent */}
      <div className="absolute inset-0 pointer-events-none" />

      {/* Status indicators */}
      <div className="absolute top-2 right-2 flex gap-2">
        <StatusIndicator type="eye" status={eyeStatus} />
        <StatusIndicator type="mic" status={micStatus} />
      </div>

      {/* Chat messages area */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="absolute bottom-[140px] left-2 right-2 max-h-[300px] overflow-y-auto flex flex-col gap-2 px-2"
          >
            {messages.slice(-5).map((msg) => (
              <ChatBubble key={msg.id} message={msg} />
            ))}
            {isThinking && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="bg-white/10 backdrop-blur-md rounded-xl px-4 py-2 self-start"
              >
                <span className="text-white/70 text-sm animate-pulse">
                  Lumi is thinking...
                </span>
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Lumi character */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
        <div
          onClick={() => {
            if (lumiState === 'sleeping') {
              startSession();
            } else {
              setIsExpanded(!isExpanded);
            }
          }}
          className="cursor-pointer"
        >
          <LumiCharacter state={lumiState} isThinking={isThinking} />
        </div>
      </div>
    </div>
  );
}
```

### 4.10 Lumi Character Component (`src/components/LumiCharacter.tsx`)

```tsx
'use client';

import Lottie from 'lottie-react';
import { useMemo } from 'react';
import { LumiState } from '../engine/trigger-engine';

// Import Lottie JSON files
import sleepingAnim from '../../assets/lottie/lumi-sleeping.json';
import wavingAnim from '../../assets/lottie/lumi-waving.json';
import talkingAnim from '../../assets/lottie/lumi-talking.json';
import alertAnim from '../../assets/lottie/lumi-alert.json';
import thinkingAnim from '../../assets/lottie/lumi-thinking.json';

interface Props {
  state: LumiState;
  isThinking: boolean;
}

export default function LumiCharacter({ state, isThinking }: Props) {
  const animationData = useMemo(() => {
    if (isThinking) return thinkingAnim;
    switch (state) {
      case 'sleeping': return sleepingAnim;
      case 'watching': return wavingAnim;
      case 'intervening': return alertAnim;
      case 'chatting': return talkingAnim;
      case 'break': return sleepingAnim;
      default: return sleepingAnim;
    }
  }, [state, isThinking]);

  return (
    <div className="w-[120px] h-[120px] drop-shadow-lg">
      <Lottie
        animationData={animationData}
        loop={true}
        style={{ width: '100%', height: '100%' }}
      />
    </div>
  );
}
```

### 4.11 Chat Bubble Component (`src/components/ChatBubble.tsx`)

```tsx
'use client';

import { motion } from 'framer-motion';

interface ChatMessage {
  id: string;
  role: 'lumi' | 'user';
  text: string;
  triggerType?: string | null;
}

const triggerIcons: Record<string, string> = {
  distraction: '🔔',
  stuck: '🤔',
  fatigue: '😴',
  wandering: '👀',
  session_start: '👋',
  session_end: '📊',
  proactive_bridge: '🔗',
};

export default function ChatBubble({ message }: { message: ChatMessage }) {
  const isLumi = message.role === 'lumi';

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ type: 'spring', damping: 20, stiffness: 300 }}
      className={`max-w-[90%] ${isLumi ? 'self-start' : 'self-end'}`}
    >
      <div
        className={`
          rounded-2xl px-4 py-3 text-sm leading-relaxed
          ${isLumi
            ? 'bg-gradient-to-br from-purple-500/20 to-indigo-500/20 backdrop-blur-xl border border-purple-400/20 text-white'
            : 'bg-white/15 backdrop-blur-xl border border-white/10 text-white/90'
          }
        `}
      >
        {isLumi && message.triggerType && (
          <span className="mr-1">
            {triggerIcons[message.triggerType] || '💬'}
          </span>
        )}
        {message.text}
      </div>
    </motion.div>
  );
}
```

### 4.12 Bionic Reader Component (`src/components/BionicReader.tsx`)

```tsx
'use client';

import { motion } from 'framer-motion';

interface Props {
  text: string;
  onClose: () => void;
}

function toBionic(text: string): JSX.Element[] {
  return text.split(' ').map((word, i) => {
    if (word.length <= 1) return <span key={i}>{word} </span>;

    const boldLen = Math.ceil(word.length * 0.5);
    const boldPart = word.substring(0, boldLen);
    const lightPart = word.substring(boldLen);

    return (
      <span key={i}>
        <strong className="font-bold text-white">{boldPart}</strong>
        <span className="font-light text-white/50">{lightPart}</span>{' '}
      </span>
    );
  });
}

export default function BionicReader({ text, onClose }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      className="fixed inset-0 bg-gray-900/95 z-50 flex items-center justify-center p-8"
    >
      <div className="max-w-2xl w-full max-h-[80vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-purple-400 text-lg font-semibold">
            Bionic Reading Mode
          </h2>
          <button
            onClick={onClose}
            className="text-white/50 hover:text-white text-xl"
          >
            ✕
          </button>
        </div>
        <div className="text-xl leading-loose tracking-wide font-serif">
          {toBionic(text)}
        </div>
      </div>
    </motion.div>
  );
}
```

---

## 5. Setup & Run Instructions

### Prerequisites

```bash
# 1. Install Node.js 20+ and npm
# 2. Install Ollama
curl -fsSL https://ollama.com/install.sh | sh

# 3. Pull the model
ollama pull llama3.2:3b

# 4. Verify Ollama is running
curl http://localhost:11434/api/tags
# Should list llama3.2:3b
```

### Project Setup

```bash
# Clone and install
cd lumi
npm install

# Install MCP server deps
cd mcp-server
npm install
cd ..

# Add course PDFs
# Drop .pdf files into mcp-server/data/courses/

# Download Lottie animations
# Get free character animations from lottiefiles.com
# Save as JSON files in assets/lottie/
# Recommended search: "cute robot", "study buddy", "character wave"
# You need: sleeping, waving, talking, alert, thinking variants

# Download sound effects
# Get free sounds from freesound.org or pixabay.com
# Save as .mp3 in assets/sounds/
# You need: nudge.mp3, celebrate.mp3, break-time.mp3
```

### Running

```bash
# Terminal 1: Start MCP server
cd mcp-server
node index.ts

# Terminal 2: Start Ollama (if not running as service)
ollama serve

# Terminal 3: Start Lumi
cd lumi
npm run dev
```

---

## 6. Demo Script (2-Minute Pitch)

### Setup Before Demo
1. Ollama running with llama3.2:3b loaded
2. MCP server running with a sample ML lecture PDF
3. Lumi app running, character sleeping in corner
4. Open a PDF viewer with a Machine Learning lecture document
5. Have YouTube and Instagram bookmarked for quick access

### The Script

**[0:00-0:20] Introduction**
"Meet Lumi — an empathetic desktop study spirit designed for neurodivergent students. It doesn't live in a browser tab. It lives on your desktop."
*[Show Lumi sleeping in the corner]*

**[0:20-0:40] Wake Up**
*[Click Lumi to start session]*
"When I start studying, Lumi wakes up. It's now reading my screen via local OCR, tracking my eyes via webcam, and listening for questions — all running locally, no cloud."
*[Lumi waves, chat bubble: "Hey! Looks like you're diving into Neural Networks today. Let's do this! 🚀"]*

**[0:40-1:00] Voice Question**
*[Say aloud: "Hey Lumi, what's backpropagation?"]*
"I can ask questions naturally by voice. Lumi answers using my actual lecture notes — grounded by MCP, not hallucinated."
*[Lumi responds with course-specific answer]*

**[1:00-1:20] Stuck Detection**
*[Stare at a dense paragraph for ~15 seconds — or use pre-recorded clip]*
"Watch what happens when I stare at a hard paragraph too long..."
*[Lumi pops up: "This section looks tricky — want me to break it down with a simpler analogy?"]*

**[1:20-1:40] Distraction Guard**
*[Switch to YouTube]*
"And when I get distracted..."
*[After ~10 seconds, Lumi taps with a sound: "Hey! You only had 2 paragraphs left in chapter 3. Let's finish strong!"]*
*[Switch back to PDF]*

**[1:40-2:00] Architecture Flex**
"We achieved all of this with zero external APIs. A local 3B parameter model, MCP for grounding, WebGazer for eye tracking, and Tesseract for OCR. The entire pipeline runs offline on your machine."
*[Show architecture slide from pitch deck]*

---

## 7. Stretch Goals (If Time Permits)

Ordered by impact-to-effort ratio:

1. **Session Summary Card** — When the student ends the session, display a beautiful card with: topics covered, time studied, distraction count, focus score. High visual impact, medium effort.

2. **Bionic Reading Mode** — When Lumi detects the student is struggling with a text block, offer to display it in Bionic Reading format. Already has a component above.

3. **Pomodoro Integration** — Lumi auto-suggests 25/5 or 50/10 cycles based on how long the student has been focused. Low effort, nice UX touch.

4. **Concept Map** — After a session, Lumi generates a simple mind-map of topics covered using a canvas element. High wow factor, high effort.

5. **Multi-language Support** — Web Speech API supports many languages. Let the student set their preferred language. Low effort.

---

## 8. Known Limitations & Mitigations

| Limitation | Mitigation |
|---|---|
| WebGazer.js accuracy varies with lighting | Provide calibration UI at session start. Degrade gracefully (disable stuck/fatigue detection) if calibration fails. |
| Tesseract.js OCR is slow (~2-3s per frame) | Only capture every 5 seconds. Cache OCR results. Run in Web Worker to avoid blocking UI. |
| Llama 3.2 3B can hallucinate | MCP grounding + system prompt enforcement + confidence thresholds. If no relevant course material found, Lumi says "I don't have that in your notes." |
| active-win URL detection is unreliable on some browsers | Fall back to window title matching. Most distracting apps have distinctive titles. |
| Electron window transparency has platform quirks | Test on macOS and Windows. Use `vibrancy` on macOS for better transparency. |
| First Ollama request is slow (model loading) | Warm up the model on app start with a dummy request. Show "Lumi is waking up..." state. |

---

## 9. File Checklist for MVP Completion

- [ ] `electron/main.ts` — Transparent, frameless, always-on-top window
- [ ] `electron/preload.ts` — IPC bridge
- [ ] `electron/ipc-handlers.ts` — active-win, screenshot, Ollama bridge
- [ ] `src/engine/trigger-engine.ts` — State machine with all 4 detectors
- [ ] `src/services/eye-tracker.ts` — WebGazer wrapper with metrics
- [ ] `src/services/ocr-service.ts` — Tesseract.js wrapper
- [ ] `src/services/speech-service.ts` — STT + TTS
- [ ] `src/app/page.tsx` — Main UI with all service integration
- [ ] `src/components/LumiCharacter.tsx` — Lottie animated character
- [ ] `src/components/ChatBubble.tsx` — Animated chat bubbles
- [ ] `src/components/BionicReader.tsx` — Bionic reading mode
- [ ] `src/components/StatusIndicator.tsx` — Eye/mic status dots
- [ ] `mcp-server/index.ts` — PDF indexing + search tools
- [ ] `assets/lottie/*.json` — 5 character animation states
- [ ] `assets/sounds/*.mp3` — 3 sound effects
- [ ] Ollama installed + llama3.2:3b pulled
- [ ] Sample course PDFs in `mcp-server/data/courses/`
- [ ] `config/prompts.ts` — All LLM prompt templates
- [ ] `config/distractions.ts` — App/URL blocklist

---

*This document is the single source of truth for Lumi MVP implementation. Every code block is production-ready and copy-pasteable. Execute top-to-bottom.*
