'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { DriverStateService, DriverStateMetrics } from './services/driver-state'
import { OCRService } from './services/ocr-service'
import { SpeechService } from './services/speech-service'
import { SessionTracker } from './services/session-tracker'
import { TriggerEngine, TriggerEvent } from './engine/trigger-engine'
import { useLumiStore, ChatMessage, ChatAttachment } from './store/lumi-store'
import LumiCharacter from './components/LumiCharacter'
import ChatBubble from './components/ChatBubble'
import { MicIndicator, QwenIndicator } from './components/StatusIndicator'

import SessionSummary from './components/SessionSummary'
import CalibrationOverlay from './components/CalibrationOverlay'
import PlatformPanel from './components/PlatformPanel'
import MissionSprintBoard from './components/MissionSprintBoard'
import SessionTimelinePanel, { TimelineEvent } from './components/SessionTimelinePanel'
import SettingsPanel from './components/SettingsPanel'
import { CONFIG } from './config/constants'
import { SessionStats } from './services/session-tracker'
import { setCustomDistractionPatterns } from './config/distractions'

type SideTab = 'platform' | 'chat' | 'session'

interface PendingAttachment extends ChatAttachment {
  extractedText?: string
  unsupported?: boolean
}

interface BackendAttachmentResult {
  id: string
  name: string
  size: number
  type: string
  previewText?: string
  extractedText?: string
  unsupported?: boolean
}

const TAB_META: Record<SideTab, { label: string; icon: string }> = {
  platform: { label: 'Tools', icon: '⚡' },
  chat: { label: 'Chat', icon: '💬' },
  session: { label: 'Stats', icon: '📊' },
}

declare global {
  interface Window {
    electronAPI: {
      getActiveWindow: () => Promise<{ title: string; owner: string; url: string | null } | null>
      captureScreen: () => Promise<string | null>
      sendToQwen: (payload: {
        triggerType: string
        ocrText: string
        userQuestion?: string
        driverState?: DriverStateMetrics | null
        conversationHistory: Array<{ role: string; content: string }>
        syllabusContext?: string
      }) => Promise<{ success: boolean; message: string }>
      processAttachments: (attachments: Array<{ id: string; name: string; size: number; type: string; dataUrl: string }>) => Promise<{
        success: boolean
        attachments: BackendAttachmentResult[]
        error?: string
      }>
      searchSyllabus: (query: string) => Promise<any[]>
      listKnowledgeFiles: () => Promise<{ sources: Array<{ name: string; chunks: number }> }>
      addKnowledgeFile: () => Promise<{ added: string[]; error?: string }>
      addKnowledgeFilesByPath: (filePaths: string[]) => Promise<{ added: string[]; error?: string }>
      removeKnowledgeFile: (fileName: string) => Promise<{ removed: boolean; error?: string }>
      buildKnowledgeGraph: (source?: string) => Promise<{
        sources: Array<{ name: string; tree: any }>
      }>
      setClickThrough: (enable: boolean) => Promise<void>
      resizeWindow: (w: number, h: number) => Promise<void>
      saveSession: (data: any) => Promise<boolean>
      loadSession: () => Promise<any>
      getPathForFile: (file: File) => string
    }
  }
}

export default function App() {
  const {
    lumiState, setLumiState,
    isExpanded, setIsExpanded,
    isThinking, setIsThinking,
    showSessionSummary, setShowSessionSummary,
    ttsEnabled, setTtsEnabled,
    sttEnabled, setSttEnabled,
    micStatus, setMicStatus,
    qwenStatus, setQwenStatus,
    messages, addMessage, setMessages, clearMessages,
    lastOCRText, setLastOCRText,
    setSessionStartTime,
  } = useLumiStore()

  const [sessionStats, setSessionStats] = useState<SessionStats | null>(null)
  const [liveSessionStats, setLiveSessionStats] = useState<SessionStats | null>(null)
  const [focusScore, setFocusScore] = useState(0)
  const [inputText, setInputText] = useState('')
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [activeTab, setActiveTab] = useState<SideTab>('chat')
  const [showSettings, setShowSettings] = useState(false)
  const [timelineEvents, setTimelineEvents] = useState<TimelineEvent[]>([])
  const [mission, setMission] = useState('Finish one topic deeply, then self-test with a 3-question quiz')
  const [missionCompleted, setMissionCompleted] = useState(false)
  const [doneStreak, setDoneStreak] = useState(0)
  const [focusSessionsCount, setFocusSessionsCount] = useState(0)
  const [sprintCompletedCount, setSprintCompletedCount] = useState(0)
  const [customDistractingApps, setCustomDistractingApps] = useState<string[]>([])
  const [customDistractingUrls, setCustomDistractingUrls] = useState<string[]>([])
  const [sprintMinutes, setSprintMinutes] = useState(25)
  const [sprintSecondsLeft, setSprintSecondsLeft] = useState(25 * 60)
  const [isSprintRunning, setIsSprintRunning] = useState(false)
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([])
  const [knowledgeSources, setKnowledgeSources] = useState<Array<{ name: string; chunks: number }>>([])
  const [chatDragOver, setChatDragOver] = useState(false)
  const chatDragCounterRef = useRef(0)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Service refs (stable across renders)
  const engineRef = useRef(new TriggerEngine())
  const driverStateRef = useRef<DriverStateService | null>(null)
  const ocrServiceRef = useRef<OCRService | null>(null)
  const speechServiceRef = useRef<SpeechService | null>(null)
  const sessionTrackerRef = useRef(new SessionTracker())
  const conversationHistoryRef = useRef<Array<{ role: string; content: string }>>([])

  // Guard against double-starting the engine session
  const engineSessionStartedRef = useRef(false)

  const startEngineSessionOnce = useCallback(() => {
    if (engineSessionStartedRef.current) return
    engineSessionStartedRef.current = true
    engineRef.current.startSession()
  }, [])

  // Loop timers
  const updateLoopRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const ocrLoopRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const windowLoopRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Latest metrics (updated outside React cycle for perf)
  const latestDriverMetricsRef = useRef<DriverStateMetrics | null>(null)
  const latestWindowRef = useRef<any>(null)
  const lastOCRRef = useRef('')
  const handleUserSpeechRef = useRef<(transcript: string) => void>(() => {})

  const pushTimelineEvent = useCallback((type: TimelineEvent['type'], text: string) => {
    setTimelineEvents((prev) => [{ id: `evt-${Date.now()}-${Math.random()}`, type, text, timestamp: Date.now() }, ...prev].slice(0, 100))
  }, [])

  const fileToDataUrl = useCallback((file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        if (typeof reader.result === 'string') resolve(reader.result)
        else reject(new Error('Failed to read file'))
      }
      reader.onerror = () => reject(reader.error || new Error('Failed to read file'))
      reader.readAsDataURL(file)
    })
  }, [])

  const handleAddAttachments = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return

    const batch = await Promise.all(
      files.map(async (file) => ({
        id: `${file.name}-${file.size}-${Date.now()}-${Math.random()}`,
        name: file.name,
        size: file.size,
        type: file.type || 'application/octet-stream',
        dataUrl: await fileToDataUrl(file),
      }))
    )

    let nextAttachments: PendingAttachment[] = []

    try {
      const response = await window.electronAPI?.processAttachments(batch)
      if (response?.success && Array.isArray(response.attachments)) {
        nextAttachments = response.attachments.map((file) => ({
          id: file.id,
          name: file.name,
          size: file.size,
          type: file.type,
          previewText: file.previewText,
          extractedText: file.extractedText,
          unsupported: file.unsupported,
        }))
      }
    } catch {
      // no-op fallback below
    }

    if (nextAttachments.length === 0) {
      // Fallback metadata-only mode when backend processing is unavailable
      nextAttachments = batch.map((file) => ({
        id: file.id,
        name: file.name,
        size: file.size,
        type: file.type,
        unsupported: true,
        previewText: 'Attachment added (content extraction unavailable)',
      }))
    }

    setPendingAttachments((prev) => [...prev, ...nextAttachments])
    pushTimelineEvent('platform_action', `Attached ${nextAttachments.length} file(s)`)

    // Allow selecting the same file again later
    e.target.value = ''
  }, [fileToDataUrl, pushTimelineEvent])

  const removePendingAttachment = useCallback((id: string) => {
    setPendingAttachments((prev) => prev.filter((a) => a.id !== id))
  }, [])

  const handleChatDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    chatDragCounterRef.current++
    if (chatDragCounterRef.current === 1) {
      setChatDragOver(true)
    }
  }, [])

  const handleChatDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const handleChatDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    chatDragCounterRef.current--
    if (chatDragCounterRef.current === 0) {
      setChatDragOver(false)
    }
  }, [])

  const handleChatDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    chatDragCounterRef.current = 0
    setChatDragOver(false)

    const files = Array.from(e.dataTransfer.files)
    if (files.length === 0) return

    const batch = await Promise.all(
      files.map(async (file) => ({
        id: `${file.name}-${file.size}-${Date.now()}-${Math.random()}`,
        name: file.name,
        size: file.size,
        type: file.type || 'application/octet-stream',
        dataUrl: await fileToDataUrl(file),
      }))
    )

    let nextAttachments: PendingAttachment[] = []

    try {
      const response = await window.electronAPI?.processAttachments(batch)
      if (response?.success && Array.isArray(response.attachments)) {
        nextAttachments = response.attachments.map((file) => ({
          id: file.id,
          name: file.name,
          size: file.size,
          type: file.type,
          previewText: file.previewText,
          extractedText: file.extractedText,
          unsupported: file.unsupported,
        }))
      }
    } catch {
      // fallback below
    }

    if (nextAttachments.length === 0) {
      nextAttachments = batch.map((file) => ({
        id: file.id,
        name: file.name,
        size: file.size,
        type: file.type,
        unsupported: true,
        previewText: 'Attachment added (content extraction unavailable)',
      }))
    }

    setPendingAttachments((prev) => [...prev, ...nextAttachments])
    pushTimelineEvent('platform_action', `Attached ${nextAttachments.length} file(s) via drag & drop`)
  }, [fileToDataUrl, pushTimelineEvent])

  // Keep ref in sync with state
  useEffect(() => {
    lastOCRRef.current = lastOCRText
  }, [lastOCRText])

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Restore persisted session state (best-effort)
  useEffect(() => {
    const restore = async () => {
      if (!window.electronAPI) return
      try {
        const saved = await window.electronAPI.loadSession()
        if (!saved) return

        if (Array.isArray(saved.messages)) {
          setMessages(saved.messages)
          conversationHistoryRef.current = saved.messages
            .filter((m: any) => m && (m.role === 'user' || m.role === 'lumi') && typeof m.text === 'string')
            .slice(-CONFIG.CONVERSATION_CONTEXT_MESSAGES)
            .map((m: any) => ({
              role: m.role === 'lumi' ? 'assistant' : 'user',
              content: m.text,
            }))
        }

        if (typeof saved.lastOCRText === 'string') {
          setLastOCRText(saved.lastOCRText)
        }

        if (saved.sessionStats) {
          setSessionStats(saved.sessionStats)
        }
        if (typeof saved.focusScore === 'number') {
          setFocusScore(saved.focusScore)
        }
        if (saved.platformState) {
          if (typeof saved.platformState.mission === 'string') setMission(saved.platformState.mission)
          if (typeof saved.platformState.doneStreak === 'number') setDoneStreak(saved.platformState.doneStreak)
          if (typeof saved.platformState.focusSessionsCount === 'number') setFocusSessionsCount(saved.platformState.focusSessionsCount)
          if (typeof saved.platformState.sprintCompletedCount === 'number') setSprintCompletedCount(saved.platformState.sprintCompletedCount)
          if (Array.isArray(saved.platformState.customDistractingApps)) setCustomDistractingApps(saved.platformState.customDistractingApps)
          if (Array.isArray(saved.platformState.customDistractingUrls)) setCustomDistractingUrls(saved.platformState.customDistractingUrls)
        }
      } catch {
        // Ignore restore failures
      }
    }

    restore()
  }, [setMessages, setLastOCRText])

  // Persist minimal state for demo continuity (best-effort, debounced)
  useEffect(() => {
    if (!window.electronAPI) return
    const t = setTimeout(() => {
      window.electronAPI
        .saveSession({
          messages: messages.slice(-50),
          lastOCRText,
          sessionStats,
          focusScore,
          platformState: {
            mission,
            doneStreak,
            focusSessionsCount,
            sprintCompletedCount,
            customDistractingApps,
            customDistractingUrls,
          },
          savedAt: Date.now(),
        })
        .catch(() => {})
    }, 600)

    return () => clearTimeout(t)
  }, [messages, lastOCRText, sessionStats, focusScore, mission, doneStreak, focusSessionsCount, sprintCompletedCount, customDistractingApps, customDistractingUrls])

  useEffect(() => {
    setCustomDistractionPatterns({
      apps: customDistractingApps,
      urls: customDistractingUrls,
    })
  }, [customDistractingApps, customDistractingUrls])

  useEffect(() => {
    if (!isSprintRunning) return
    if (sprintSecondsLeft <= 0) {
      setIsSprintRunning(false)
      setSprintCompletedCount((prev) => prev + 1)
      pushTimelineEvent('platform_action', 'Sprint completed')
      return
    }
    const timer = setInterval(() => {
      setSprintSecondsLeft((prev) => Math.max(0, prev - 1))
    }, 1000)
    return () => clearInterval(timer)
  }, [isSprintRunning, sprintSecondsLeft, pushTimelineEvent])

  // Mark AI as online (Qwen local model is expected to run locally)
  useEffect(() => {
    setQwenStatus('online')
  }, [setQwenStatus])

  // Initialize services on mount
  useEffect(() => {
    const init = async () => {
      // OCR
      const ocr = new OCRService()
      await ocr.initialize()
      ocrServiceRef.current = ocr

      driverStateRef.current = new DriverStateService()
      await driverStateRef.current.initialize()

      // Speech
      const speech = new SpeechService()
      const speechOk = speech.initialize()
      if (speechOk) {
        speech.setTranscriptCallback((transcript: string) => {
          handleUserSpeechRef.current(transcript)
        })
      }
      speechServiceRef.current = speech

      driverStateRef.current.setMetricsCallback((metrics) => {
        latestDriverMetricsRef.current = metrics
      })
      
      // Trigger engine callback
      engineRef.current.setTriggerCallback(handleTrigger)
    }

    init()

    return () => {
      stopAllLoops()
      driverStateRef.current?.destroy()
      ocrServiceRef.current?.destroy()
      speechServiceRef.current?.destroy()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ─── START SESSION ───────────────────────────────────────────────────────────
  const startSession = useCallback(async () => {
    clearMessages()
    conversationHistoryRef.current = []
    engineSessionStartedRef.current = false
    sessionTrackerRef.current.start()
    setLiveSessionStats(sessionTrackerRef.current.getStats())
    setFocusSessionsCount((prev) => prev + 1)
    setTimelineEvents([])
    setActiveTab('platform')
    setIsSprintRunning(false)
    setSprintSecondsLeft(sprintMinutes * 60)
    setMissionCompleted(false)
    pushTimelineEvent('session_start', 'Session started')
    setSessionStartTime(Date.now())

    setLumiState('watching')
    startEngineSessionOnce()
    // Start mic only if STT is enabled
    if (sttEnabled && speechServiceRef.current) {
      speechServiceRef.current.startListening()
      setMicStatus('listening')
    }

    if (driverStateRef.current) {
      driverStateRef.current.startTracking()
    }

    // Start window polling
    windowLoopRef.current = setInterval(async () => {
      if (!window.electronAPI) return
      try {
        latestWindowRef.current = await window.electronAPI.getActiveWindow()
        console.log('[WINDOW]', JSON.stringify(latestWindowRef.current))
      } catch {
        latestWindowRef.current = null
      }
    }, CONFIG.WINDOW_CHECK_INTERVAL)

    // Start trigger engine update loop
    updateLoopRef.current = setInterval(() => {
      engineRef.current.update(
        latestDriverMetricsRef.current,
        latestWindowRef.current,
        lastOCRRef.current
      )
    }, CONFIG.TRIGGER_CHECK_INTERVAL)

    // Start OCR loop
    ocrLoopRef.current = setInterval(async () => {
      if (!window.electronAPI || !ocrServiceRef.current) return
      try {
        const screenshot = await window.electronAPI.captureScreen()
        if (screenshot) {
          const text = await ocrServiceRef.current.extractText(screenshot)
          if (text) {
            setLastOCRText(text)
          }
        }
      } catch (err) {
        console.warn('[OCR loop] Failed:', err)
      }
    }, CONFIG.OCR_INTERVAL)

  }, [clearMessages, setMicStatus, setSessionStartTime, setLastOCRText, setLumiState, startEngineSessionOnce])

  // ─── STOP SESSION ─────────────────────────────────────────────────────────
  const stopSession = useCallback(() => {
    stopAllLoops()
    speechServiceRef.current?.stopListening()
    setMicStatus('off')
    sessionTrackerRef.current.end()
    engineRef.current.endSession(sessionTrackerRef.current.buildSummaryContext())
    const stats = sessionTrackerRef.current.getStats()
    setLiveSessionStats(stats)
    const score = sessionTrackerRef.current.getFocusScore()
    setSessionStats(stats)
    setFocusScore(score)
    setIsSprintRunning(false)
    pushTimelineEvent('session_end', 'Session ended and summary generated')
    window.electronAPI?.saveSession({
      messages: messages.slice(-50),
      lastOCRText,
      sessionStats: stats,
      focusScore: score,
      endedAt: Date.now(),
    }).catch(() => {})
    setShowSessionSummary(true)
    setSessionStartTime(null)
  }, [lastOCRText, messages, pushTimelineEvent, setMicStatus, setSessionStartTime, setShowSessionSummary])

  function stopAllLoops() {
    if (updateLoopRef.current) { clearInterval(updateLoopRef.current); updateLoopRef.current = null }
    if (ocrLoopRef.current) { clearInterval(ocrLoopRef.current); ocrLoopRef.current = null }
    if (windowLoopRef.current) { clearInterval(windowLoopRef.current); windowLoopRef.current = null }
  }

  // ─── HANDLE TRIGGER ───────────────────────────────────────────────────────
  const handleTrigger = useCallback(async (event: TriggerEvent) => {
    if (!event.type) return

    sessionTrackerRef.current.recordTrigger(event.type)
    setLiveSessionStats(sessionTrackerRef.current.getStats())
    pushTimelineEvent(event.type as Exclude<TimelineEvent['type'], 'question' | 'platform_action'>, `Trigger detected: ${event.type}`)
    setIsThinking(true)
    setLumiState('intervening')

    try {
      // Optional: fetch syllabus context for study-related triggers
      let syllabusContext = ''
      if (event.type === 'stuck' || event.type === 'question') {
        const searchQuery = event.context.substring(0, 100)
        const results = await window.electronAPI?.searchSyllabus(searchQuery) ?? []
        if (results.length > 0) {
          syllabusContext = results.slice(0, 2).map((r: any) => r.text || r).join('\n\n')
        }
      }

      // For distractions, don't send old conversation history — it confuses the model
      const history = event.type === 'distraction'
        ? []
        : conversationHistoryRef.current.slice(-CONFIG.CONVERSATION_CONTEXT_MESSAGES)

      const payload = {
        triggerType: event.type,
        ocrText: event.context,
        driverState: latestDriverMetricsRef.current,
        conversationHistory: history,
        syllabusContext,
      }
      console.log('[LLM] Sending to LLM:', JSON.stringify(payload, null, 2))

      const response = await window.electronAPI?.sendToQwen(payload)
      console.log('[LLM] Response:', JSON.stringify(response))

      const msg = response?.message ?? "Hey! I'm here if you need me."

      const lumiMsg: ChatMessage = {
        id: `lumi-${Date.now()}`,
        role: 'lumi',
        text: msg,
        timestamp: Date.now(),
        triggerType: event.type,
      }

      addMessage(lumiMsg)
      conversationHistoryRef.current.push({ role: 'assistant', content: msg })

      setIsThinking(false)

      // Play sound for distraction
      if (event.type === 'distraction') {
        playSound('nudge')
      } else if (event.type === 'session_start') {
        playSound('celebrate')
      } else if (event.type === 'fatigue') {
        playSound('break-time')
      }

      // Speak — set chatting only during TTS
      if (ttsEnabled) {
        setLumiState('chatting')
        setIsSpeaking(true)
        await speechServiceRef.current?.speak(msg)
        setIsSpeaking(false)
      }
    } catch (err) {
      console.error('[Trigger] Failed:', err)
      setIsThinking(false)
      setIsSpeaking(false)
    } finally {
      // Always return to watching — even if LLM or TTS errored
      engineRef.current.setState('watching')
      setLumiState('watching')
    }
  }, [addMessage, pushTimelineEvent, setIsThinking, setLumiState])

  // ─── HANDLE USER SPEECH / TEXT INPUT ─────────────────────────────────────
    // (defined after sendUserMessage below, wired via ref)

  const handleUserSpeech = useCallback(async (transcript: string) => {
    if (transcript.length < 3) return
    await sendUserMessage(transcript)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const sendUserMessage = useCallback(async (text: string, attachments: PendingAttachment[] = []) => {
    const normalizedText = text.trim()
    const attachmentSummary = attachments.length > 0
      ? attachments.map((file) => file.name).join(', ')
      : ''

    const attachmentContextBlocks = attachments
      .filter((file) => !file.unsupported && file.extractedText)
      .map((file) => `File: ${file.name}\n${file.extractedText}`)

    const attachmentPreviewBlocks = attachments
      .filter((file) => !file.extractedText && file.previewText)
      .map((file) => `File: ${file.name}\nStatus: ${file.previewText}`)

    const attachmentContext = attachmentContextBlocks.length > 0 || attachmentPreviewBlocks.length > 0
      ? `\n\nAttached file context:\n${[...attachmentContextBlocks, ...attachmentPreviewBlocks].join('\n\n---\n\n')}`
      : attachments.length > 0
      ? `\n\nAttached files (metadata only): ${attachmentSummary}`
      : ''

    const finalQuestion = normalizedText || (attachments.length > 0 ? 'Please analyze the attached file(s).' : '')
    if (!finalQuestion) return

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      text: normalizedText || `Shared ${attachments.length} attachment(s).`,
      timestamp: Date.now(),
      attachments: attachments.map((file) => ({
        id: file.id,
        name: file.name,
        size: file.size,
        type: file.type,
        previewText: file.previewText,
      })),
    }

    addMessage(userMsg)
    pushTimelineEvent('question', `Question asked: ${finalQuestion.slice(0, 72)}${finalQuestion.length > 72 ? '...' : ''}`)
    conversationHistoryRef.current.push({ role: 'user', content: finalQuestion + attachmentContext })

    setIsExpanded(true)
    setIsThinking(true)

    try {
      // Search syllabus for context
      let syllabusContext = ''
      const results = await window.electronAPI?.searchSyllabus(finalQuestion) ?? []
      if (results.length > 0) {
        syllabusContext = results.slice(0, 3).map((r: any) => r.text || r).join('\n\n')
      }

      const response = await window.electronAPI?.sendToQwen({
        triggerType: 'question',
        ocrText: lastOCRRef.current,
        driverState: latestDriverMetricsRef.current,
        userQuestion: finalQuestion + attachmentContext,
        conversationHistory: conversationHistoryRef.current.slice(-CONFIG.CONVERSATION_CONTEXT_MESSAGES),
        syllabusContext,
      })

      const msg = response?.message ?? "I'm not sure about that one!"

      const lumiMsg: ChatMessage = {
        id: `lumi-${Date.now()}`,
        role: 'lumi',
        text: msg,
        timestamp: Date.now(),
        triggerType: 'question',
      }

      addMessage(lumiMsg)
      conversationHistoryRef.current.push({ role: 'assistant', content: msg })
      setIsThinking(false)

      // TTS — chatting state only while speaking
      if (ttsEnabled) {
        setLumiState('chatting')
        setIsSpeaking(true)
        await speechServiceRef.current?.speak(msg)
        setIsSpeaking(false)
      }
      setLumiState('watching')
      engineRef.current.setState('watching')

      // Extract topic for session tracking
      const topic = finalQuestion.split(' ').slice(0, 4).join(' ')
      sessionTrackerRef.current.recordTopic(topic)
      setLiveSessionStats(sessionTrackerRef.current.getStats())
    } catch (err) {
      console.error('[UserMsg] Failed:', err)
      setIsThinking(false)
      setIsSpeaking(false)
    }
  }, [addMessage, pushTimelineEvent, setIsExpanded, setIsThinking, setLumiState])

  // Keep speech ref in sync so the callback always calls the latest sendUserMessage
  useEffect(() => {
    handleUserSpeechRef.current = (transcript: string) => {
      if (transcript.length < 3) return

      // Filter out garbage/noise — only send if it has real words
      const wordCount = transcript.split(/\s+/).filter(w => w.length > 1).length
      if (wordCount < 1) {
        console.log('[SPEECH] Filtered out noise:', transcript)
        return
      }

      console.log('[SPEECH] Transcript received, sending to LLM:', transcript)
      sendUserMessage(transcript)
    }
  }, [sendUserMessage])

  // ─── TEXT INPUT SUBMIT ────────────────────────────────────────────────────
  const handleInputSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault()
    const text = inputText.trim()
    const attachments = pendingAttachments
    if (!text && attachments.length === 0) return
    setInputText('')
    setPendingAttachments([])
    if (lumiState === 'sleeping') {
      startSession()
    }
    sendUserMessage(text, attachments)
  }, [inputText, pendingAttachments, lumiState, startSession, sendUserMessage])

  const handlePlatformPrompt = useCallback((prompt: string) => {
    if (!prompt.trim()) return
    if (lumiState === 'sleeping') {
      startSession()
    }
    setActiveTab('chat')
    pushTimelineEvent('platform_action', `Platform action: ${prompt.slice(0, 60)}${prompt.length > 60 ? '...' : ''}`)
    sendUserMessage(prompt)
  }, [lumiState, pushTimelineEvent, startSession, sendUserMessage])

  const handleSprintMinutesChange = useCallback((minutes: number) => {
    setSprintMinutes(minutes)
    setSprintSecondsLeft(minutes * 60)
    setIsSprintRunning(false)
  }, [])

  const handleSprintStartPause = useCallback(() => {
    setIsSprintRunning((prev) => !prev)
  }, [])

  const handleSprintReset = useCallback(() => {
    setIsSprintRunning(false)
    setSprintSecondsLeft(sprintMinutes * 60)
    pushTimelineEvent('platform_action', 'Sprint reset')
  }, [pushTimelineEvent, sprintMinutes])

  const handleToggleMissionCompleted = useCallback(() => {
    setMissionCompleted((prev) => {
      const next = !prev
      if (next) {
        setDoneStreak((streak) => streak + 1)
        pushTimelineEvent('platform_action', 'Mission marked complete')
      }
      return next
    })
  }, [pushTimelineEvent])

  const addCustomDistractingApp = useCallback((value: string) => {
    setCustomDistractingApps((prev) => (prev.includes(value) ? prev : [...prev, value]))
    pushTimelineEvent('platform_action', `Added distracting app rule: ${value}`)
  }, [pushTimelineEvent])

  const removeCustomDistractingApp = useCallback((value: string) => {
    setCustomDistractingApps((prev) => prev.filter((item) => item !== value))
    pushTimelineEvent('platform_action', `Removed distracting app rule: ${value}`)
  }, [pushTimelineEvent])

  const addCustomDistractingUrl = useCallback((value: string) => {
    setCustomDistractingUrls((prev) => (prev.includes(value) ? prev : [...prev, value]))
    pushTimelineEvent('platform_action', `Added distracting site rule: ${value}`)
  }, [pushTimelineEvent])

  const removeCustomDistractingUrl = useCallback((value: string) => {
    setCustomDistractingUrls((prev) => prev.filter((item) => item !== value))
    pushTimelineEvent('platform_action', `Removed distracting site rule: ${value}`)
  }, [pushTimelineEvent])

  // ─── KNOWLEDGE BASE ──────────────────────────────────────────────────────
  const refreshKnowledgeSources = useCallback(async () => {
    try {
      const result = await window.electronAPI?.listKnowledgeFiles()
      setKnowledgeSources(result?.sources || [])
    } catch {
      setKnowledgeSources([])
    }
  }, [])

  const handleAddKnowledgeFile = useCallback(async () => {
    try {
      const result = await window.electronAPI?.addKnowledgeFile()
      if (result?.added?.length) {
        pushTimelineEvent('platform_action', `Added ${result.added.length} study material(s)`)
      }
      await refreshKnowledgeSources()
    } catch (err) {
      console.warn('[Knowledge] add failed:', err)
    }
  }, [pushTimelineEvent, refreshKnowledgeSources])

  const handleAddKnowledgeFilesByPath = useCallback(async (filePaths: string[]) => {
    try {
      const result = await window.electronAPI?.addKnowledgeFilesByPath(filePaths)
      if (result?.added?.length) {
        pushTimelineEvent('platform_action', `Added ${result.added.length} study material(s) via drag & drop`)
      }
      await refreshKnowledgeSources()
    } catch (err) {
      console.warn('[Knowledge] drop add failed:', err)
    }
  }, [pushTimelineEvent, refreshKnowledgeSources])

  const handleRemoveKnowledgeFile = useCallback(async (fileName: string) => {
    try {
      await window.electronAPI?.removeKnowledgeFile(fileName)
      pushTimelineEvent('platform_action', `Removed study material: ${fileName}`)
      await refreshKnowledgeSources()
    } catch (err) {
      console.warn('[Knowledge] remove failed:', err)
    }
  }, [pushTimelineEvent, refreshKnowledgeSources])

  // Load knowledge sources on mount
  useEffect(() => {
    refreshKnowledgeSources()
  }, [refreshKnowledgeSources])

  const outcomeSignals = [
    { label: 'Focus sessions', value: `${focusSessionsCount} today` },
    { label: 'Drifts recovered', value: `${liveSessionStats?.distractionCount ?? 0} redirects` },
    { label: 'Sprints done', value: `${sprintCompletedCount}` },
  ]

  // ─── MASCOT DRAG ────────────────────────────────────────────────────────
  const [mascotPos, setMascotPos] = useState<{ x: number; y: number } | null>(null)
  const didDragRef = useRef(false)

  const handleMascotMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return
    e.preventDefault()

    didDragRef.current = false
    const startX = e.clientX
    const startY = e.clientY
    const el = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const offsetX = e.clientX - el.left
    const offsetY = e.clientY - el.top

    const handleMouseMove = (ev: MouseEvent) => {
      const dx = Math.abs(ev.clientX - startX)
      const dy = Math.abs(ev.clientY - startY)
      if (dx > 4 || dy > 4) didDragRef.current = true
      if (didDragRef.current) {
        setMascotPos({ x: ev.clientX - offsetX, y: ev.clientY - offsetY })
      }
    }

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }, [])

  // ─── CHARACTER CLICK ──────────────────────────────────────────────────────
  const handleCharacterClick = useCallback(() => {
    if (didDragRef.current) return
    if (lumiState === 'sleeping') {
      startSession()
    } else {
      // Reset intervening state when user acknowledges by clicking
      if (lumiState === 'intervening') {
        setLumiState('watching')
        engineRef.current.setState('watching')
      }
      setIsExpanded(!isExpanded)
    }
  }, [lumiState, isExpanded, startSession, setIsExpanded, setLumiState])

  function playSound(name: string) {
    try {
      const audio = new Audio(`/sounds/${name}.mp3`)
      audio.volume = 0.5
      audio.play().catch(() => {})
    } catch {
      // Sound file not available — silent fail
    }
  }

  // ─── CLICK-THROUGH TOGGLE ────────────────────────────────────────────────
  // Global mousemove listener: check if cursor is over a UI element.
  // If yes → disable click-through so clicks register.
  // If no  → enable click-through so clicks pass to apps behind.
  const isClickThroughRef = useRef(true)

  const handleMouseEnterUI = useCallback(() => {
    if (window.electronAPI && isClickThroughRef.current) {
      isClickThroughRef.current = false
      window.electronAPI.setClickThrough(false)
    }
  }, [])

  const handleMouseLeaveUI = useCallback(() => {
    if (window.electronAPI && !isClickThroughRef.current) {
      isClickThroughRef.current = true
      window.electronAPI.setClickThrough(true)
    }
  }, [])
  useEffect(() => {
    if (!window.electronAPI) return

    const handleMouseMove = (e: MouseEvent) => {
      // elementFromPoint returns null on transparent areas (pointer-events: none)
      const el = document.elementFromPoint(e.clientX, e.clientY)
      const isOverUI = el !== null && el !== document.documentElement && el !== document.body

      if (isOverUI && isClickThroughRef.current) {
        isClickThroughRef.current = false
        window.electronAPI.setClickThrough(false)
      } else if (!isOverUI && !isClickThroughRef.current) {
        isClickThroughRef.current = true
        window.electronAPI.setClickThrough(true)
      }
    }

    document.addEventListener('mousemove', handleMouseMove)
    return () => document.removeEventListener('mousemove', handleMouseMove)
  }, [])

  // ─── RENDER ───────────────────────────────────────────────────────────────
  const isActive = lumiState !== 'sleeping'
  // Show the side panel when expanded OR when there's an overlay active
  const showSidePanel = isExpanded && isActive

  return (
    <div className="w-full h-full relative overflow-hidden pointer-events-none">

      {/* ── FULLSCREEN OVERLAYS ── */}
      <AnimatePresence>
        {showSessionSummary && sessionStats && (
          <div className="pointer-events-auto" onMouseEnter={handleMouseEnterUI} onMouseLeave={handleMouseLeaveUI}>
            <SessionSummary
              stats={sessionStats}
              focusScore={focusScore}
              onClose={() => { setShowSessionSummary(false); setLumiState('sleeping'); clearMessages() }}
            />
          </div>
        )}
      </AnimatePresence>

      {/* ── SIDE CHAT PANEL (slides from right) ── */}
      <AnimatePresence>
        {showSidePanel && (
          <motion.div
            key="side-panel"
            initial={{ x: '100%', opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: '100%', opacity: 0 }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            className="absolute right-0 top-0 bottom-0 w-[380px] z-30 flex flex-col pointer-events-auto"
            onMouseEnter={handleMouseEnterUI}
            onMouseLeave={handleMouseLeaveUI}
            onDragEnter={activeTab === 'chat' ? handleChatDragEnter : undefined}
            onDragOver={activeTab === 'chat' ? handleChatDragOver : undefined}
            onDragLeave={activeTab === 'chat' ? handleChatDragLeave : undefined}
            onDrop={activeTab === 'chat' ? handleChatDrop : undefined}
          >
            {/* Panel background */}
            <div className="absolute inset-0 bg-[rgba(12,8,24,0.88)] backdrop-blur-2xl rounded-l-2xl border-l border-white/[0.06]" style={{ pointerEvents: 'none' }} />

            {/* Drag & drop overlay for chat */}
            {chatDragOver && activeTab === 'chat' && (
              <div className="absolute inset-0 z-50 rounded-l-2xl bg-purple-500/15 border-2 border-dashed border-purple-400/50 flex items-center justify-center backdrop-blur-sm pointer-events-none">
                <div className="flex flex-col items-center gap-2">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
                    <path d="M12 3v12M12 3l-4 4M12 3l4 4" stroke="rgba(192,170,255,0.8)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" stroke="rgba(192,170,255,0.8)" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                  <span className="text-purple-200/90 text-[14px] font-medium">Drop files to attach</span>
                </div>
              </div>
            )}

            {/* Settings Panel Overlay */}
            <AnimatePresence>
              {showSettings && (
                <SettingsPanel
                  onClose={() => setShowSettings(false)}
                  customDistractingApps={customDistractingApps}
                  customDistractingUrls={customDistractingUrls}
                  onAddDistractingApp={addCustomDistractingApp}
                  onRemoveDistractingApp={removeCustomDistractingApp}
                  onAddDistractingUrl={addCustomDistractingUrl}
                  onRemoveDistractingUrl={removeCustomDistractingUrl}
                  sttEnabled={sttEnabled}
                  onToggleSTT={() => {
                    const next = !sttEnabled
                    setSttEnabled(next)
                    if (next && speechServiceRef.current && lumiState !== 'sleeping') {
                      speechServiceRef.current.startListening()
                      setMicStatus('listening')
                    } else if (!next && speechServiceRef.current) {
                      speechServiceRef.current.stopListening()
                      setMicStatus('off')
                    }
                  }}
                  sprintMinutes={sprintMinutes}
                  onSprintMinutesChange={handleSprintMinutesChange}
                  knowledgeSources={knowledgeSources}
                  onAddKnowledgeFile={handleAddKnowledgeFile}
                  onAddKnowledgeFilesByPath={handleAddKnowledgeFilesByPath}
                  onRemoveKnowledgeFile={handleRemoveKnowledgeFile}
                />
              )}
            </AnimatePresence>

            {/* Top bar: minimal */}
            <div className="relative z-10 px-5 pt-4 pb-2 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <QwenIndicator status={qwenStatus} />
                {sttEnabled && <MicIndicator status={micStatus} />}
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setShowSettings(!showSettings)}
                  className={`cursor-pointer w-8 h-8 rounded-lg flex items-center justify-center transition-all ${
                    showSettings
                      ? 'bg-purple-500/20 text-purple-300'
                      : 'text-white/40 hover:text-white/70 hover:bg-white/[0.06]'
                  }`}
                  title="Settings"
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M8 10a2 2 0 100-4 2 2 0 000 4z" stroke="currentColor" strokeWidth="1.3" />
                    <path d="M13.5 8a5.5 5.5 0 01-.4 2.1l1.2 1.2-1.4 1.4-1.2-1.2A5.5 5.5 0 018 13.5a5.5 5.5 0 01-2.1-.4l-1.2 1.2-1.4-1.4 1.2-1.2A5.5 5.5 0 012.5 8c0-.7.1-1.4.4-2.1L1.7 4.7l1.4-1.4 1.2 1.2A5.5 5.5 0 018 2.5c.7 0 1.4.1 2.1.4l1.2-1.2 1.4 1.4-1.2 1.2c.3.7.4 1.4.4 2.1z" stroke="currentColor" strokeWidth="1.2" />
                  </svg>
                </button>
                <button
                  onClick={stopSession}
                  className="cursor-pointer w-8 h-8 rounded-lg flex items-center justify-center text-white/40 hover:text-red-400 hover:bg-red-500/10 transition-all"
                  title="End session"
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <rect x="3" y="3" width="10" height="10" rx="2" stroke="currentColor" strokeWidth="1.5" />
                  </svg>
                </button>
                <button
                  onClick={() => setIsExpanded(false)}
                  className="cursor-pointer w-8 h-8 rounded-lg flex items-center justify-center text-white/40 hover:text-white/70 hover:bg-white/[0.06] transition-all"
                  title="Collapse"
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M12 4L4 12M4 4l8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Tab strip — clean */}
            <div className="relative z-10 px-5 pb-3 shrink-0">
              <div className="flex gap-1 rounded-xl bg-white/[0.03] p-1">
                {(['chat', 'platform', 'session'] as SideTab[]).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => { setActiveTab(tab); setShowSettings(false) }}
                    className={`cursor-pointer flex-1 text-[13px] py-2 rounded-lg transition-all ${
                      activeTab === tab
                        ? 'bg-purple-500/15 text-white/90 font-medium'
                        : 'text-white/40 hover:text-white/60 hover:bg-white/[0.04]'
                    }`}
                  >
                    {TAB_META[tab].label}
                  </button>
                ))}
              </div>
            </div>

            {/* Tab content */}
            <div className="relative z-10 flex-1 min-h-0 overflow-y-auto">
              <AnimatePresence mode="wait" initial={false}>
                {activeTab === 'platform' && (
                  <motion.div
                    key="tab-platform"
                    initial={{ opacity: 0, x: 18 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -18 }}
                    transition={{ duration: 0.2, ease: 'easeOut' }}
                  >
                    <PlatformPanel
                      onPrompt={handlePlatformPrompt}
                      outcomeSignals={outcomeSignals}
                      hasKnowledgeSources={knowledgeSources.length > 0}
                    />
                    <MissionSprintBoard
                      mission={mission}
                      onMissionChange={setMission}
                      missionCompleted={missionCompleted}
                      onToggleMissionCompleted={handleToggleMissionCompleted}
                      doneStreak={doneStreak}
                      sprintSecondsLeft={sprintSecondsLeft}
                      isRunning={isSprintRunning}
                      onStartPause={handleSprintStartPause}
                      onReset={handleSprintReset}
                    />
                  </motion.div>
                )}

                {activeTab === 'chat' && (
                  <motion.div
                    key="tab-chat"
                    initial={{ opacity: 0, x: 18 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -18 }}
                    transition={{ duration: 0.2, ease: 'easeOut' }}
                    className="px-5 flex flex-col gap-2.5 min-h-full"
                  >
                    <div className="flex-1" />
                    {messages.slice(-CONFIG.CHAT_HISTORY_VISIBLE).map((msg) => (
                      <ChatBubble key={msg.id} message={msg} />
                    ))}
                    {isThinking && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="self-start glass-light rounded-2xl rounded-tl-sm px-4 py-2.5"
                      >
                        <div className="flex gap-1.5 items-center">
                          {[0, 1, 2].map((i) => (
                            <motion.div
                              key={i}
                              className="w-1.5 h-1.5 bg-purple-400/80 rounded-full"
                              animate={{ scale: [1, 1.4, 1], opacity: [0.4, 1, 0.4] }}
                              transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
                            />
                          ))}
                          <span className="text-white/40 text-[13px] ml-1.5">Thinking...</span>
                        </div>
                      </motion.div>
                    )}
                    <div ref={messagesEndRef} />
                  </motion.div>
                )}

                {activeTab === 'session' && (
                  <motion.div
                    key="tab-session"
                    initial={{ opacity: 0, x: 18 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -18 }}
                    transition={{ duration: 0.2, ease: 'easeOut' }}
                  >
                    <SessionTimelinePanel
                      timelineEvents={timelineEvents}
                      liveStats={liveSessionStats}
                      focusScore={focusScore}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Chat input — only visible on chat tab */}
            {activeTab === 'chat' && <div className="relative z-10 px-5 py-3 shrink-0">
              {pendingAttachments.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {pendingAttachments.map((file) => (
                    <span key={file.id} className="inline-flex items-center gap-1.5 rounded-full bg-purple-500/10 border border-purple-400/15 px-3 py-1 text-[12px] text-purple-200">
                      📎 {file.name}
                      {file.unsupported && <span className="text-amber-200/80">(meta)</span>}
                      <button
                        type="button"
                        onClick={() => removePendingAttachment(file.id)}
                        className="text-purple-200/60 hover:text-white ml-0.5"
                        title="Remove attachment"
                      >
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                          <path d="M9 3L3 9M3 3l6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                        </svg>
                      </button>
                    </span>
                  ))}
                </div>
              )}

              <form onSubmit={handleInputSubmit} className="flex gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  onChange={handleAddAttachments}
                  className="hidden"
                />

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="cursor-pointer rounded-xl px-3 py-2.5 text-white/30 hover:text-white/60 hover:bg-white/[0.06] transition-all"
                  title="Attach files"
                >
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                    <path d="M15.5 8.5l-6.8 6.8a4 4 0 01-5.6-5.6l6.8-6.8a2.7 2.7 0 013.7 3.7l-6.8 6.8a1.3 1.3 0 01-1.9-1.9l6.3-6.3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                  </svg>
                </button>

                <input
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder="Ask Lumi anything..."
                  autoFocus
                  className="flex-1 select-text rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-2.5 text-[14px] text-white placeholder-white/25 outline-none focus:border-purple-400/30 transition-colors"
                />
                <button
                  type="submit"
                  className="cursor-pointer rounded-xl px-4 py-2.5 bg-purple-500/15 text-purple-300 hover:bg-purple-500/25 transition-all text-[14px] font-medium"
                >
                  Send
                </button>

                <button
                  type="button"
                  onClick={() => setTtsEnabled(!ttsEnabled)}
                  className={`cursor-pointer rounded-xl px-2.5 py-2.5 transition-all ${
                    ttsEnabled
                      ? 'text-purple-300 bg-purple-500/15 hover:bg-purple-500/25'
                      : 'text-white/25 hover:text-white/50 hover:bg-white/[0.06]'
                  }`}
                  title={ttsEnabled ? 'Read aloud is on' : 'Read aloud is off'}
                >
                  {ttsEnabled ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                      <path d="M11 5L6 9H2v6h4l5 4V5z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M15.54 8.46a5 5 0 010 7.07" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                      <path d="M19.07 4.93a10 10 0 010 14.14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                      <path d="M11 5L6 9H2v6h4l5 4V5z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      <line x1="23" y1="9" x2="17" y2="15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                      <line x1="17" y1="9" x2="23" y2="15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                  )}
                </button>
              </form>
            </div>}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── LUMI CHARACTER (draggable) ── */}
      <div
        className="group absolute z-40 flex flex-col items-center gap-1 pointer-events-auto cursor-grab active:cursor-grabbing"
        style={
          mascotPos
            ? { left: mascotPos.x, top: mascotPos.y }
            : { bottom: 16, right: 16 }
        }
        onMouseEnter={handleMouseEnterUI}
        onMouseLeave={handleMouseLeaveUI}
        onMouseDown={handleMascotMouseDown}
      >
        {/* Close button — appears on hover */}
        <button
          onClick={(e) => { e.stopPropagation(); window.electronAPI?.setClickThrough(false); window.close() }}
          className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-red-500/80 hover:bg-red-500 text-white text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-50 cursor-pointer"
        >
          ✕
        </button>
        <LumiCharacter
          state={lumiState}
          isThinking={isThinking}
          onClick={handleCharacterClick}
        />
        <p className={`text-center text-[12px] ${isActive ? 'text-white/30' : 'text-white/50'}`}>
          {lumiState === 'sleeping' && 'Click to start'}
          {lumiState === 'watching' && 'Studying...'}
          {lumiState === 'intervening' && 'Tap me!'}
          {lumiState === 'chatting' && 'Chatting'}
          {lumiState === 'break' && 'Break time!'}
        </p>
      </div>
    </div>
  )
}



