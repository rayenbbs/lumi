import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'

interface Props {
  text: string
  gazePosition?: { x: number; y: number } | null
  onClose: () => void
}

export default function BionicReader({ text, gazePosition, onClose }: Props) {
  const [gazedWordIdx, setGazedWordIdx] = useState<number | null>(null)

  // Resolve which word is under the gaze point using DOM hit-testing
  useEffect(() => {
    if (!gazePosition) {
      setGazedWordIdx(null)
      return
    }
    const el = document.elementFromPoint(gazePosition.x, gazePosition.y)
    if (!el) { setGazedWordIdx(null); return }
    const wordEl = el.closest('[data-word-index]') as HTMLElement | null
    if (wordEl) {
      setGazedWordIdx(parseInt(wordEl.dataset.wordIndex ?? '-1', 10))
    } else {
      setGazedWordIdx(null)
    }
  }, [gazePosition])

  const words = (text || 'No text captured yet. Start studying with a document open!').split(' ')

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
            <p className="text-white/40 text-xs mt-0.5">
              {gazePosition ? 'Eye tracking active — gaze highlights words' : 'Bold anchors guide your eye focus'}
            </p>
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
            {words.map((word, i) => {
              const clean = word.replace(/[^a-zA-Z]/g, '')
              const isGazed = i === gazedWordIdx

              if (clean.length <= 1) {
                return (
                  <span key={i} data-word-index={i} className={isGazed ? 'gaze-word' : ''}>
                    {word}{' '}
                  </span>
                )
              }

              const boldLen = Math.max(1, Math.ceil(clean.length * 0.45))
              const boldPart = word.substring(0, boldLen)
              const lightPart = word.substring(boldLen)

              return (
                <span key={i} data-word-index={i} className={`inline ${isGazed ? 'gaze-word' : ''}`}>
                  <strong className="font-bold text-white">{boldPart}</strong>
                  <span className={`font-light ${isGazed ? 'text-white' : 'text-white/55'}`}>
                    {lightPart}
                  </span>
                  {' '}
                </span>
              )
            })}
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
