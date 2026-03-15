import { motion } from 'framer-motion'
import { ChatMessage } from '../store/lumi-store'
import { TRIGGER_ICONS, TRIGGER_COLORS } from '../config/prompts'

export default function ChatBubble({ message }: { message: ChatMessage }) {
  const isLumi = message.role === 'lumi'
  const triggerType = message.triggerType
  const attachments = message.attachments || []

  const colorClass =
    isLumi && triggerType
      ? `bg-gradient-to-br ${TRIGGER_COLORS[triggerType]}`
      : isLumi
      ? 'bg-gradient-to-br from-purple-500/15 to-indigo-500/15 border border-purple-400/15'
      : 'bg-white/[0.06] border border-white/[0.08]'

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.92, y: 6 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.92, y: 6 }}
      transition={{ type: 'spring', damping: 24, stiffness: 300 }}
      className={`max-w-[90%] ${isLumi ? 'self-start' : 'self-end'}`}
    >
      <div
        className={`
          rounded-2xl px-4 py-3 text-[14px] leading-relaxed backdrop-blur-md
          text-white/90 ${colorClass}
          ${isLumi ? 'rounded-tl-sm' : 'rounded-tr-sm'}
        `}
      >
        {isLumi && triggerType && (
          <span className="mr-1.5 text-base">
            {TRIGGER_ICONS[triggerType] ?? '💬'}
          </span>
        )}
        {message.text}

        {attachments.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {attachments.map((file) => (
              <span
                key={file.id}
                className="inline-flex items-center rounded-full bg-black/20 border border-white/15 px-2.5 py-1 text-[11px] text-white/80"
                title={file.previewText || file.name}
              >
                📎 {file.name}
              </span>
            ))}
          </div>
        )}
      </div>
      <div
        className={`text-[11px] text-white/25 mt-1.5 px-1 ${isLumi ? 'text-left' : 'text-right'}`}
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
