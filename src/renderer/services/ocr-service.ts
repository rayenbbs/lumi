import Tesseract from 'tesseract.js'

export class OCRService {
  private worker: Tesseract.Worker | null = null
  private isReady = false
  private lastResult = ''
  private lastCaptureTime = 0

  async initialize(): Promise<void> {
    try {
      this.worker = await Tesseract.createWorker('eng', 1, {
        logger: () => {},
      })

      // Optimize for screen text: single block of text, no dictionary correction
      await this.worker.setParameters({
        tessedit_pageseg_mode: Tesseract.PSM.AUTO,
      })

      this.isReady = true
      console.log('[OCR] Tesseract worker ready')
    } catch (err) {
      console.error('[OCR] Failed to initialize:', err)
    }
  }

  async extractText(imageDataUrl: string): Promise<string> {
    if (!this.worker || !this.isReady) {
      return this.lastResult
    }

    try {
      // Preprocess: convert to high-contrast grayscale for better OCR accuracy
      const processed = await this.preprocessImage(imageDataUrl)

      const { data } = await this.worker.recognize(processed)
      const cleaned = this.cleanOCRText(data.text)

      // Only update if we got meaningful text (avoid replacing good result with noise)
      if (cleaned.length > 20) {
        this.lastResult = cleaned
        this.lastCaptureTime = Date.now()
      }

      return this.lastResult
    } catch (err) {
      console.warn('[OCR] Recognition failed:', err)
      return this.lastResult
    }
  }

  private preprocessImage(dataUrl: string): Promise<string> {
    return new Promise((resolve) => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = img.width
        canvas.height = img.height
        const ctx = canvas.getContext('2d')!

        // Draw original
        ctx.drawImage(img, 0, 0)

        // Convert to grayscale + increase contrast
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
        const d = imageData.data
        for (let i = 0; i < d.length; i += 4) {
          // Luminance grayscale
          const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
          // Contrast stretch: push darks darker, lights lighter
          const contrast = gray < 128
            ? Math.max(0, gray * 0.7)
            : Math.min(255, gray * 1.2 + 30)
          d[i] = d[i + 1] = d[i + 2] = contrast
        }
        ctx.putImageData(imageData, 0, 0)

        resolve(canvas.toDataURL('image/png'))
      }
      img.onerror = () => resolve(dataUrl) // Fallback to original
      img.src = dataUrl
    })
  }

  private cleanOCRText(text: string): string {
    return text
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[^\S\n]+/g, ' ')
      .replace(/[^\x20-\x7E\n]/g, '')
      .trim()
      .substring(0, 4000)  // More context for the LLM
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
