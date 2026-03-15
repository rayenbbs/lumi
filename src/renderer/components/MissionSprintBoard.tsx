import { motion } from 'framer-motion'

interface MissionSprintBoardProps {
  mission: string
  onMissionChange: (value: string) => void
  missionCompleted: boolean
  onToggleMissionCompleted: () => void
  doneStreak: number
  sprintSecondsLeft: number
  isRunning: boolean
  onStartPause: () => void
  onReset: () => void
}

function formatTime(totalSeconds: number): string {
  const mins = Math.floor(totalSeconds / 60)
  const secs = totalSeconds % 60
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

export default function MissionSprintBoard({
  mission,
  onMissionChange,
  missionCompleted,
  onToggleMissionCompleted,
  doneStreak,
  sprintSecondsLeft,
  isRunning,
  onStartPause,
  onReset,
}: MissionSprintBoardProps) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut', delay: 0.05 }}
      className="relative z-10 px-4 pb-4"
    >
      <div className="space-y-4">
        {/* Mission */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <p className="text-[13px] font-medium text-white/50 uppercase tracking-wider">Mission</p>
            {doneStreak > 0 && (
              <span className="text-[12px] text-emerald-300/80 bg-emerald-500/10 border border-emerald-400/15 rounded-full px-2.5 py-0.5">
                {doneStreak} streak
              </span>
            )}
          </div>
          <input
            value={mission}
            onChange={(e) => onMissionChange(e.target.value)}
            placeholder="What's your goal for this session?"
            className="w-full select-text rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-[13px] text-white placeholder-white/25 outline-none focus:border-purple-400/30 transition-colors"
          />
          <button
            onClick={onToggleMissionCompleted}
            className={`cursor-pointer w-full rounded-xl px-4 py-2.5 text-[13px] font-medium border transition-all ${
              missionCompleted
                ? 'bg-emerald-500/20 border-emerald-400/25 text-emerald-200'
                : 'bg-white/[0.04] border-white/[0.08] text-white/50 hover:bg-white/[0.08] hover:text-white/70'
            }`}
          >
            {missionCompleted ? 'Done!' : 'Mark complete'}
          </button>
        </div>

        {/* Sprint Timer */}
        <div className="rounded-2xl bg-white/[0.03] border border-white/[0.06] p-4">
          <p className="text-[13px] font-medium text-white/50 uppercase tracking-wider mb-3">Sprint Timer</p>

          <div className="text-center py-3 mb-3">
            <p className="text-4xl font-light text-white/90 tracking-widest font-mono">{formatTime(sprintSecondsLeft)}</p>
          </div>

          <div className="flex gap-2">
            <button
              onClick={onStartPause}
              className={`cursor-pointer flex-1 rounded-xl py-2.5 text-[13px] font-medium border transition-all ${
                isRunning
                  ? 'bg-amber-500/15 border-amber-400/20 text-amber-200 hover:bg-amber-500/25'
                  : 'bg-purple-500/20 border-purple-400/25 text-purple-200 hover:bg-purple-500/30'
              }`}
            >
              {isRunning ? 'Pause' : 'Start'}
            </button>
            <button
              onClick={onReset}
              className="cursor-pointer rounded-xl px-4 py-2.5 text-[13px] bg-white/[0.04] border border-white/[0.08] text-white/50 hover:bg-white/[0.08] hover:text-white/70 transition-all"
            >
              Reset
            </button>
          </div>
        </div>
      </div>
    </motion.section>
  )
}
