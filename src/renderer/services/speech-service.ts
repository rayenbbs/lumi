export class SpeechService {
  private synthesis = window.speechSynthesis
  private isListening = false
  private onTranscript: ((text: string) => void) | null = null
  private currentAudio: HTMLAudioElement | null = null

  // MediaRecorder-based STT via Deepgram
  private mediaStream: MediaStream | null = null
  private recorder: MediaRecorder | null = null
  private recordingLoop: ReturnType<typeof setInterval> | null = null

  initialize(): boolean {
    return true
  }

  setTranscriptCallback(callback: (text: string) => void) {
    this.onTranscript = callback
  }

  async startListening() {
    if (this.isListening) return
    this.isListening = true

    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true })
      this.startRecordingLoop()
    } catch (err) {
      console.error('[Speech] Failed to get mic:', err)
      this.isListening = false
    }
  }

  private startRecordingLoop() {
    const recordChunk = () => {
      if (!this.isListening || !this.mediaStream) return

      const chunks: Blob[] = []
      const mimeType = 'audio/webm;codecs=opus'
      this.recorder = new MediaRecorder(this.mediaStream, { mimeType })

      this.recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data)
      }

      this.recorder.onstop = async () => {
        if (chunks.length === 0) return
        const blob = new Blob(chunks, { type: mimeType })
        if (blob.size < 5000) return

        try {
          const wavBlob = await this.blobToWav(blob)
          const result = await (window as any).electronAPI.transcribeAudio(wavBlob)
          const transcript = result?.transcript?.trim()
          if (transcript && transcript.length >= 2) {
            this.onTranscript?.(transcript)
          }
        } catch (err) {
          console.warn('[Speech] Transcription failed:', err)
        }
      }

      this.recorder.start()
      setTimeout(() => {
        if (this.recorder?.state === 'recording') {
          this.recorder.stop()
        }
      }, 4000)
    }

    recordChunk()
    this.recordingLoop = setInterval(recordChunk, 4500)
  }

  stopListening() {
    this.isListening = false
    if (this.recordingLoop) {
      clearInterval(this.recordingLoop)
      this.recordingLoop = null
    }
    if (this.recorder?.state === 'recording') {
      this.recorder.stop()
    }
    this.recorder = null
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((t) => t.stop())
      this.mediaStream = null
    }
  }

  async speak(text: string): Promise<void> {
    if ((window as any).electronAPI?.textToSpeech) {
      try {
        const result = await (window as any).electronAPI.textToSpeech(text)
        if (result.success && result.audio) {
          return this.playAudioData(result.audio)
        }
      } catch {
        // Fall through to browser TTS
      }
    }
    return this.speakBrowser(text)
  }

  private playAudioData(dataUrl: string): Promise<void> {
    return new Promise((resolve) => {
      this.cancelSpeech()
      const audio = new Audio(dataUrl)
      this.currentAudio = audio
      audio.volume = 0.85
      audio.onended = () => { this.currentAudio = null; resolve() }
      audio.onerror = () => { this.currentAudio = null; resolve() }
      audio.play().catch(() => { this.currentAudio = null; resolve() })
    })
  }

  private speakBrowser(text: string): Promise<void> {
    return new Promise((resolve) => {
      this.synthesis.cancel()
      const cleanText = text.replace(/[\u{1F600}-\u{1F6FF}]|[\u{2600}-\u{26FF}]/gu, '').trim()
      const utterance = new SpeechSynthesisUtterance(cleanText)
      utterance.rate = 0.95
      utterance.pitch = 1.1
      utterance.volume = 0.85

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

  private async blobToWav(blob: Blob): Promise<Blob> {
    const arrayBuffer = await blob.arrayBuffer()
    const audioCtx = new AudioContext({ sampleRate: 16000 })
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer)
    const pcm = audioBuffer.getChannelData(0)

    const int16 = new Int16Array(pcm.length)
    for (let i = 0; i < pcm.length; i++) {
      const s = Math.max(-1, Math.min(1, pcm[i]))
      int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF
    }

    const wavBuffer = new ArrayBuffer(44 + int16.length * 2)
    const view = new DataView(wavBuffer)
    const writeStr = (offset: number, str: string) => {
      for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i))
    }
    writeStr(0, 'RIFF')
    view.setUint32(4, 36 + int16.length * 2, true)
    writeStr(8, 'WAVE')
    writeStr(12, 'fmt ')
    view.setUint32(16, 16, true)
    view.setUint16(20, 1, true)
    view.setUint16(22, 1, true)
    view.setUint32(24, 16000, true)
    view.setUint32(28, 32000, true)
    view.setUint16(32, 2, true)
    view.setUint16(34, 16, true)
    writeStr(36, 'data')
    view.setUint32(40, int16.length * 2, true)

    new Int16Array(wavBuffer, 44).set(int16)
    audioCtx.close()
    return new Blob([wavBuffer], { type: 'audio/wav' })
  }

  isSpeaking(): boolean {
    return this.synthesis.speaking || (this.currentAudio !== null && !this.currentAudio.paused)
  }

  cancelSpeech() {
    this.synthesis.cancel()
    if (this.currentAudio) {
      this.currentAudio.pause()
      this.currentAudio = null
    }
  }

  destroy() {
    this.stopListening()
    this.cancelSpeech()
  }
}
