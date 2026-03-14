import { ipcMain, BrowserWindow, desktopCapturer } from 'electron'
import { mainWindow } from './main'
import Store from 'electron-store'

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
  const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`

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

      // Gemini contents must start with a user turn
      if (contents.length > 0 && contents[0].role !== 'user') {
        contents.unshift({ role: 'user', parts: [{ text: '(context)' }] })
      }

      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 30000)

      const response = await fetch(GEMINI_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
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
