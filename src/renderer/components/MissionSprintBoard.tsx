import { motion } from 'framer-motion'

interface MissionSprintBoardProps {
  mission: string
  onMissionChange: (value: string) => void
  missionCompleted: boolean
  onToggleMissionCompleted: () => void
  doneStreak: number
  sprintMinutes: number
  onSprintMinutesChange: (value: number) => void
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
  sprintMinutes,
  onSprintMinutesChange,
  sprintSecondsLeft,
  isRunning,
  onStartPause,
  onReset,
}: MissionSprintBoardProps) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: 'easeOut' }}
      className="relative z-10 px-4 pb-3"
    >
      <div className="rounded-2xl border border-emerald-300/20 bg-slate-900/45 backdrop-blur-xl overflow-hidden">
        <div className="px-3 py-2 border-b border-white/10 bg-gradient-to-r from-emerald-400/15 via-cyan-400/10 to-sky-400/10">
          <p className="text-xs font-semibold text-emerald-100 tracking-wide">Session Mission + Sprint Board</p>
        </div>

        <div className="p-3 space-y-3">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-[11px] text-white/70">Mission</p>
              <div className="text-[10px] text-emerald-100/90 bg-emerald-400/15 border border-emerald-300/25 rounded-full px-2 py-0.5">
                Done streak: {doneStreak}
              </div>
            </div>
            <input
              value={mission}
              onChange={(e) => onMissionChange(e.target.value)}
              placeholder="Finish chapter 3 and solve 3 practice questions"
              className="w-full rounded-xl border border-white/12 bg-white/5 px-3 py-2 text-[12px] text-white placeholder-white/35 outline-none focus:border-emerald-300/35"
            />
            <button
              onClick={onToggleMissionCompleted}
              className={`mt-2 w-full rounded-lg px-3 py-1.5 text-[11px] border transition-colors ${
                missionCompleted
                  ? 'bg-emerald-500/25 border-emerald-300/35 text-emerald-100'
                  : 'bg-white/5 border-white/12 text-white/70 hover:bg-white/10'
              }`}
            >
              {missionCompleted ? 'Mission Completed ✓' : 'Mark Mission Complete'}
            </button>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/5 p-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[11px] text-white/70">Sprint Duration</p>
              <select
                value={sprintMinutes}
                onChange={(e) => onSprintMinutesChange(Number(e.target.value))}
                className="rounded-md border border-white/15 bg-slate-900/70 text-[11px] text-white px-2 py-1"
              >
                <option value={15}>15 min</option>
                <option value={25}>25 min</option>
                <option value={35}>35 min</option>
                <option value={45}>45 min</option>
              </select>
            </div>

            <div className="text-center rounded-lg bg-slate-950/50 border border-cyan-300/20 py-3 mb-2">
              <p className="text-[10px] text-white/50">Sprint Clock</p>
              <p className="text-2xl font-semibold text-cyan-100 tracking-wider">{formatTime(sprintSecondsLeft)}</p>
            </div>

            <div className="flex gap-2">
              <button
                onClick={onStartPause}
                className="flex-1 rounded-lg bg-emerald-500/25 border border-emerald-300/35 text-emerald-100 text-[11px] py-2 hover:bg-emerald-500/35 transition-colors"
              >
                {isRunning ? 'Pause Sprint' : 'Start Sprint'}
              </button>
              <button
                onClick={onReset}
                className="rounded-lg bg-white/10 border border-white/20 text-white/85 text-[11px] px-3 py-2 hover:bg-white/15 transition-colors"
              >
                Reset
              </button>
            </div>
          </div>
        </div>
      </div>
    </motion.section>
  )
}
