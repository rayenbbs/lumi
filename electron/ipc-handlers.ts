import { ipcMain, BrowserWindow, desktopCapturer, screen } from 'electron'
import { mainWindow } from './main'
import Store from 'electron-store'

let dropZoneWindow: BrowserWindow | null = null

let activeWinModule: any = null

// active-win is ESM-only, must be dynamically imported
async function getActiveWin() {
  if (!activeWinModule) {
    activeWinModule = await import('active-win')
  }
  return activeWinModule.default()
}

export function registerIpcHandlers(win: BrowserWindow) {

  const sessionStore = new Store({
    name: 'lumi',
  })

  // === ACTIVE WINDOW DETECTION ===
  ipcMain.handle('get-active-window', async () => {
    try {
      const result = await getActiveWin()
      if (!result) return null
      return {
        title: result.title || '',
        owner: result.owner?.name || '',
        url: result.url || null,
        pid: result.owner?.processId || 0,
      }
    } catch (err) {
      console.warn('[IPC] get-active-window failed:', err)
      return null
    }
  })

  // === SCREENSHOT CAPTURE ===
  ipcMain.handle('capture-screen', async () => {
    try {
      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width: 1280, height: 720 },
      })
      if (sources.length === 0) return null
      return sources[0].thumbnail.toDataURL()
    } catch (err) {
      console.warn('[IPC] capture-screen failed:', err)
      return null
    }
  })

  // === GEMINI BRIDGE ===
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY || ''
  const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemma-3-27b-it:generateContent?key=${GEMINI_API_KEY}`

  ipcMain.handle('send-to-ollama', async (_event, payload) => {
    try {
      const {
        triggerType,
        ocrText,
        userQuestion,
        conversationHistory,
        syllabusContext,
      } = payload

      const systemPrompt = buildSystemPrompt(triggerType, ocrText, syllabusContext)

      // Convert conversation history — Gemini uses "model" not "assistant"
      // Also merge consecutive same-role turns (Gemini requires strict alternation)
      const rawContents = conversationHistory.map((m: { role: string; content: string }) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        text: m.content,
      }))

      if (userQuestion) {
        rawContents.push({ role: 'user', text: userQuestion })
      }

      // Gemini requires at least one user turn ending the contents array
      if (rawContents.length === 0 || rawContents[rawContents.length - 1].role !== 'user') {
        rawContents.push({ role: 'user', text: 'What should I know right now?' })
      }

      // Merge consecutive same-role messages so Gemini doesn't reject
      const contents: Array<{ role: string; parts: Array<{ text: string }> }> = []
      for (const msg of rawContents) {
        const last = contents[contents.length - 1]
        if (last && last.role === msg.role) {
          last.parts[0].text += '\n' + msg.text
        } else {
          contents.push({ role: msg.role, parts: [{ text: msg.text }] })
        }
      }

      // Prepend system prompt into the first user turn (Gemma doesn't support system_instruction)
      if (contents.length > 0 && contents[0].role === 'user') {
        contents[0].parts[0].text = systemPrompt + '\n\n' + contents[0].parts[0].text
      } else {
        contents.unshift({ role: 'user', parts: [{ text: systemPrompt }] })
      }

      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 30000)

      const response = await fetch(GEMINI_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          contents,
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 200,
            topP: 0.9,
          },
        }),
      })

      clearTimeout(timeout)
      const data = await response.json()

      if (data.error) {
        console.error('[Gemini] API error:', data.error.message || JSON.stringify(data.error))
        return {
          success: false,
          message: `Gemini error: ${data.error.message || 'Unknown error'}`,
        }
      }

      const text = data.candidates?.[0]?.content?.parts?.[0]?.text
      if (!text) {
        console.warn('[Gemini] No text in response:', JSON.stringify(data).substring(0, 500))
      }
      return {
        success: true,
        message: text || "I couldn't generate a response.",
      }
    } catch (error: any) {
      console.error('[IPC] send-to-gemini failed:', error)
      const isTimeout = error?.name === 'AbortError'
      return {
        success: false,
        message: isTimeout
          ? "I'm taking too long to think. Try a simpler question!"
          : "I'm having trouble connecting to Gemini. Check your internet connection.",
        error: String(error),
      }
    }
  })

  // === MCP SYLLABUS SEARCH ===
  ipcMain.handle('search-syllabus', async (_event, query: string) => {
    try {
      const response = await fetch('http://localhost:3001/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      })
      const data = await response.json()
      return data.results || []
    } catch {
      // MCP server not running — return empty, app continues without it
      return []
    }
  })

  // === WINDOW CONTROLS ===
  ipcMain.handle('set-click-through', (_event, enable: boolean) => {
    win.setIgnoreMouseEvents(enable, { forward: true })
  })

  ipcMain.handle('resize-window', (_event, width: number, height: number) => {
    win.setSize(width, height, true)
  })

  // === DRAG & DROP ZONE ===
  ipcMain.handle('get-window-position', () => {
    const [x, y] = win.getPosition()
    return { x, y }
  })

  ipcMain.handle('close-app', () => {
    if (dropZoneWindow) {
      dropZoneWindow.destroy()
      dropZoneWindow = null
    }
    win.close()
  })

  // Start dragging: show drop zone, begin moving window with mouse via screen cursor polling
  let dragInterval: ReturnType<typeof setInterval> | null = null

  ipcMain.handle('start-drag', (_event, mouseX: number, mouseY: number) => {
    const [winX, winY] = win.getPosition()
    const offsetX = mouseX - winX
    const offsetY = mouseY - winY

    // Show drop zone
    const { width, height } = screen.getPrimaryDisplay().workAreaSize
    const zoneW = 120
    const zoneH = 120
    const zoneX = Math.round(width / 2 - zoneW / 2)
    const zoneY = height - zoneH - 20

    if (!dropZoneWindow) {
      dropZoneWindow = new BrowserWindow({
        x: zoneX,
        y: zoneY,
        width: zoneW,
        height: zoneH,
        transparent: true,
        frame: false,
        alwaysOnTop: true,
        skipTaskbar: true,
        resizable: false,
        focusable: false,
        hasShadow: false,
        webPreferences: { contextIsolation: true, nodeIntegration: false },
      })

      dropZoneWindow.setIgnoreMouseEvents(true)

      const html = `
        <html>
        <body style="margin:0;background:transparent;display:flex;align-items:center;justify-content:center;height:100vh;">
          <div id="bucket" style="
            width:90px;height:90px;border-radius:50%;
            background:rgba(239,68,68,0.15);
            border:2px dashed rgba(239,68,68,0.6);
            display:flex;align-items:center;justify-content:center;
            transition:all 0.2s ease;
          ">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="rgba(239,68,68,0.8)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
              <line x1="10" y1="11" x2="10" y2="17"/>
              <line x1="14" y1="11" x2="14" y2="17"/>
            </svg>
          </div>
        </body>
        </html>
      `
      dropZoneWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
      dropZoneWindow.on('closed', () => { dropZoneWindow = null })
    }

    // Use cursor polling from main process — this works even when cursor is outside the window
    let wasOverDropZone = false

    if (dragInterval) clearInterval(dragInterval)
    dragInterval = setInterval(() => {
      const cursor = screen.getCursorScreenPoint()
      const newX = cursor.x - offsetX
      const newY = cursor.y - offsetY
      win.setPosition(Math.round(newX), Math.round(newY), false)

      // Check if cursor is near the drop zone (generous 80px padding)
      const pad = 80
      const isOver =
        cursor.x > zoneX - pad &&
        cursor.x < zoneX + zoneW + pad &&
        cursor.y > zoneY - pad &&
        cursor.y < zoneY + zoneH + pad

      if (isOver !== wasOverDropZone) {
        wasOverDropZone = isOver
        if (dropZoneWindow) {
          dropZoneWindow.webContents.executeJavaScript(`
            document.getElementById('bucket').style.background = ${isOver}
              ? 'rgba(239,68,68,0.35)'
              : 'rgba(239,68,68,0.15)';
            document.getElementById('bucket').style.transform = ${isOver}
              ? 'scale(1.15)'
              : 'scale(1)';
          `).catch(() => {})
        }
      }
    }, 16) // ~60fps

    return { zoneX, zoneY, zoneW, zoneH }
  })

  ipcMain.handle('stop-drag', () => {
    if (dragInterval) {
      clearInterval(dragInterval)
      dragInterval = null
    }

    // Check if window is over the drop zone
    const cursor = screen.getCursorScreenPoint()
    const { width, height } = screen.getPrimaryDisplay().workAreaSize
    const zoneW = 120
    const zoneH = 120
    const zoneX = Math.round(width / 2 - zoneW / 2)
    const zoneY = height - zoneH - 20
    const pad = 80

    const isOver =
      cursor.x > zoneX - pad &&
      cursor.x < zoneX + zoneW + pad &&
      cursor.y > zoneY - pad &&
      cursor.y < zoneY + zoneH + pad

    if (dropZoneWindow) {
      dropZoneWindow.destroy()
      dropZoneWindow = null
    }

    if (isOver) {
      win.close()
    }

    return { closed: isOver }
  })

  // === SESSION PERSISTENCE ===
  ipcMain.handle('save-session', (_event, data: any) => {
    const current = (sessionStore.get('sessionData') as Record<string, any> | undefined) ?? {}
    sessionStore.set('sessionData', { ...current, ...data })
    return true
  })

  ipcMain.handle('load-session', () => {
    return (sessionStore.get('sessionData') as Record<string, any> | undefined) ?? {}
  })
}

function buildSystemPrompt(
  triggerType: string,
  ocrText: string,
  syllabusContext?: string
): string {
  const base = `You are Lumi, a warm, empathetic AI study companion designed for neurodivergent students (ADHD, Autism, Dyslexia). You live as an animated character on the student's desktop.

CRITICAL RULES:
- Keep responses to 1-3 sentences maximum. You speak in chat bubbles — brevity is essential.
- Be warm, encouraging, and never condescending or scolding.
- Use casual, friendly language. You're a supportive friend, not a teacher.
- If you reference course material, cite the specific topic.
- If you're unsure about something, say so honestly.
- Never generate information not grounded in the provided context.
- Use occasional emoji sparingly (1 per message max).${syllabusContext ? `\n\nRELEVANT COURSE MATERIAL:\n${syllabusContext}` : ''}`

  const triggerContexts: Record<string, string> = {
    distraction: `The student just switched to a distracting app/website. GENTLY redirect them back to studying. Be encouraging about their progress. Never scold. Make them WANT to come back.\n\nContext: ${ocrText}`,

    stuck: `The student has been staring at the same content for 40+ seconds without scrolling. They might be confused. Offer to help explain in simpler terms.\n\nContent they're stuck on: ${ocrText.substring(0, 500)}`,

    fatigue: `The student is showing signs of fatigue. Suggest a break and celebrate their progress.\n\nStudy context: ${ocrText.substring(0, 200)}`,

    wandering: `The student's gaze has wandered off screen for a while. Gently bring their attention back.\n\nLast content: ${ocrText.substring(0, 200)}`,

    question: `The student is asking a direct question. Answer using ONLY the provided course context. If context doesn't contain the answer, say so honestly.\n\nScreen content: ${ocrText}`,

    session_start: `The student just started studying. Welcome them warmly and briefly. Keep it to 1-2 sentences.\n\nOpened: ${ocrText.substring(0, 100)}`,

    session_end: `The study session is ending. Briefly summarize effort, praise it, and suggest next review. 2-3 sentences max.\n\nSession: ${ocrText.substring(0, 300)}`,

    proactive_bridge: `The current material may require prerequisite knowledge. Proactively offer a quick refresher.\n\nCurrent topic: ${ocrText.substring(0, 300)}`,
  }

  const ctx = triggerContexts[triggerType] || triggerContexts.question
  return `${base}\n\n${ctx}`
}
