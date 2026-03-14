import { motion } from 'framer-motion'

interface Props {
  text: string
  onClose: () => void
}

function toBionic(text: string): React.ReactNode[] {
  return text.split(' ').map((word, i) => {
    const clean = word.replace(/[^a-zA-Z]/g, '')
    if (clean.length <= 1) {
      return <span key={i}>{word} </span>
    }

    const boldLen = Math.max(1, Math.ceil(clean.length * 0.45))
    const boldPart = word.substring(0, boldLen)
    const lightPart = word.substring(boldLen)

    return (
      <span key={i}>
        <strong className="font-bold text-white">{boldPart}</strong>
        <span className="font-light text-white/55">{lightPart}</span>{' '}
      </span>
    )
  })
}

export default function BionicReader({ text, onClose }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-6"
      style={{ background: 'rgba(10, 5, 25, 0.97)' }}
    >
      <motion.div
        initial={{ scale: 0.95, y: 10 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.95, y: 10 }}
        className="w-full max-w-2xl"
      >
        {/* Header */}
        <div className="flex justify-between items-center mb-5">
          <div>
            <h2 className="text-purple-400 font-semibold text-base">Bionic Reading Mode</h2>
            <p className="text-white/40 text-xs mt-0.5">Bold anchors guide your eye focus</p>
          </div>
          <button
            onClick={onClose}
            className="no-drag w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/60 hover:text-white transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="max-h-[65vh] overflow-y-auto pr-2">
          <div className="text-lg leading-[2] tracking-wide font-serif text-white/90">
            {toBionic(text || 'No text captured yet. Start studying with a document open!')}
          </div>
        </div>

        {/* Footer hint */}
        <div className="mt-4 pt-3 border-t border-white/10 text-xs text-white/30 text-center">
          Read along — your brain will fill in the rest automatically
        </div>
      </motion.div>
    </motion.div>
  )
}
