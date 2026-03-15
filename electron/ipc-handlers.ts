import { ipcMain, BrowserWindow, desktopCapturer, screen } from 'electron'
import { mainWindow } from './main'
import Store from 'electron-store'
import path from 'path'
import { createHash } from 'crypto'
import mammoth from 'mammoth'
import { createWorker, Worker } from 'tesseract.js'
import {
  createCanvas,
  DOMMatrix as CanvasDOMMatrix,
  ImageData as CanvasImageData,
  Path2D as CanvasPath2D,
} from '@napi-rs/canvas'

let dropZoneWindow: BrowserWindow | null = null

let activeWinModule: any = null

const MAX_ATTACHMENT_TEXT = 12000
let attachmentOCRWorker: Worker | null = null
const PDF_TEXT_MAX_PAGES = 20
const PDF_OCR_MAX_PAGES = 8
const ATTACHMENT_CACHE_MAX_ITEMS = 120
let pdfRuntimePrepared = false

type CachedAttachmentValue = Omit<ProcessedAttachmentPayload, 'id'>
const attachmentProcessingCache = new Map<string, CachedAttachmentValue>()

interface AttachmentPayload {
  id: string
  name: string
  size: number
  type: string
  dataUrl: string
}

interface ProcessedAttachmentPayload {
  id: string
  name: string
  size: number
  type: string
  previewText?: string
  extractedText?: string
  unsupported?: boolean
}

function dataUrlToBuffer(dataUrl: string): Buffer {
  const commaIndex = dataUrl.indexOf(',')
  if (commaIndex < 0) {
    throw new Error('Invalid data URL')
  }
  const base64 = dataUrl.slice(commaIndex + 1)
  return Buffer.from(base64, 'base64')
}

function computeAttachmentCacheKey(attachment: AttachmentPayload, buffer: Buffer): string {
  const hash = createHash('sha1').update(buffer).digest('hex')
  const ext = path.extname(attachment.name).toLowerCase()
  return `${attachment.type}|${ext}|${buffer.length}|${hash}`
}

function getCachedAttachment(cacheKey: string): CachedAttachmentValue | null {
  const cached = attachmentProcessingCache.get(cacheKey)
  if (!cached) return null

  // Touch for simple LRU behavior
  attachmentProcessingCache.delete(cacheKey)
  attachmentProcessingCache.set(cacheKey, cached)
  return cached
}

function setCachedAttachment(cacheKey: string, value: CachedAttachmentValue): void {
  if (attachmentProcessingCache.has(cacheKey)) {
    attachmentProcessingCache.delete(cacheKey)
  }
  attachmentProcessingCache.set(cacheKey, value)

  if (attachmentProcessingCache.size > ATTACHMENT_CACHE_MAX_ITEMS) {
    const oldestKey = attachmentProcessingCache.keys().next().value
    if (oldestKey) attachmentProcessingCache.delete(oldestKey)
  }
}

function ensurePdfRuntimePolyfills(): void {
  if (pdfRuntimePrepared) return

  const g = globalThis as any
  if (!g.DOMMatrix) g.DOMMatrix = CanvasDOMMatrix
  if (!g.ImageData) g.ImageData = CanvasImageData
  if (!g.Path2D) g.Path2D = CanvasPath2D
  pdfRuntimePrepared = true
}

function normalizeText(raw: string): string {
  return raw.replace(/\0/g, '').replace(/\r\n/g, '\n').trim()
}

function buildPreview(raw: string): string {
  return raw.slice(0, 180).replace(/\s+/g, ' ').trim() || '(empty content)'
}

function isPlainTextLike(fileName: string, mimeType: string): boolean {
  if (mimeType.startsWith('text/')) return true
  const ext = path.extname(fileName).toLowerCase()
  return [
    '.md', '.markdown', '.txt', '.json', '.csv', '.log', '.xml', '.yml', '.yaml',
    '.ts', '.tsx', '.js', '.jsx', '.py', '.java', '.c', '.cpp', '.cs', '.html', '.css',
  ].includes(ext)
}

function isImageLike(fileName: string, mimeType: string): boolean {
  if (mimeType.startsWith('image/')) return true
  const ext = path.extname(fileName).toLowerCase()
  return ['.png', '.jpg', '.jpeg', '.bmp', '.gif', '.webp', '.tif', '.tiff'].includes(ext)
}

async function getAttachmentOCRWorker(): Promise<Worker> {
  if (!attachmentOCRWorker) {
    attachmentOCRWorker = await createWorker('eng', 1, {
      logger: () => {},
    })
  }
  return attachmentOCRWorker
}

async function extractTextFromImageBuffer(buffer: Buffer): Promise<string> {
  try {
    const worker = await getAttachmentOCRWorker()
    const { data } = await worker.recognize(buffer)
    return normalizeText(data?.text || '').slice(0, MAX_ATTACHMENT_TEXT)
  } catch (err: any) {
    console.warn('[IPC] image OCR failed:', err?.message || err)
    return ''
  }
}

class NodeCanvasFactory {
  create(width: number, height: number): any {
    const canvas = createCanvas(width, height)
    const context = canvas.getContext('2d')
    return { canvas, context }
  }

  reset(canvasAndContext: any, width: number, height: number): void {
    canvasAndContext.canvas.width = width
    canvasAndContext.canvas.height = height
  }

  destroy(canvasAndContext: any): void {
    canvasAndContext.canvas.width = 0
    canvasAndContext.canvas.height = 0
  }
}

async function extractTextFromScannedPdf(buffer: Buffer): Promise<string> {
  try {
    ensurePdfRuntimePolyfills()
    const pdfjs: any = await import('pdfjs-dist/legacy/build/pdf.mjs')
    const loadingTask = pdfjs.getDocument({ data: new Uint8Array(buffer) })
    const pdfDoc = await loadingTask.promise

    const pageCount = Math.min(pdfDoc.numPages || 0, PDF_OCR_MAX_PAGES)
    if (pageCount === 0) return ''

    const canvasFactory = new NodeCanvasFactory()
    let mergedText = ''

    for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
      const page = await pdfDoc.getPage(pageNum)
      const viewport = page.getViewport({ scale: 2.0 })
      const canvasAndContext = canvasFactory.create(Math.ceil(viewport.width), Math.ceil(viewport.height))

      await page.render({
        canvasContext: canvasAndContext.context,
        viewport,
        canvasFactory,
      }).promise

      const pngBuffer = canvasAndContext.canvas.toBuffer('image/png')
      canvasFactory.destroy(canvasAndContext)

      const pageText = await extractTextFromImageBuffer(pngBuffer)
      if (pageText) {
        mergedText += `\n\n[Page ${pageNum}]\n${pageText}`
      }

      if (mergedText.length >= MAX_ATTACHMENT_TEXT) break
    }

    await loadingTask.destroy()
    return normalizeText(mergedText).slice(0, MAX_ATTACHMENT_TEXT)
  } catch (err: any) {
    console.warn('[IPC] scanned PDF OCR failed:', err?.message || err)
    return ''
  }
}

async function extractTextFromPdfTextLayer(buffer: Buffer): Promise<string> {
  try {
    ensurePdfRuntimePolyfills()
    const pdfjs: any = await import('pdfjs-dist/legacy/build/pdf.mjs')
    const loadingTask = pdfjs.getDocument({ data: new Uint8Array(buffer) })
    const pdfDoc = await loadingTask.promise

    const pageCount = Math.min(pdfDoc.numPages || 0, PDF_TEXT_MAX_PAGES)
    if (pageCount === 0) return ''

    let mergedText = ''

    for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
      const page = await pdfDoc.getPage(pageNum)
      const content = await page.getTextContent()
      const pageText = normalizeText(
        (content.items || [])
          .map((item: any) => (typeof item?.str === 'string' ? item.str : ''))
          .join(' ')
      )

      if (pageText) {
        mergedText += `\n\n[Page ${pageNum}]\n${pageText}`
      }

      if (mergedText.length >= MAX_ATTACHMENT_TEXT) break
    }

    await loadingTask.destroy()
    return normalizeText(mergedText).slice(0, MAX_ATTACHMENT_TEXT)
  } catch (err: any) {
    console.warn('[IPC] PDF text-layer extraction failed:', err?.message || err)
    return ''
  }
}

async function processAttachment(attachment: AttachmentPayload): Promise<ProcessedAttachmentPayload> {
  const base: ProcessedAttachmentPayload = {
    id: attachment.id,
    name: attachment.name,
    size: attachment.size,
    type: attachment.type,
  }

  try {
    const ext = path.extname(attachment.name).toLowerCase()
    const mime = (attachment.type || '').toLowerCase()
    const isPdf = ext === '.pdf' || mime === 'application/pdf'
    const isImage = isImageLike(attachment.name, mime)
    const buffer = dataUrlToBuffer(attachment.dataUrl)
    const cacheKey = computeAttachmentCacheKey(attachment, buffer)
    const cached = getCachedAttachment(cacheKey)
    if (cached) {
      return {
        id: attachment.id,
        ...cached,
      }
    }

    const cacheIfEligible = (extracted: ProcessedAttachmentPayload) => {
      // Avoid sticky-failing cache for OCR-driven paths (PDF/image) when unsupported.
      const shouldCacheUnsupported = !isPdf && !isImage
      if (extracted.unsupported && !shouldCacheUnsupported) return

      setCachedAttachment(cacheKey, {
        name: extracted.name,
        size: extracted.size,
        type: extracted.type,
        extractedText: extracted.extractedText,
        previewText: extracted.previewText,
        unsupported: extracted.unsupported,
      })
    }

    if (isPdf) {
      const normalized = await extractTextFromPdfTextLayer(buffer)
      if (normalized.length === 0) {
        const ocrText = await extractTextFromScannedPdf(buffer)
        if (ocrText.length > 0) {
          const extracted: ProcessedAttachmentPayload = {
            ...base,
            extractedText: ocrText,
            previewText: buildPreview(ocrText),
            unsupported: false,
          }
          cacheIfEligible(extracted)
          return extracted
        }
        const extracted: ProcessedAttachmentPayload = {
          ...base,
          unsupported: true,
          previewText: 'No selectable text found in PDF (possibly scanned/image-only PDF)',
        }
        cacheIfEligible(extracted)
        return extracted
      }
      const extracted: ProcessedAttachmentPayload = {
        ...base,
        extractedText: normalized,
        previewText: buildPreview(normalized),
        unsupported: false,
      }
      cacheIfEligible(extracted)
      return extracted
    }

    if (ext === '.docx' || mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      const result = await mammoth.extractRawText({ buffer })
      const normalized = normalizeText(result.value || '').slice(0, MAX_ATTACHMENT_TEXT)
      const extracted: ProcessedAttachmentPayload = {
        ...base,
        extractedText: normalized,
        previewText: buildPreview(normalized),
        unsupported: normalized.length === 0,
      }
      cacheIfEligible(extracted)
      return extracted
    }

    if (isImage) {
      const normalized = await extractTextFromImageBuffer(buffer)
      if (normalized.length === 0) {
        const extracted: ProcessedAttachmentPayload = {
          ...base,
          unsupported: true,
          previewText: 'Image added, but OCR could not extract readable text',
        }
        cacheIfEligible(extracted)
        return extracted
      }
      const extracted: ProcessedAttachmentPayload = {
        ...base,
        extractedText: normalized,
        previewText: buildPreview(normalized),
        unsupported: false,
      }
      cacheIfEligible(extracted)
      return extracted
    }

    if (isPlainTextLike(attachment.name, mime)) {
      const normalized = normalizeText(buffer.toString('utf8')).slice(0, MAX_ATTACHMENT_TEXT)
      const extracted: ProcessedAttachmentPayload = {
        ...base,
        extractedText: normalized,
        previewText: buildPreview(normalized),
        unsupported: normalized.length === 0,
      }
      cacheIfEligible(extracted)
      return extracted
    }

    return {
      ...base,
      unsupported: true,
      previewText: 'Unsupported file type for content extraction',
    }
  } catch (err: any) {
    console.warn('[IPC] processAttachment failed:', attachment.name, err?.message || err)
    return {
      ...base,
      unsupported: true,
      previewText: 'Could not process file',
    }
  }
}

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

  // === ELEVENLABS TTS ===
  const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY || ''
  // "Rachel" — warm, friendly female voice. Change voice_id for different voices.
  const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || 'EXAVITQu4vr4xnSDxMaL'

  ipcMain.handle('text-to-speech', async (_event, text: string) => {
    if (!ELEVENLABS_API_KEY) return { success: false, audio: null }

    try {
      const cleanText = text.replace(
        /[\u{1F600}-\u{1F6FF}]|[\u{2600}-\u{26FF}]/gu,
        ''
      ).trim()
      if (!cleanText) return { success: false, audio: null }

      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 15000)

      const response = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`,
        {
          method: 'POST',
          headers: {
            'xi-api-key': ELEVENLABS_API_KEY,
            'Content-Type': 'application/json',
            'Accept': 'audio/mpeg',
          },
          signal: controller.signal,
          body: JSON.stringify({
            text: cleanText,
            model_id: 'eleven_turbo_v2_5',
            voice_settings: {
              stability: 0.5,
              similarity_boost: 0.75,
              style: 0.4,
              use_speaker_boost: true,
            },
          }),
        }
      )

      clearTimeout(timeout)

      if (!response.ok) {
        console.warn('[TTS] ElevenLabs error:', response.status, await response.text().catch(() => ''))
        return { success: false, audio: null }
      }

      const buffer = await response.arrayBuffer()
      const base64 = Buffer.from(buffer).toString('base64')
      return { success: true, audio: `data:audio/mpeg;base64,${base64}` }
    } catch (err: any) {
      console.warn('[TTS] ElevenLabs failed:', err?.message || err)
      return { success: false, audio: null }
    }
  })

  // === SPEECH-TO-TEXT (Deepgram — free $200 credit) ===
  const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY || ''

  ipcMain.handle('transcribe-audio', async (_event, audioData: Uint8Array) => {
    if (!DEEPGRAM_API_KEY) {
      console.warn('[STT] DEEPGRAM_API_KEY not set in .env')
      return { transcript: '' }
    }
    try {
      const body = Buffer.from(audioData)
      const response = await fetch(
        'https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&language=en',
        {
          method: 'POST',
          headers: {
            Authorization: `Token ${DEEPGRAM_API_KEY}`,
            'Content-Type': 'audio/wav',
          },
          body,
        }
      )
      const data = await response.json()

      if (data.err_code) {
        console.error('[STT] Deepgram error:', data.err_msg)
        return { transcript: '' }
      }

      const transcript = data.results?.channels?.[0]?.alternatives?.[0]?.transcript?.trim() || ''
      if (transcript) console.log('[STT] Deepgram:', transcript)
      return { transcript }
    } catch (err) {
      console.error('[STT] Deepgram failed:', err)
      return { transcript: '' }
    }
  })

  // === GEMINI BRIDGE ===
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY || ''
  const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemma-3-27b-it:generateContent?key=${GEMINI_API_KEY}`

  ipcMain.handle('send-to-gemini', async (_event, payload) => {
    try {
      const {
        triggerType,
        ocrText,
        userQuestion,
        driverState,
        conversationHistory,
        syllabusContext,
      } = payload

      const systemPrompt = buildSystemPrompt(triggerType, ocrText, syllabusContext, driverState)

      console.log('[LLM] triggerType:', triggerType)
      console.log('[LLM] ocrText:', ocrText?.substring(0, 300))
      console.log('[LLM] driverState:', JSON.stringify(driverState))
      console.log('[LLM] systemPrompt:', systemPrompt.substring(0, 500))

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

      const geminiPayload = {
        contents,
        generationConfig: {
          temperature: 1,
          maxOutputTokens: 200,
          topP: 0.9,
        },
      }
      console.log('[LLM] Full Gemini payload:', JSON.stringify(geminiPayload, null, 2))

      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 30000)

      const response = await fetch(GEMINI_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify(geminiPayload),
      })

      clearTimeout(timeout)
      const data = await response.json()
      console.log('[LLM] Gemini response:', JSON.stringify(data).substring(0, 500))

      if (data.error) {
        console.error('[Gemini] API error:', data.error.message || JSON.stringify(data.error))
        return {
          success: false,
          message: `Gemini error: ${data.error.message || 'Unknown error'}`,
        }
      }

      let text = data.candidates?.[0]?.content?.parts?.[0]?.text
      if (!text) {
        console.warn('[Gemini] No text in response:', JSON.stringify(data).substring(0, 500))
      }
      // Strip any internal reasoning prefixes the LLM might add
      if (text) {
        text = text
          .replace(/^(Lumi|Response|Trigger|Note|Output|Message|Internal|Analysis)\s*[:：]\s*/i, '')
          .replace(/^\*\*.*?\*\*\s*/m, '')  // Strip bold headers
          .replace(/^#+\s+.*\n/m, '')        // Strip markdown headers
          .trim()
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

  // === ATTACHMENT PROCESSING ===
  ipcMain.handle('process-attachments', async (_event, attachments: AttachmentPayload[]) => {
    try {
      if (!Array.isArray(attachments) || attachments.length === 0) {
        return { success: true, attachments: [] }
      }

      const processed = await Promise.all(attachments.map((attachment) => processAttachment(attachment)))
      return { success: true, attachments: processed }
    } catch (err: any) {
      console.error('[IPC] process-attachments failed:', err?.message || err)
      return { success: false, attachments: [], error: 'Attachment processing failed' }
    }
  })

  // === WINDOW CONTROLS ===
  ipcMain.handle('set-click-through', (_event, enable: boolean) => {
    if (enable) {
      win.setIgnoreMouseEvents(true, { forward: true })
    } else {
      win.setIgnoreMouseEvents(false)
    }
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
  syllabusContext?: string,
  driverState?: {
    tired?: boolean
    asleep?: boolean
    looking_away?: boolean
    distracted?: boolean
    ear?: number
    perclos?: number
    gaze?: number
    roll?: number
    pitch?: number
    yaw?: number
  } | null
): string {
  const base = `You are Lumi, an AI study companion that lives on a student's desktop as a small animated character. You were built to help neurodivergent students (ADHD, Autism, Dyslexia) stay focused while studying.

HOW YOU WORK:
- You monitor the student's screen in real-time: what app/window they have open, what's on screen (via OCR), and their eye gaze patterns.
- Based on this data, you detect specific situations (called "triggers") and respond accordingly.
- You speak through small chat bubbles overlaid on their screen. You are NOT a full chatbot — you are a gentle, ambient companion.

THE CURRENT TRIGGER TYPE IS: "${triggerType}"
This is the MOST IMPORTANT piece of context. Your entire response must be shaped by this trigger type. Follow the trigger-specific instructions below EXACTLY.

OUTPUT FORMAT:
- Your response is displayed DIRECTLY to the student in a chat bubble. Output ONLY the message the student will see.
- Do NOT include any internal reasoning, thoughts, analysis, labels, or metadata.
- Do NOT prefix your response with things like "Trigger:", "Response:", "Lumi:", "Note:", etc.
- Do NOT narrate what you're doing (e.g. "I'll now encourage the student..."). Just speak TO the student.
- No markdown, no bullet points, no headers. Just plain conversational text.

RESPONSE RULES:
- 1-3 sentences MAXIMUM. You speak in chat bubbles — brevity is essential.
- Warm, casual, friendly tone. You're a supportive friend, not a teacher or authority figure.
- Never condescending, never scolding, never guilt-tripping.
- 1 emoji max per message.
- NEVER make up information. Only reference material if provided below.
- NEVER ignore the trigger type. If the trigger says "distraction", your response MUST be about redirecting the student back to studying.

LATEST DRIVER-STATE SNAPSHOT:
${driverState ? JSON.stringify(driverState) : 'No driver-state metrics available'}${syllabusContext ? `\n\nRELEVANT COURSE MATERIAL:\n${syllabusContext}` : ''}`

  const triggerContexts: Record<string, string> = {
    distraction: `TRIGGER: DISTRACTION DETECTED
============================
The student has LEFT their study material and opened a distracting app/website.
Detected window: ${ocrText}

THIS IS NOT STUDY CONTENT. The student is procrastinating.

ESCALATION: The context above includes which nudge number this is. Vary your tone accordingly:
- Nudge #1: Light and playful. "Ooh, I see Instagram! But your notes miss you — let's go back?"
- Nudge #2: A bit more direct but still friendly. "Hey, still on Instagram? You were on a roll earlier — let's not lose that momentum!"
- Nudge #3+: More urgent, appeal to their goals. "Okay real talk — you've been here a while now. Your future self will thank you for closing this. Let's crush that next section!"
IMPORTANT: Each nudge MUST feel different from the last. Never repeat the same message. Be creative.

YOUR RESPONSE MUST:
1. Acknowledge what they opened
2. Nudge them to close it and go back to studying
3. Match the escalation level above

YOUR RESPONSE MUST NOT:
- Discuss, analyze, or engage with the content of the distracting app
- Treat the distracting app as study material
- Talk about any other topic
- Ignore the distraction
- Repeat a previous nudge message`,

    stuck: `TRIGGER: STUDENT APPEARS STUCK
The student has been staring at the same content for 40+ seconds without progress. They may be confused or overwhelmed.

Content on their screen:
${ocrText.substring(0, 500)}

YOUR RESPONSE MUST:
1. Acknowledge they might be stuck (without being patronizing)
2. Offer to help break down the concept in simpler terms
3. Reference the specific content they're looking at if possible`,

      asleep: `TRIGGER: STUDENT FELL ASLEEP
The student has physically closed their eyes or fallen asleep during study.

YOUR RESPONSE MUST:
1. Be very high energy and loud! Tell them to wake up!
2. Suggest taking a real break or getting a coffee, instead of sleeping at the desk.
3. Keep it brief and impactful.
DO NOT talk about the course material right now.`,

      tired: `TRIGGER: DEEP FATIGUE
The driver-state model has detected high PERCLOS (eye closure duration) meaning the student is deeply fatigued.

YOUR RESPONSE MUST:
1. Express concern for their physical tiredness gently.
2. Tell them they've been doing great, but looking at a screen this tired is counterproductive.
3. Suggest a 5-minute break to close their eyes and stretch.`,

      fatigue: `TRIGGER: FATIGUE DETECTED
The student is showing signs of moderate tiredness (high blink rate or long study session without breaks).

Study context: ${ocrText.substring(0, 200)}
YOUR RESPONSE MUST:
1. Suggest taking a short break
2. Celebrate how long they've been studying
3. Be encouraging about their progress`,

    wandering: `TRIGGER: ATTENTION WANDERING
The student's gaze has been off-screen for a sustained period. They may be daydreaming or distracted by something in their environment.

Last content on screen: ${ocrText.substring(0, 200)}

YOUR RESPONSE MUST:
1. Gently bring their attention back to the screen
2. Be light and playful, not demanding`,

    question: `TRIGGER: STUDENT QUESTION
The student is asking you a direct question. Answer helpfully using ONLY the provided course context. If the context doesn't contain the answer, say so honestly.

Screen content: ${ocrText}`,

    session_start: `TRIGGER: SESSION START
The student just started a new study session. Welcome them warmly in 1-2 sentences.

What they opened: ${ocrText.substring(0, 100)}`,

    session_end: `TRIGGER: SESSION END
The study session is ending. Briefly summarize their effort, praise them, and suggest when to review next. 2-3 sentences max.

Session info: ${ocrText.substring(0, 300)}`,

    proactive_bridge: `TRIGGER: PREREQUISITE KNOWLEDGE GAP
The current material may require background knowledge the student might not have. Proactively offer a quick refresher.

Current topic: ${ocrText.substring(0, 300)}`,
  }

  const ctx = triggerContexts[triggerType] || triggerContexts.question
  return `${base}\n\n${ctx}`
}
