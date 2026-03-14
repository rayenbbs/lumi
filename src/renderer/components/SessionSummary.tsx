import { motion } from 'framer-motion'
import { SessionStats } from '../services/session-tracker'

interface Props {
  stats: SessionStats
  focusScore: number
  onClose: () => void
}

export default function SessionSummary({ stats, focusScore, onClose }: Props) {
  const duration = Math.round((stats.totalFocusTime || Date.now() - stats.startTime) / 60_000)

  const scoreColor =
    focusScore >= 80 ? 'text-green-400' :
    focusScore >= 60 ? 'text-yellow-400' :
    'text-orange-400'

  const scoreLabel =
    focusScore >= 80 ? 'Great session!' :
    focusScore >= 60 ? 'Good effort!' :
    'Keep going!'

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 no-drag"
      style={{ background: 'rgba(10, 5, 25, 0.92)' }}
    >
      <motion.div
        initial={{ y: 50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 50, opacity: 0 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="w-full max-w-sm glass rounded-2xl p-6 relative"
      >
        {/* X close button (top-right) */}
        <button
          onClick={onClose}
          className="no-drag absolute top-3 right-3 w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/50 hover:text-white transition-colors"
        >
          ✕
        </button>

        {/* Header */}
        <div className="text-center mb-6">
          <div className="text-5xl mb-2">🎉</div>
          <h2 className="text-white font-bold text-xl">Session Complete!</h2>
          <p className="text-white/50 text-sm mt-1">Here's how you did</p>
        </div>

        {/* Focus score */}
        <div className="bg-white/5 rounded-xl p-4 mb-4 text-center">
          <div className={`text-5xl font-bold ${scoreColor}`}>{focusScore}</div>
          <div className="text-white/40 text-sm">Focus Score</div>
          <div className={`text-sm font-medium mt-1 ${scoreColor}`}>{scoreLabel}</div>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-3 mb-5">
          <StatCard label="Time Studied" value={`${duration} min`} icon="⏱️" />
          <StatCard label="Breaks Taken" value={String(stats.breaksTaken)} icon="☕" />
          <StatCard label="Distractions" value={String(stats.distractionCount)} icon="🔔" />
          <StatCard label="Stuck Moments" value={String(stats.stuckCount)} icon="🤔" />
        </div>

        {/* Topics */}
        {stats.topicsDiscussed.length > 0 && (
          <div className="mb-5">
            <div className="text-white/40 text-xs mb-2 uppercase tracking-wider">Topics Covered</div>
            <div className="flex flex-wrap gap-1.5">
              {stats.topicsDiscussed.slice(0, 6).map((topic, i) => (
                <span
                  key={i}
                  className="bg-purple-500/20 border border-purple-400/20 text-purple-300 text-xs px-2.5 py-1 rounded-full"
                >
                  {topic}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Close button */}
        <button
          onClick={onClose}
          className="no-drag w-full py-3 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-medium transition-colors"
        >
          Start New Session
        </button>
      </motion.div>
    </motion.div>
  )
}

function StatCard({ label, value, icon }: { label: string; value: string; icon: string }) {
  return (
    <div className="bg-white/5 rounded-xl p-3 text-center">
      <div className="text-xl mb-1">{icon}</div>
      <div className="text-white font-semibold text-lg">{value}</div>
      <div className="text-white/40 text-xs">{label}</div>
    </div>
  )
}
