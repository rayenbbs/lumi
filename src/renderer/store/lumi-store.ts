import { create } from 'zustand'
import { LumiState, TriggerType } from '../engine/trigger-engine'

export interface ChatAttachment {
  id: string
  name: string
  size: number
  type: string
  previewText?: string
}

export interface ChatMessage {
  id: string
  role: 'lumi' | 'user'
  text: string
  timestamp: number
  triggerType?: TriggerType
  attachments?: ChatAttachment[]
}

interface LumiStore {
  // App state
  lumiState: LumiState
  setLumiState: (state: LumiState) => void

  // UI state
  isExpanded: boolean
  setIsExpanded: (v: boolean) => void

  isThinking: boolean
  setIsThinking: (v: boolean) => void

  showBionicReader: boolean
  setShowBionicReader: (v: boolean) => void

  showSessionSummary: boolean
  setShowSessionSummary: (v: boolean) => void

  // Status
  micStatus: 'off' | 'listening'
  setMicStatus: (s: 'off' | 'listening') => void

  ollamaStatus: 'unknown' | 'online' | 'offline'
  setOllamaStatus: (s: 'unknown' | 'online' | 'offline') => void

  // Chat
  messages: ChatMessage[]
  addMessage: (msg: ChatMessage) => void
  setMessages: (msgs: ChatMessage[]) => void
  clearMessages: () => void

  // OCR
  lastOCRText: string
  setLastOCRText: (t: string) => void

  // Session
  sessionStartTime: number | null
  setSessionStartTime: (t: number | null) => void
}

export const useLumiStore = create<LumiStore>((set) => ({
  lumiState: 'sleeping',
  setLumiState: (lumiState) => set({ lumiState }),

  isExpanded: false,
  setIsExpanded: (isExpanded) => set({ isExpanded }),

  isThinking: false,
  setIsThinking: (isThinking) => set({ isThinking }),

  showBionicReader: false,
  setShowBionicReader: (showBionicReader) => set({ showBionicReader }),

  showSessionSummary: false,
  setShowSessionSummary: (showSessionSummary) => set({ showSessionSummary }),

  micStatus: 'off',
  setMicStatus: (micStatus) => set({ micStatus }),

  ollamaStatus: 'unknown',
  setOllamaStatus: (ollamaStatus) => set({ ollamaStatus }),

  messages: [],
  addMessage: (msg) =>
    set((state) => ({
      messages: [...state.messages.slice(-49), msg], // Keep last 50 messages
    })),
  setMessages: (messages) => set({ messages: messages.slice(-50) }),
  clearMessages: () => set({ messages: [] }),

  lastOCRText: '',
  setLastOCRText: (lastOCRText) => set({ lastOCRText }),

  sessionStartTime: null,
  setSessionStartTime: (sessionStartTime) => set({ sessionStartTime }),
}))

