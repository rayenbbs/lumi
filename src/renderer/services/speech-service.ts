export class SpeechService {
  private recognition: any = null
  private synthesis = window.speechSynthesis
  private isListening = false
  private onTranscript: ((text: string) => void) | null = null
  private restartTimer: ReturnType<typeof setTimeout> | null = null

  initialize(): boolean {
    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition

    if (!SpeechRecognition) {
      console.warn('[Speech] SpeechRecognition not supported in this browser/environment')
      return false
    }

    this.recognition = new SpeechRecognition()
    this.recognition.continuous = true
    this.recognition.interimResults = false
    this.recognition.lang = 'en-US'
    this.recognition.maxAlternatives = 1

    this.recognition.onresult = (event: any) => {
      const last = event.results.length - 1
      const transcript = event.results[last][0].transcript.trim()
      if (transcript.length >= 3) {
        this.onTranscript?.(transcript)
      }
    }

    this.recognition.onerror = (event: any) => {
      if (event.error === 'no-speech') return // Expected — just no one talking
      if (event.error === 'aborted') return
      console.warn('[Speech] Recognition error:', event.error)
    }

    this.recognition.onend = () => {
      if (this.isListening) {
        // Auto-restart
        this.restartTimer = setTimeout(() => {
          try {
            this.recognition?.start()
          } catch {
            // Already started
          }
        }, 200)
      }
    }

    return true
  }

  setTranscriptCallback(callback: (text: string) => void) {
    this.onTranscript = callback
  }

  startListening() {
    if (!this.recognition || this.isListening) return
    this.isListening = true
    try {
      this.recognition.start()
    } catch {
      // Already started
    }
  }

  stopListening() {
    this.isListening = false
    if (this.restartTimer) {
      clearTimeout(this.restartTimer)
      this.restartTimer = null
    }
    try {
      this.recognition?.stop()
    } catch {
      // Already stopped
    }
  }

  speak(text: string): Promise<void> {
    return new Promise((resolve) => {
      this.synthesis.cancel()

      // Strip emoji for cleaner TTS
      const cleanText = text.replace(
        /[\u{1F600}-\u{1F6FF}]|[\u{2600}-\u{26FF}]/gu,
        ''
      ).trim()

      const utterance = new SpeechSynthesisUtterance(cleanText)
      utterance.rate = 0.95
      utterance.pitch = 1.1
      utterance.volume = 0.85

      // Pick a natural English voice
      const voices = this.synthesis.getVoices()
      const preferred =
        voices.find((v) => v.name.includes('Google') && v.lang.startsWith('en')) ||
        voices.find((v) => v.lang.startsWith('en-US')) ||
        voices.find((v) => v.lang.startsWith('en'))

      if (preferred) utterance.voice = preferred

      utterance.onend = () => resolve()
      utterance.onerror = () => resolve()

      this.synthesis.speak(utterance)
    })
  }

  isSpeaking(): boolean {
    return this.synthesis.speaking
  }

  cancelSpeech() {
    this.synthesis.cancel()
  }

  destroy() {
    this.stopListening()
    this.synthesis.cancel()
  }
}
