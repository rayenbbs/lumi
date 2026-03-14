import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  // Window monitoring
  getActiveWindow: () => ipcRenderer.invoke('get-active-window'),

  // Screenshot capture
  captureScreen: () => ipcRenderer.invoke('capture-screen'),

  // Gemini communication
  sendToGemini: (payload: {
    triggerType: string
    ocrText: string
    userQuestion?: string
    conversationHistory: Array<{ role: string; content: string }>
    syllabusContext?: string
  }) => ipcRenderer.invoke('send-to-gemini', payload),

  // MCP syllabus search
  searchSyllabus: (query: string) => ipcRenderer.invoke('search-syllabus', query),

  // Window controls
  setClickThrough: (enable: boolean) =>
    ipcRenderer.invoke('set-click-through', enable),

  resizeWindow: (width: number, height: number) =>
    ipcRenderer.invoke('resize-window', width, height),

  // Session persistence
  saveSession: (data: any) => ipcRenderer.invoke('save-session', data),
  loadSession: () => ipcRenderer.invoke('load-session'),

  // ElevenLabs TTS
  textToSpeech: (text: string) => ipcRenderer.invoke('text-to-speech', text) as Promise<{ success: boolean; audio: string | null }>,

  // Drag & drop zone
  startDrag: (mouseX: number, mouseY: number) => ipcRenderer.invoke('start-drag', mouseX, mouseY),
  stopDrag: () => ipcRenderer.invoke('stop-drag') as Promise<{ closed: boolean }>,
})
