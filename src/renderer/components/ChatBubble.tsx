import { motion } from 'framer-motion'
import { ChatMessage } from '../store/lumi-store'
import { TRIGGER_ICONS, TRIGGER_COLORS } from '../config/prompts'

export default function ChatBubble({ message }: { message: ChatMessage }) {
  const isLumi = message.role === 'lumi'
  const triggerType = message.triggerType

  const colorClass =
    isLumi && triggerType
      ? `bg-gradient-to-br ${TRIGGER_COLORS[triggerType]}`
      : isLumi
      ? 'bg-gradient-to-br from-purple-500/20 to-indigo-500/20 border border-purple-400/20'
      : 'bg-white/10 border border-white/15'

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.85, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.85, y: 8 }}
      transition={{ type: 'spring', damping: 22, stiffness: 350 }}
      className={`max-w-[92%] ${isLumi ? 'self-start' : 'self-end'}`}
    >
      <div
        className={`
          rounded-2xl px-4 py-2.5 text-sm leading-relaxed backdrop-blur-md
          text-white ${colorClass}
          ${isLumi ? 'rounded-tl-sm' : 'rounded-tr-sm'}
        `}
      >
        {isLumi && triggerType && (
          <span className="mr-1.5 text-base">
            {TRIGGER_ICONS[triggerType] ?? '💬'}
          </span>
        )}
        {message.text}
      </div>
      <div
        className={`text-xs text-white/30 mt-1 px-1 ${isLumi ? 'text-left' : 'text-right'}`}
      >
        {isLumi ? 'Lumi' : 'You'} ·{' '}
        {new Date(message.timestamp).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        })}
      </div>
    </motion.div>
  )
}
