import { ipcMain, BrowserWindow, desktopCapturer, screen, dialog } from 'electron'
import { mainWindow } from './main'
import Store from 'electron-store'
import { getMcpClientSync } from './mcp-client'
import path from 'path'
import fs from 'fs'
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
      const display = screen.getPrimaryDisplay()
      const { width, height } = display.size
      const scaleFactor = display.scaleFactor || 1

      // Capture at native resolution for sharp text
      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: {
          width: Math.round(width * scaleFactor),
          height: Math.round(height * scaleFactor),
        },
      })
      if (sources.length === 0) return null

      // Crop out bottom taskbar (~48px) and right side where Lumi panel sits (~420px)
      const img = sources[0].thumbnail
      const cropW = Math.round(img.getSize().width * 0.7)  // Left 70% (exclude Lumi panel)
      const cropH = Math.round(img.getSize().height * 0.93) // Top 93% (exclude taskbar)
      const cropped = img.crop({ x: 0, y: 0, width: cropW, height: cropH })

      return cropped.toDataURL()
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

  // === CHAT (via MCP server) ===
  ipcMain.handle('send-to-gemini', async (_event, payload) => {
    try {
      const mcpClient = getMcpClientSync()
      if (!mcpClient) {
        return { success: false, message: 'MCP server is starting up. Try again in a moment.' }
      }
      return await mcpClient.chat(payload)
    } catch (error: any) {
      console.error('[IPC] send-to-gemini (MCP) failed:', error)
      return {
        success: false,
        message: "I'm having trouble thinking right now. Try again in a moment.",
      }
    }
  })

  // === SYLLABUS SEARCH (via MCP server) ===
  ipcMain.handle('search-syllabus', async (_event, query: string) => {
    try {
      const mcpClient = getMcpClientSync()
      if (!mcpClient) return []
      return await mcpClient.searchSyllabus(query)
    } catch {
      return []
    }
  })

  // === KNOWLEDGE BASE MANAGEMENT ===
  const knowledgeDir = path.join(__dirname, '../../mcp-server/data/courses')

  ipcMain.handle('list-knowledge-files', async () => {
    try {
      // Always read the actual directory so every PDF shows up
      const diskFiles = fs.existsSync(knowledgeDir)
        ? fs.readdirSync(knowledgeDir).filter(f => f.toLowerCase().endsWith('.pdf'))
        : []

      // Try to get chunk counts from MCP index
      let indexedMap = new Map<string, number>()
      const mcpClient = getMcpClientSync()
      if (mcpClient) {
        try {
          const result = await mcpClient.callTool('list_sources')
          if (result?.sources) {
            for (const s of result.sources) {
              indexedMap.set(s.name, s.chunks)
            }
          }
        } catch { /* use disk-only */ }
      }

      // Merge: every file on disk appears, with chunk count if indexed
      const sources = diskFiles.map(name => ({
        name,
        chunks: indexedMap.get(name) || 0,
      }))

      return { sources }
    } catch {
      return { sources: [] }
    }
  })

  ipcMain.handle('add-knowledge-file', async () => {
    try {
      const result = await dialog.showOpenDialog(win, {
        title: 'Add study material',
        filters: [{ name: 'PDF Documents', extensions: ['pdf'] }],
        properties: ['openFile', 'multiSelections'],
      })

      if (result.canceled || result.filePaths.length === 0) {
        return { added: [] }
      }

      if (!fs.existsSync(knowledgeDir)) {
        fs.mkdirSync(knowledgeDir, { recursive: true })
      }

      const added: string[] = []
      for (const filePath of result.filePaths) {
        const fileName = path.basename(filePath)
        const dest = path.join(knowledgeDir, fileName)
        fs.copyFileSync(filePath, dest)
        added.push(fileName)
        console.log('[Knowledge] Added:', fileName)
      }

      // Trigger MCP reindex
      const mcpClient = getMcpClientSync()
      if (mcpClient) {
        await mcpClient.reindex()
      }

      return { added }
    } catch (err: any) {
      console.error('[Knowledge] add failed:', err?.message || err)
      return { added: [], error: err?.message }
    }
  })

  ipcMain.handle('add-knowledge-files-by-path', async (_event, filePaths: string[]) => {
    try {
      const pdfPaths = filePaths.filter((f) => f.toLowerCase().endsWith('.pdf'))
      if (pdfPaths.length === 0) {
        return { added: [], error: 'No PDF files provided' }
      }

      if (!fs.existsSync(knowledgeDir)) {
        fs.mkdirSync(knowledgeDir, { recursive: true })
      }

      const added: string[] = []
      for (const filePath of pdfPaths) {
        const fileName = path.basename(filePath)
        const dest = path.join(knowledgeDir, fileName)
        fs.copyFileSync(filePath, dest)
        added.push(fileName)
        console.log('[Knowledge] Added via drop:', fileName)
      }

      const mcpClient = getMcpClientSync()
      if (mcpClient) {
        await mcpClient.reindex()
      }

      return { added }
    } catch (err: any) {
      console.error('[Knowledge] drop add failed:', err?.message || err)
      return { added: [], error: err?.message }
    }
  })

  ipcMain.handle('remove-knowledge-file', async (_event, fileName: string) => {
    try {
      const filePath = path.join(knowledgeDir, fileName)
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath)
        console.log('[Knowledge] Removed:', fileName)
      }

      // Trigger MCP reindex
      const mcpClient = getMcpClientSync()
      if (mcpClient) {
        await mcpClient.reindex()
      }

      return { removed: true }
    } catch (err: any) {
      console.error('[Knowledge] remove failed:', err?.message || err)
      return { removed: false, error: err?.message }
    }
  })

  // === KNOWLEDGE GRAPH ===
  ipcMain.handle('build-knowledge-graph', async (_event, source?: string) => {
    try {
      const mcpClient = getMcpClientSync()
      if (!mcpClient) return { nodes: [], edges: [], sources: [] }
      return await mcpClient.callTool('build_knowledge_graph', source ? { source } : {})
    } catch (err: any) {
      console.error('[Knowledge Graph] build failed:', err?.message || err)
      return { nodes: [], edges: [], sources: [] }
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
