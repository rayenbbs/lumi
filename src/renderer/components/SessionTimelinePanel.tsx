import { motion } from 'framer-motion'
import { useMemo, useState } from 'react'
import { SessionStats } from '../services/session-tracker'

type TimelineEventType =
  | 'session_start'
  | 'session_end'
  | 'distraction'
  | 'stuck'
  | 'fatigue'
  | 'wandering'
  | 'proactive_bridge'
  | 'question'
  | 'platform_action'

export interface TimelineEvent {
  id: string
  type: TimelineEventType
  text: string
  timestamp: number
}

type TimelineFilter = 'all' | 'triggers' | 'questions' | 'actions'

interface SessionTimelinePanelProps {
  timelineEvents: TimelineEvent[]
  liveStats: SessionStats | null
  focusScore: number
}

const EVENT_ICON: Record<TimelineEventType, string> = {
  session_start: '🚀',
  session_end: '🏁',
  distraction: '🔔',
  stuck: '🧩',
  fatigue: '😴',
  wandering: '🧭',
  proactive_bridge: '🪜',
  question: '❓',
  platform_action: '🛠️',
}

export default function SessionTimelinePanel({ timelineEvents, liveStats, focusScore }: SessionTimelinePanelProps) {
  const [filter, setFilter] = useState<TimelineFilter>('all')

  const filteredEvents = useMemo(() => {
    if (filter === 'all') return timelineEvents

    if (filter === 'questions') {
      return timelineEvents.filter((event) => event.type === 'question')
    }

    if (filter === 'actions') {
      return timelineEvents.filter((event) => event.type === 'platform_action')
    }

    return timelineEvents.filter((event) =>
      event.type === 'distraction' ||
      event.type === 'stuck' ||
      event.type === 'fatigue' ||
      event.type === 'wandering' ||
      event.type === 'proactive_bridge' ||
      event.type === 'session_start' ||
      event.type === 'session_end'
    )
  }, [filter, timelineEvents])

  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: 'easeOut' }}
      className="relative z-10 px-4 pb-3"
    >
      <div className="rounded-2xl border border-amber-300/20 bg-slate-900/45 backdrop-blur-xl overflow-hidden">
        <div className="px-3 py-2 border-b border-white/10 bg-gradient-to-r from-amber-400/15 via-orange-400/10 to-cyan-400/10">
          <p className="text-xs font-semibold text-amber-100 tracking-wide">Session Timeline</p>
        </div>

        <div className="p-3 space-y-3 max-h-[560px] overflow-y-auto">
          <div className="grid grid-cols-2 gap-2">
            <StatCard label="Focus Score" value={`${focusScore}`} accent="text-amber-100" />
            <StatCard label="Distractions" value={String(liveStats?.distractionCount ?? 0)} accent="text-white" />
            <StatCard label="Stuck" value={String(liveStats?.stuckCount ?? 0)} accent="text-white" />
            <StatCard label="Fatigue" value={String(liveStats?.fatigueCount ?? 0)} accent="text-white" />
          </div>

          <div>
            <p className="text-[11px] text-white/70 mb-2">Live Events</p>
            <div className="grid grid-cols-4 gap-1 mb-2">
              {(['all', 'triggers', 'questions', 'actions'] as TimelineFilter[]).map((option) => (
                <button
                  key={option}
                  onClick={() => setFilter(option)}
                  className={`text-[10px] capitalize rounded-md py-1 border transition-colors ${
                    filter === option
                      ? 'bg-cyan-500/20 border-cyan-300/35 text-cyan-100'
                      : 'bg-white/5 border-white/12 text-white/65 hover:bg-white/10'
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
            <div className="space-y-2">
              {filteredEvents.length === 0 && (
                <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[11px] text-white/60">
                  Timeline will populate after your first interaction.
                </div>
              )}
              {filteredEvents.slice(0, 24).map((event) => (
                <div key={event.id} className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-2">
                  <div className="flex items-start gap-2">
                    <span className="text-sm leading-none mt-0.5">{EVENT_ICON[event.type]}</span>
                    <div className="min-w-0">
                      <p className="text-[11px] text-white/90 leading-tight">{event.text}</p>
                      <p className="text-[10px] text-white/45 mt-1">
                        {new Date(event.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </motion.section>
  )
}

function StatCard({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5">
      <p className="text-[9px] text-white/50">{label}</p>
      <p className={`text-sm mt-0.5 ${accent}`}>{value}</p>
    </div>
  )
}
