import { motion } from 'framer-motion'

interface EyeIndicatorProps {
  status: 'off' | 'calibrating' | 'active'
}

interface MicIndicatorProps {
  status: 'off' | 'listening'
}

export function EyeIndicator({ status }: EyeIndicatorProps) {
  const colors = {
    off: 'bg-gray-600',
    calibrating: 'bg-yellow-400',
    active: 'bg-green-400',
  }

  const titles = {
    off: 'Eye tracking off',
    calibrating: 'Calibrating...',
    active: 'Eye tracking active',
  }

  return (
    <div className="flex items-center gap-1.5" title={titles[status]}>
      <motion.div
        className={`w-2 h-2 rounded-full ${colors[status]}`}
        animate={status === 'active' ? { opacity: [1, 0.4, 1] } : {}}
        transition={{ duration: 2, repeat: Infinity }}
      />
      <span className="text-[10px] text-white/40 select-none">👁</span>
    </div>
  )
}

export function MicIndicator({ status }: MicIndicatorProps) {
  return (
    <div
      className="flex items-center gap-1.5"
      title={status === 'listening' ? 'Mic active' : 'Mic off'}
    >
      <motion.div
        className={`w-2 h-2 rounded-full ${
          status === 'listening' ? 'bg-purple-400' : 'bg-gray-600'
        }`}
        animate={status === 'listening' ? { scale: [1, 1.3, 1] } : {}}
        transition={{ duration: 1.5, repeat: Infinity }}
      />
      <span className="text-[10px] text-white/40 select-none">🎤</span>
    </div>
  )
}

interface OllamaIndicatorProps {
  status: 'unknown' | 'online' | 'offline'
}

export function OllamaIndicator({ status }: OllamaIndicatorProps) {
  const colors = {
    unknown: 'bg-gray-600',
    online: 'bg-green-400',
    offline: 'bg-red-400',
  }

  const titles = {
    unknown: 'Checking Ollama...',
    online: 'Ollama connected',
    offline: 'Ollama offline — run: ollama serve',
  }

  return (
    <div className="flex items-center gap-1.5" title={titles[status]}>
      <div className={`w-2 h-2 rounded-full ${colors[status]}`} />
      <span className="text-[10px] text-white/40 select-none">🤖</span>
    </div>
  )
}
