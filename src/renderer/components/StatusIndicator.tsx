import { motion } from 'framer-motion'

interface MicIndicatorProps {
  status: 'off' | 'listening'
}

export function MicIndicator({ status }: MicIndicatorProps) {
  return (
    <div
      className="flex items-center gap-1.5"
      title={status === 'listening' ? 'Mic active' : 'Mic off'}
    >
      <motion.div
        className={"w-2 h-2 rounded-full " + (status === 'listening' ? 'bg-purple-400' : 'bg-gray-600')}
        animate={status === 'listening' ? { scale: [1, 1.3, 1] } : {}}
        transition={{ duration: 1.5, repeat: Infinity }}
      />
      <span className="text-[11px] text-white/35 select-none">Mic</span>
    </div>
  )
}

interface OllamaIndicatorProps {
  status: 'unknown' | 'online' | 'offline'
}

export function OllamaIndicator({ status }: OllamaIndicatorProps) {
  const colors = {
    unknown: 'bg-white/20',
    online: 'bg-emerald-400',
    offline: 'bg-red-400',
  }

  const labels = {
    unknown: 'Connecting...',
    online: 'AI Ready',
    offline: 'AI Offline',
  }

  return (
    <div className="flex items-center gap-1.5" title={labels[status]}>
      <div className={"w-2 h-2 rounded-full " + colors[status]} />
      <span className="text-[11px] text-white/35 select-none">{labels[status]}</span>
    </div>
  )
}
