'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { EyeTrackerService, EyeMetrics } from './services/eye-tracker'
import { OCRService } from './services/ocr-service'
import { SpeechService } from './services/speech-service'
import { SessionTracker } from './services/session-tracker'
import { TriggerEngine, TriggerEvent } from './engine/trigger-engine'
import { useLumiStore, ChatMessage } from './store/lumi-store'
import LumiCharacter from './components/LumiCharacter'
import ChatBubble from './components/ChatBubble'
import { EyeIndicator, MicIndicator, OllamaIndicator } from './components/StatusIndicator'
import BionicReader from './components/BionicReader'
import SessionSummary from './components/SessionSummary'
import CalibrationOverlay from './components/CalibrationOverlay'
import { CONFIG } from './config/constants'

declare global {
  interface Window {
    electronAPI: {
      getActiveWindow: () => Promise<{ title: string; owner: string; url: string | null } | null>
      captureScreen: () => Promise<string | null>
      sendToGemini: (payload: {
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
}

export default function App() {
  const {
    lumiState, setLumiState,
    isExpanded, setIsExpanded,
    isThinking, setIsThinking,
    showBionicReader, setShowBionicReader,
    showSessionSummary, setShowSessionSummary,
    showCalibration, setShowCalibration,
    eyeStatus, setEyeStatus,
    micStatus, setMicStatus,
    ollamaStatus, setOllamaStatus,
    messages, addMessage, setMessages, clearMessages,
    lastOCRText, setLastOCRText,
    setSessionStartTime,
  } = useLumiStore()

  const [sessionStats, setSessionStats] = useState<any>(null)
  const [focusScore, setFocusScore] = useState(0)
  const [inputText, setInputText] = useState('')
  const [gazePosition, setGazePosition] = useState<{ x: number; y: number } | null>(null)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Service refs (stable across renders)
  const engineRef = useRef(new TriggerEngine())
  const eyeTrackerRef = useRef<EyeTrackerService | null>(null)
  const ocrServiceRef = useRef<OCRService | null>(null)
  const speechServiceRef = useRef<SpeechService | null>(null)
  const sessionTrackerRef = useRef(new SessionTracker())
  const conversationHistoryRef = useRef<Array<{ role: string; content: string }>>([])

  // Guard against double-starting the engine session (e.g. calibration done + fallback)
  const engineSessionStartedRef = useRef(false)
  const eyeTrackerInitializedRef = useRef(false)

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
  const latestMetricsRef = useRef<EyeMetrics | null>(null)
  const latestWindowRef = useRef<any>(null)
  const lastOCRRef = useRef('')

  // Keep ref in sync with state
  useEffect(() => {
    lastOCRRef.current = lastOCRText
  }, [lastOCRText])

  // Sync gaze position from eye tracker ref into React state (RAF loop)
  useEffect(() => {
    if (eyeStatus !== 'active') {
      setGazePosition(null)
      return
    }
    let animId: number
    const loop = () => {
      const pos = latestMetricsRef.current?.gazePosition ?? null
      setGazePosition(pos)
      animId = requestAnimationFrame(loop)
    }
    animId = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(animId)
  }, [eyeStatus])

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
          savedAt: Date.now(),
        })
        .catch(() => {})
    }, 600)

    return () => clearTimeout(t)
  }, [messages, lastOCRText, sessionStats, focusScore])

  // Mark AI as online (Gemini — no local server needed)
  useEffect(() => {
    setOllamaStatus('online')
  }, [setOllamaStatus])

  // Initialize services on mount
  useEffect(() => {
    const init = async () => {
      // OCR
      const ocr = new OCRService()
      await ocr.initialize()
      ocrServiceRef.current = ocr

      // Speech
      const speech = new SpeechService()
      const speechOk = speech.initialize()
      if (speechOk) {
        speech.setTranscriptCallback(handleUserSpeech)
      }
      speechServiceRef.current = speech

      // Eye tracker instance (not started yet — wait for session)
      eyeTrackerRef.current = new EyeTrackerService()
      eyeTrackerRef.current.setMetricsCallback((metrics) => {
        latestMetricsRef.current = metrics
      })

      // Trigger engine callback
      engineRef.current.setTriggerCallback(handleTrigger)
    }

    init()

    return () => {
      stopAllLoops()
      eyeTrackerRef.current?.destroy()
      ocrServiceRef.current?.destroy()
      speechServiceRef.current?.destroy()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ─── START SESSION ───────────────────────────────────────────────────────────
  const startSession = useCallback(async () => {
    clearMessages()
    conversationHistoryRef.current = []
    engineSessionStartedRef.current = false
    eyeTrackerInitializedRef.current = false
    sessionTrackerRef.current.start()
    setSessionStartTime(Date.now())

    // Start eye tracking (optional; do not block session if missing)
    const hasWebgazer = typeof (window as any).webgazer !== 'undefined'
    if (hasWebgazer && eyeTrackerRef.current) {
      setEyeStatus('calibrating')
      const ok = await eyeTrackerRef.current.initialize()
      eyeTrackerInitializedRef.current = ok
      if (ok) {
        setShowCalibration(true)
      } else {
        setEyeStatus('off')
        setShowCalibration(false)
        setLumiState('watching')
        startEngineSessionOnce()
      }
    } else {
      setEyeStatus('off')
      setShowCalibration(false)
      setLumiState('watching')
      startEngineSessionOnce()
    }

    // Start mic
    if (speechServiceRef.current) {
      speechServiceRef.current.startListening()
      setMicStatus('listening')
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
        latestMetricsRef.current,
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

    // If calibration is shown, engine session starts on skip/complete
  }, [clearMessages, setEyeStatus, setMicStatus, setSessionStartTime, setLastOCRText, setShowCalibration, setLumiState, startEngineSessionOnce])

  const onCalibrationDone = useCallback(() => {
    setShowCalibration(false)
    setEyeStatus(eyeTrackerInitializedRef.current ? 'active' : 'off')
    setLumiState('watching')
    startEngineSessionOnce()
    setIsExpanded(false)
  }, [setShowCalibration, setEyeStatus, setLumiState, setIsExpanded, startEngineSessionOnce])

  const onCalibrationSkip = useCallback(async () => {
    setShowCalibration(false)
    // If initialization already happened in startSession, just reflect it.
    // Otherwise, try initializing now (still optional).
    if (!eyeTrackerInitializedRef.current && typeof (window as any).webgazer !== 'undefined' && eyeTrackerRef.current) {
      const ok = await eyeTrackerRef.current.initialize()
      eyeTrackerInitializedRef.current = ok
    }

    setEyeStatus(eyeTrackerInitializedRef.current ? 'active' : 'off')
    setLumiState('watching')
    startEngineSessionOnce()
  }, [setShowCalibration, setEyeStatus, setLumiState, startEngineSessionOnce])

  // ─── STOP SESSION ─────────────────────────────────────────────────────────
  const stopSession = useCallback(() => {
    stopAllLoops()
    speechServiceRef.current?.stopListening()
    setMicStatus('off')
    sessionTrackerRef.current.end()
    engineRef.current.endSession(sessionTrackerRef.current.buildSummaryContext())
    const stats = sessionTrackerRef.current.getStats()
    const score = sessionTrackerRef.current.getFocusScore()
    setSessionStats(stats)
    setFocusScore(score)
    window.electronAPI?.saveSession({
      messages: messages.slice(-50),
      lastOCRText,
      sessionStats: stats,
      focusScore: score,
      endedAt: Date.now(),
    }).catch(() => {})
    setShowSessionSummary(true)
    setSessionStartTime(null)
  }, [setMicStatus, setShowSessionSummary, setSessionStartTime, messages, lastOCRText])

  function stopAllLoops() {
    if (updateLoopRef.current) { clearInterval(updateLoopRef.current); updateLoopRef.current = null }
    if (ocrLoopRef.current) { clearInterval(ocrLoopRef.current); ocrLoopRef.current = null }
    if (windowLoopRef.current) { clearInterval(windowLoopRef.current); windowLoopRef.current = null }
  }

  // ─── HANDLE TRIGGER ───────────────────────────────────────────────────────
  const handleTrigger = useCallback(async (event: TriggerEvent) => {
    if (!event.type) return

    sessionTrackerRef.current.recordTrigger(event.type)
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
        conversationHistory: history,
        syllabusContext,
      }
      console.log('[LLM] Sending to LLM:', JSON.stringify(payload, null, 2))

      const response = await window.electronAPI?.sendToGemini(payload)
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
      setLumiState('chatting')
      setIsSpeaking(true)
      await speechServiceRef.current?.speak(msg)
      setIsSpeaking(false)
    } catch (err) {
      console.error('[Trigger] Failed:', err)
      setIsThinking(false)
      setIsSpeaking(false)
    } finally {
      // Always return to watching — even if LLM or TTS errored
      engineRef.current.setState('watching')
      setLumiState('watching')
    }
  }, [addMessage, setIsThinking, setLumiState])

  // ─── HANDLE USER SPEECH / TEXT INPUT ─────────────────────────────────────
  const handleUserSpeech = useCallback(async (transcript: string) => {
    if (transcript.length < 3) return
    await sendUserMessage(transcript)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const sendUserMessage = useCallback(async (text: string) => {
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      text,
      timestamp: Date.now(),
    }

    addMessage(userMsg)
    conversationHistoryRef.current.push({ role: 'user', content: text })

    setIsExpanded(true)
    setIsThinking(true)

    try {
      // Search syllabus for context
      let syllabusContext = ''
      const results = await window.electronAPI?.searchSyllabus(text) ?? []
      if (results.length > 0) {
        syllabusContext = results.slice(0, 3).map((r: any) => r.text || r).join('\n\n')
      }

      const response = await window.electronAPI?.sendToGemini({
        triggerType: 'question',
        ocrText: lastOCRRef.current,
        userQuestion: text,
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
      setLumiState('chatting')
      setIsSpeaking(true)
      await speechServiceRef.current?.speak(msg)
      setIsSpeaking(false)
      setLumiState('watching')
      engineRef.current.setState('watching')

      // Extract topic for session tracking
      const topic = text.split(' ').slice(0, 4).join(' ')
      sessionTrackerRef.current.recordTopic(topic)
    } catch (err) {
      console.error('[UserMsg] Failed:', err)
      setIsThinking(false)
      setIsSpeaking(false)
    }
  }, [addMessage, setIsExpanded, setIsThinking, setLumiState])

  // ─── TEXT INPUT SUBMIT ────────────────────────────────────────────────────
  const handleInputSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault()
    const text = inputText.trim()
    if (!text) return
    setInputText('')
    if (lumiState === 'sleeping') {
      startSession()
    }
    sendUserMessage(text)
  }, [inputText, lumiState, startSession, sendUserMessage])

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

      {/* ── FULLSCREEN OVERLAYS (calibration, bionic reader, session summary) ── */}
      <AnimatePresence>
        {showCalibration && (
          <div className="pointer-events-auto" onMouseEnter={handleMouseEnterUI} onMouseLeave={handleMouseLeaveUI}>
            <CalibrationOverlay onComplete={onCalibrationDone} onSkip={onCalibrationSkip} />
          </div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {showBionicReader && (
          <div className="pointer-events-auto" onMouseEnter={handleMouseEnterUI} onMouseLeave={handleMouseLeaveUI}>
            <BionicReader text={lastOCRText} gazePosition={gazePosition} onClose={() => setShowBionicReader(false)} />
          </div>
        )}
      </AnimatePresence>
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
          >
            {/* Panel background */}
            <div className="absolute inset-0 lumi-bg-panel rounded-l-2xl" style={{ pointerEvents: 'none' }} />

            {/* Top bar: status + actions */}
            <div className="relative z-10 px-4 pt-4 pb-2 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <OllamaIndicator status={ollamaStatus} />
                <EyeIndicator status={eyeStatus} />
                <MicIndicator status={micStatus} />
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setShowBionicReader(!showBionicReader)}
                  className={`cursor-pointer text-xs px-2.5 py-1 rounded-md transition-all ${
                    showBionicReader
                      ? 'bg-purple-500/25 text-purple-300 border border-purple-400/30'
                      : 'lumi-btn'
                  }`}
                >
                  Read
                </button>
                <button
                  onClick={stopSession}
                  className="cursor-pointer text-xs px-2.5 py-1 rounded-md lumi-btn hover:!text-red-400 hover:!border-red-400/30"
                >
                  End
                </button>
                <button
                  onClick={() => setIsExpanded(false)}
                  className="cursor-pointer text-xs px-2 py-1 rounded-md lumi-btn"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Chat messages */}
            <div className="relative z-10 flex-1 min-h-0 overflow-y-auto px-4 flex flex-col gap-2">
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
                  <div className="flex gap-1 items-center">
                    {[0, 1, 2].map((i) => (
                      <motion.div
                        key={i}
                        className="w-1.5 h-1.5 bg-purple-400 rounded-full"
                        animate={{ scale: [1, 1.5, 1], opacity: [0.5, 1, 0.5] }}
                        transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}
                      />
                    ))}
                    <span className="text-white/50 text-xs ml-1">Lumi is thinking...</span>
                  </div>
                </motion.div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Chat input — always visible */}
            <div className="relative z-10 px-4 py-3 shrink-0">
              <form onSubmit={handleInputSubmit} className="flex gap-2">
                <input
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder="Ask Lumi anything..."
                  autoFocus
                  className="flex-1 select-text glass rounded-xl px-3 py-2 text-sm text-white placeholder-white/30 outline-none focus:border-purple-400/40 bg-transparent"
                />
                <button
                  type="submit"
                  className="cursor-pointer glass rounded-xl px-4 py-2 text-purple-400 hover:text-purple-300 hover:bg-purple-500/15 transition-all text-sm font-medium"
                >
                  Send
                </button>
              </form>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── GAZE DOT ── */}
      {eyeStatus === 'active' && gazePosition && (
        <div className="gaze-cursor" style={{ left: gazePosition.x, top: gazePosition.y }} />
      )}

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
        <p className={`text-center text-[11px] ${isActive ? 'text-white/40' : 'text-white/60'}`}>
          {lumiState === 'sleeping' && 'Click to start'}
          {lumiState === 'watching' && 'Watching...'}
          {lumiState === 'intervening' && 'Lumi has a message'}
          {lumiState === 'chatting' && 'Chatting'}
          {lumiState === 'break' && 'Break time!'}
        </p>
      </div>
    </div>
  )
}
