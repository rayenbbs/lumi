/// <reference types="vite/client" />

// WebGazer global type
interface Window {
  webgazer: {
    setGazeListener: (fn: (data: { x: number; y: number } | null, elapsedTime: number) => void) => any
    setRegression: (type: string) => any
    saveDataAcrossSessions: (save: boolean) => any
    begin: () => Promise<void>
    end: () => void
    showVideoPreview: (show: boolean) => any
    showPredictionPoints: (show: boolean) => any
    clearData: () => void
    isReady: () => boolean
    getCurrentPrediction: () => Promise<{ x: number; y: number } | null>
  }

  electronAPI: {
    getActiveWindow: () => Promise<{ title: string; owner: string; url: string | null } | null>
    captureScreen: () => Promise<string | null>
    sendToOllama: (payload: {
      triggerType: string
      ocrText: string
      userQuestion?: string
      conversationHistory: Array<{ role: string; content: string }>
      syllabusContext?: string
    }) => Promise<{ success: boolean; message: string }>
    searchSyllabus: (query: string) => Promise<any[]>
    setClickThrough: (enable: boolean) => Promise<void>
    resizeWindow: (w: number, h: number) => Promise<void>
    saveSession: (data: any) => Promise<boolean>
    loadSession: () => Promise<any>
  }
}
