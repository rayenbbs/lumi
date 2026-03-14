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
    messages, addMessage, clearMessages,
    lastOCRText, setLastOCRText,
    setSessionStartTime,
  } = useLumiStore()

  const [sessionStats, setSessionStats] = useState<any>(null)
  const [focusScore, setFocusScore] = useState(0)
  const [inputText, setInputText] = useState('')
  const [showInput, setShowInput] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Service refs (stable across renders)
  const engineRef = useRef(new TriggerEngine())
  const eyeTrackerRef = useRef<EyeTrackerService | null>(null)
  const ocrServiceRef = useRef<OCRService | null>(null)
  const speechServiceRef = useRef<SpeechService | null>(null)
  const sessionTrackerRef = useRef(new SessionTracker())
  const conversationHistoryRef = useRef<Array<{ role: string; content: string }>>([])

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

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Check Ollama health
  useEffect(() => {
    const checkOllama = async () => {
      try {
        const res = await fetch('http://localhost:11434/api/tags')
        setOllamaStatus(res.ok ? 'online' : 'offline')
      } catch {
        setOllamaStatus('offline')
      }
    }
    checkOllama()
    const interval = setInterval(checkOllama, 30_000)
    return () => clearInterval(interval)
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
    sessionTrackerRef.current.start()
    setSessionStartTime(Date.now())

    // Start eye tracking (optional)
    if (eyeTrackerRef.current) {
      setEyeStatus('calibrating')
      setShowCalibration(true)
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

    // Start engine session AFTER calibration skip/complete
  }, [clearMessages, setEyeStatus, setMicStatus, setSessionStartTime, setLastOCRText, setShowCalibration])

  const onCalibrationDone = useCallback(() => {
    setShowCalibration(false)
    setEyeStatus('active')
    setLumiState('watching')
    engineRef.current.startSession()
    setIsExpanded(false)
  }, [setShowCalibration, setEyeStatus, setLumiState, setIsExpanded])

  const onCalibrationSkip = useCallback(async () => {
    setShowCalibration(false)
    // Try to init eye tracking without calibration
    if (eyeTrackerRef.current) {
      const ok = await eyeTrackerRef.current.initialize()
      setEyeStatus(ok ? 'active' : 'off')
    } else {
      setEyeStatus('off')
    }
    setLumiState('watching')
    engineRef.current.startSession()
  }, [setShowCalibration, setEyeStatus, setLumiState])

  // ─── STOP SESSION ─────────────────────────────────────────────────────────
  const stopSession = useCallback(() => {
    stopAllLoops()
    speechServiceRef.current?.stopListening()
    setMicStatus('off')
    sessionTrackerRef.current.end()
    engineRef.current.endSession(sessionTrackerRef.current.buildSummaryContext())
    setSessionStats(sessionTrackerRef.current.getStats())
    setFocusScore(sessionTrackerRef.current.getFocusScore())
    setShowSessionSummary(true)
    setSessionStartTime(null)
  }, [setMicStatus, setShowSessionSummary, setSessionStartTime])

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
    setIsExpanded(true)
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

      const response = await window.electronAPI?.sendToOllama({
        triggerType: event.type,
        ocrText: event.context,
        conversationHistory: conversationHistoryRef.current.slice(-CONFIG.CONVERSATION_CONTEXT_MESSAGES),
        syllabusContext,
      })

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

      // Speak
      await speechServiceRef.current?.speak(msg)

      // Play sound for distraction
      if (event.type === 'distraction') {
        playSound('nudge')
      } else if (event.type === 'session_start') {
        playSound('celebrate')
      } else if (event.type === 'fatigue') {
        playSound('break-time')
      }
    } catch (err) {
      console.error('[Trigger] Failed:', err)
      setIsThinking(false)
    }

    // Return to watching after message
    setTimeout(() => {
      if (engineRef.current.getState() === 'intervening') {
        engineRef.current.setState('watching')
        setLumiState('watching')
      }
    }, 4000)
  }, [addMessage, setIsExpanded, setIsThinking, setLumiState])

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
    engineRef.current.setState('chatting')
    setLumiState('chatting')

    try {
      // Search syllabus for context
      let syllabusContext = ''
      const results = await window.electronAPI?.searchSyllabus(text) ?? []
      if (results.length > 0) {
        syllabusContext = results.slice(0, 3).map((r: any) => r.text || r).join('\n\n')
      }

      const response = await window.electronAPI?.sendToOllama({
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

      // Extract topic for session tracking
      const topic = text.split(' ').slice(0, 4).join(' ')
      sessionTrackerRef.current.recordTopic(topic)
    } catch (err) {
      console.error('[UserMsg] Failed:', err)
    }

    setIsThinking(false)

    setTimeout(() => {
      if (engineRef.current.getState() === 'chatting') {
        engineRef.current.setState('watching')
        setLumiState('watching')
      }
    }, 6000)
  }, [addMessage, setIsExpanded, setIsThinking, setLumiState])

  // ─── TEXT INPUT SUBMIT ────────────────────────────────────────────────────
  const handleInputSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault()
    const text = inputText.trim()
    if (!text) return
    setInputText('')
    setShowInput(false)
    if (lumiState === 'sleeping') {
      startSession()
    }
    sendUserMessage(text)
  }, [inputText, lumiState, startSession, sendUserMessage])

  // ─── CHARACTER CLICK ──────────────────────────────────────────────────────
  const handleCharacterClick = useCallback(() => {
    if (lumiState === 'sleeping') {
      startSession()
    } else {
      setIsExpanded(!isExpanded)
    }
  }, [lumiState, isExpanded, startSession, setIsExpanded])

  function playSound(name: string) {
    try {
      const audio = new Audio(`/sounds/${name}.mp3`)
      audio.volume = 0.5
      audio.play().catch(() => {})
    } catch {
      // Sound file not available — silent fail
    }
  }

  // ─── RENDER ───────────────────────────────────────────────────────────────
  return (
    <div className="w-full h-full relative select-none overflow-hidden">

      {/* Calibration overlay */}
      <AnimatePresence>
        {showCalibration && (
          <CalibrationOverlay
            onComplete={onCalibrationDone}
            onSkip={onCalibrationSkip}
          />
        )}
      </AnimatePresence>

      {/* Bionic reader overlay */}
      <AnimatePresence>
        {showBionicReader && (
          <BionicReader
            text={lastOCRText}
            onClose={() => setShowBionicReader(false)}
          />
        )}
      </AnimatePresence>

      {/* Session summary overlay */}
      <AnimatePresence>
        {showSessionSummary && sessionStats && (
          <SessionSummary
            stats={sessionStats}
            focusScore={focusScore}
            onClose={() => {
              setShowSessionSummary(false)
              setLumiState('sleeping')
              clearMessages()
            }}
          />
        )}
      </AnimatePresence>

      {/* ── TOP BAR: status indicators + controls ── */}
      <div className="absolute top-2 left-3 right-3 flex items-center justify-between z-10">
        {/* Drag handle */}
        <div className="drag-region flex-1 h-6 cursor-move" />

        {/* Right: status + controls */}
        <div className="flex items-center gap-3 no-drag">
          <OllamaIndicator status={ollamaStatus} />
          <EyeIndicator status={eyeStatus} />
          <MicIndicator status={micStatus} />

          {lumiState !== 'sleeping' && (
            <>
              {/* Bionic reader toggle */}
              <button
                onClick={() => setShowBionicReader(!showBionicReader)}
                className="text-[10px] text-white/40 hover:text-white/70 transition-colors px-1.5 py-0.5 rounded bg-white/5 hover:bg-white/10"
                title="Bionic Reading Mode"
              >
                Aa
              </button>

              {/* Keyboard input toggle */}
              <button
                onClick={() => setShowInput(!showInput)}
                className="text-[10px] text-white/40 hover:text-white/70 transition-colors px-1.5 py-0.5 rounded bg-white/5 hover:bg-white/10"
                title="Type a question"
              >
                ⌨️
              </button>

              {/* End session */}
              <button
                onClick={stopSession}
                className="text-[10px] text-white/40 hover:text-red-400 transition-colors px-1.5 py-0.5 rounded bg-white/5 hover:bg-white/10"
                title="End session"
              >
                ⏹
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── CHAT MESSAGES ── */}
      <AnimatePresence>
        {isExpanded && messages.length > 0 && (
          <motion.div
            key="chat-panel"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 15 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="absolute bottom-[160px] left-3 right-3 max-h-[280px] overflow-y-auto flex flex-col gap-2 no-drag"
          >
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
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── TEXT INPUT ── */}
      <AnimatePresence>
        {showInput && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="absolute bottom-[155px] left-3 right-3 no-drag"
          >
            <form onSubmit={handleInputSubmit} className="flex gap-2">
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Ask Lumi anything..."
                autoFocus
                className="flex-1 glass rounded-xl px-3 py-2 text-sm text-white placeholder-white/30 outline-none focus:border-purple-400/50 bg-transparent"
              />
              <button
                type="submit"
                className="glass rounded-xl px-3 py-2 text-purple-400 hover:text-purple-300 transition-colors text-sm"
              >
                ↑
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── LUMI CHARACTER + LABEL ── */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2">
        <LumiCharacter
          state={lumiState}
          isThinking={isThinking}
          onClick={handleCharacterClick}
        />

        <motion.div
          initial={false}
          animate={{ opacity: lumiState === 'sleeping' ? 1 : 0.7 }}
          className="text-center"
        >
          {lumiState === 'sleeping' ? (
            <p className="text-white/60 text-xs">Click Lumi to start studying</p>
          ) : (
            <p className="text-white/40 text-[10px]">
              {lumiState === 'watching' && 'Watching over you...'}
              {lumiState === 'intervening' && 'Lumi has a message'}
              {lumiState === 'chatting' && 'Chatting with you'}
              {lumiState === 'break' && 'Enjoy your break!'}
            </p>
          )}
        </motion.div>
      </div>
    </div>
  )
}
