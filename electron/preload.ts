import { contextBridge, ipcRenderer, webUtils } from 'electron'

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

  // Speech-to-text (Deepgram)
  transcribeAudio: async (blob: Blob) => {
    const arrayBuffer = await blob.arrayBuffer()
    return ipcRenderer.invoke('transcribe-audio', new Uint8Array(arrayBuffer)) as Promise<{ transcript: string }>
  },

  // MCP syllabus search
  searchSyllabus: (query: string) => ipcRenderer.invoke('search-syllabus', query),

  // Knowledge base management
  listKnowledgeFiles: () => ipcRenderer.invoke('list-knowledge-files') as Promise<{ sources: Array<{ name: string; chunks: number }> }>,
  addKnowledgeFile: () => ipcRenderer.invoke('add-knowledge-file') as Promise<{ added: string[]; error?: string }>,
  addKnowledgeFilesByPath: (filePaths: string[]) => ipcRenderer.invoke('add-knowledge-files-by-path', filePaths) as Promise<{ added: string[]; error?: string }>,
  removeKnowledgeFile: (fileName: string) => ipcRenderer.invoke('remove-knowledge-file', fileName) as Promise<{ removed: boolean; error?: string }>,

  // Attachment processing (main process parsing)
  processAttachments: (attachments: Array<{ id: string; name: string; size: number; type: string; dataUrl: string }>) =>
    ipcRenderer.invoke('process-attachments', attachments) as Promise<{
      success: boolean
      attachments: Array<{
        id: string
        name: string
        size: number
        type: string
        previewText?: string
        extractedText?: string
        unsupported?: boolean
      }>
      error?: string
    }>,

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

  // Utilities
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
})
