import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

interface Props {
  onComplete: () => void
  onSkip: () => void
}

// Calibration points — 9-point grid
const CALIBRATION_POINTS = [
  { x: 10, y: 10 }, { x: 50, y: 10 }, { x: 90, y: 10 },
  { x: 10, y: 50 }, { x: 50, y: 50 }, { x: 90, y: 50 },
  { x: 10, y: 90 }, { x: 50, y: 90 }, { x: 90, y: 90 },
]

export default function CalibrationOverlay({ onComplete, onSkip }: Props) {
  const [currentPoint, setCurrentPoint] = useState(0)
  const [clickCount, setClickCount] = useState(0)
  const [isDone, setIsDone] = useState(false)

  const handleClick = useCallback(() => {
    const newCount = clickCount + 1
    setClickCount(newCount)

    // Require 3 clicks per point for better calibration
    if (newCount >= 3) {
      setClickCount(0)
      if (currentPoint >= CALIBRATION_POINTS.length - 1) {
        setIsDone(true)
        setTimeout(onComplete, 1000)
      } else {
        setCurrentPoint((p) => p + 1)
      }
    }
  }, [clickCount, currentPoint, onComplete])

  const point = CALIBRATION_POINTS[currentPoint]
  const progress = (currentPoint / CALIBRATION_POINTS.length) * 100

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100]"
      style={{ background: 'rgba(5, 3, 20, 0.95)', cursor: 'none' }}
    >
      {/* Instructions */}
      <div className="absolute top-8 left-1/2 -translate-x-1/2 text-center z-10">
        <h2 className="text-white text-xl font-semibold mb-1">Eye Tracker Calibration</h2>
        <p className="text-white/60 text-sm">
          {isDone
            ? 'Calibration complete!'
            : `Look at each dot and click it ${3 - clickCount} more time${3 - clickCount !== 1 ? 's' : ''}`}
        </p>
        <div className="mt-3 w-48 mx-auto bg-white/10 rounded-full h-1.5">
          <div
            className="bg-purple-500 h-full rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="text-white/40 text-xs mt-1">
          Point {currentPoint + 1} of {CALIBRATION_POINTS.length}
        </div>
      </div>

      {/* Calibration dot */}
      <AnimatePresence mode="wait">
        {!isDone && (
          <motion.button
            key={currentPoint}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            className="no-drag absolute w-8 h-8 -translate-x-1/2 -translate-y-1/2"
            style={{
              left: `${point.x}%`,
              top: `${point.y}%`,
            }}
            onClick={handleClick}
          >
            <div className="relative w-full h-full">
              {/* Outer ring */}
              <motion.div
                className="absolute inset-0 rounded-full border-2 border-purple-400"
                animate={{ scale: [1, 1.4, 1], opacity: [1, 0.3, 1] }}
                transition={{ duration: 1.5, repeat: Infinity }}
              />
              {/* Inner dot */}
              <div className="absolute inset-1.5 rounded-full bg-purple-400" />
            </div>
          </motion.button>
        )}
      </AnimatePresence>

      {/* Done state */}
      <AnimatePresence>
        {isDone && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="absolute inset-0 flex items-center justify-center"
          >
            <div className="text-6xl">✅</div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Skip button */}
      {!isDone && (
        <button
          onClick={onSkip}
          className="no-drag absolute bottom-8 left-1/2 -translate-x-1/2 text-white/40 hover:text-white/70 text-sm transition-colors"
        >
          Skip calibration (eye tracking will be less accurate)
        </button>
      )}
    </motion.div>
  )
}
