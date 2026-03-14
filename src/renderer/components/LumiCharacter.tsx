import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { LumiState } from '../engine/trigger-engine'

// Try to import Lottie animations — fall back gracefully if files missing
let Lottie: any = null
let sleepingAnim: any = null
let wavingAnim: any = null
let talkingAnim: any = null
let alertAnim: any = null
let thinkingAnim: any = null

try {
  Lottie = require('lottie-react').default
  sleepingAnim = require('../../assets/lottie/lumi-sleeping.json')
  wavingAnim = require('../../assets/lottie/lumi-waving.json')
  talkingAnim = require('../../assets/lottie/lumi-talking.json')
  alertAnim = require('../../assets/lottie/lumi-alert.json')
  thinkingAnim = require('../../assets/lottie/lumi-thinking.json')
} catch {
  // Lottie assets not available — use CSS fallback
}

interface Props {
  state: LumiState
  isThinking: boolean
  onClick: () => void
}

// === CSS FALLBACK CHARACTER ===
function LumiEmoji({ state, isThinking }: { state: LumiState; isThinking: boolean }) {
  const config = useMemo(() => {
    if (isThinking) return { emoji: '🤔', animation: 'animate-pulse-soft', color: 'from-violet-500 to-purple-600' }
    switch (state) {
      case 'sleeping': return { emoji: '😴', animation: 'animate-float', color: 'from-indigo-600 to-purple-700' }
      case 'watching': return { emoji: '✨', animation: 'animate-bounce-soft', color: 'from-purple-500 to-violet-600' }
      case 'intervening': return { emoji: '💡', animation: 'animate-wiggle', color: 'from-amber-500 to-orange-500' }
      case 'chatting': return { emoji: '💬', animation: 'animate-bounce-soft', color: 'from-pink-500 to-rose-500' }
      case 'break': return { emoji: '☕', animation: 'animate-float', color: 'from-amber-400 to-yellow-500' }
      default: return { emoji: '🌟', animation: 'animate-float', color: 'from-purple-500 to-indigo-600' }
    }
  }, [state, isThinking])

  return (
    <div
      className={`
        w-24 h-24 rounded-full
        bg-gradient-to-br ${config.color}
        flex items-center justify-center
        text-4xl ${config.animation}
        shadow-lg shadow-purple-900/50
        lumi-glow
      `}
    >
      {config.emoji}
    </div>
  )
}

// === LOTTIE CHARACTER ===
function LumiLottie({ state, isThinking }: { state: LumiState; isThinking: boolean }) {
  const animData = useMemo(() => {
    if (isThinking) return thinkingAnim
    switch (state) {
      case 'sleeping': return sleepingAnim
      case 'watching': return wavingAnim
      case 'intervening': return alertAnim
      case 'chatting': return talkingAnim
      case 'break': return sleepingAnim
      default: return sleepingAnim
    }
  }, [state, isThinking])

  if (!Lottie || !animData) return null

  return (
    <div className="w-28 h-28 lumi-glow">
      <Lottie animationData={animData} loop={true} style={{ width: '100%', height: '100%' }} />
    </div>
  )
}

export default function LumiCharacter({ state, isThinking, onClick }: Props) {
  const hasLottie = Lottie && sleepingAnim

  return (
    <motion.div
      className="cursor-pointer no-drag"
      onClick={onClick}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      transition={{ type: 'spring', damping: 20, stiffness: 400 }}
    >
      {hasLottie ? (
        <LumiLottie state={state} isThinking={isThinking} />
      ) : (
        <LumiEmoji state={state} isThinking={isThinking} />
      )}
    </motion.div>
  )
}
