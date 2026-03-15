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
    sendToQwen: (payload: {
      triggerType: string
      ocrText: string
      userQuestion?: string
      driverState?: {
        tired: boolean
        asleep: boolean
        looking_away: boolean
        distracted: boolean
        ear: number
        perclos: number
        gaze: number
        roll: number
        pitch: number
        yaw: number
      } | null
      conversationHistory: Array<{ role: string; content: string }>
      syllabusContext?: string
    }) => Promise<{ success: boolean; message: string }>
    processAttachments: (attachments: Array<{ id: string; name: string; size: number; type: string; dataUrl: string }>) => Promise<{
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
    }>
    searchSyllabus: (query: string) => Promise<any[]>
    setClickThrough: (enable: boolean) => Promise<void>
    resizeWindow: (w: number, h: number) => Promise<void>
    saveSession: (data: any) => Promise<boolean>
    loadSession: () => Promise<any>
  }
}
