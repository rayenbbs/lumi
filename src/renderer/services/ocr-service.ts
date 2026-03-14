import Tesseract from 'tesseract.js'

export class OCRService {
  private worker: Tesseract.Worker | null = null
  private isReady = false
  private lastResult = ''
  private lastCaptureTime = 0

  async initialize(): Promise<void> {
    try {
      this.worker = await Tesseract.createWorker('eng', 1, {
        logger: () => {}, // Suppress progress logs
      })
      this.isReady = true
      console.log('[OCR] Tesseract worker ready')
    } catch (err) {
      console.error('[OCR] Failed to initialize:', err)
    }
  }

  async extractText(imageDataUrl: string): Promise<string> {
    if (!this.worker || !this.isReady) {
      return this.lastResult // Return cached result
    }

    try {
      const { data } = await this.worker.recognize(imageDataUrl)
      const cleaned = this.cleanOCRText(data.text)
      this.lastResult = cleaned
      this.lastCaptureTime = Date.now()
      return cleaned
    } catch (err) {
      console.warn('[OCR] Recognition failed:', err)
      return this.lastResult
    }
  }

  private cleanOCRText(text: string): string {
    return text
      .replace(/\n{3,}/g, '\n\n')   // Collapse excessive newlines
      .replace(/[^\S\n]+/g, ' ')     // Collapse whitespace (preserve newlines)
      .replace(/[^\x20-\x7E\n]/g, '') // Remove non-printable chars
      .trim()
      .substring(0, 2000)             // Cap at 2000 chars for LLM context
  }

  getLastResult(): string {
    return this.lastResult
  }

  getLastCaptureTime(): number {
    return this.lastCaptureTime
  }

  async destroy(): Promise<void> {
    if (this.worker) {
      await this.worker.terminate()
      this.worker = null
      this.isReady = false
    }
  }
}
