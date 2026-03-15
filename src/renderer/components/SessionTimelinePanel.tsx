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

const FILTERS: { key: TimelineFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'triggers', label: 'Triggers' },
  { key: 'questions', label: 'Questions' },
  { key: 'actions', label: 'Actions' },
]

export default function SessionTimelinePanel({ timelineEvents, liveStats, focusScore }: SessionTimelinePanelProps) {
  const [filter, setFilter] = useState<TimelineFilter>('all')

  const filteredEvents = useMemo(() => {
    if (filter === 'all') return timelineEvents
    if (filter === 'questions') return timelineEvents.filter((e) => e.type === 'question')
    if (filter === 'actions') return timelineEvents.filter((e) => e.type === 'platform_action')
    return timelineEvents.filter((e) =>
      ['distraction', 'stuck', 'fatigue', 'wandering', 'proactive_bridge', 'session_start', 'session_end'].includes(e.type)
    )
  }, [filter, timelineEvents])

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className="relative z-10 px-4 pb-4"
    >
      {/* Focus Score — prominent */}
      <div className="text-center py-4 mb-4">
        <p className="text-[12px] text-white/40 uppercase tracking-wider mb-1">Focus Score</p>
        <p className={`text-5xl font-light tracking-tight ${
          focusScore >= 80 ? 'text-emerald-300' : focusScore >= 60 ? 'text-amber-300' : 'text-orange-300'
        }`}>
          {focusScore}
        </p>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-3 gap-2.5 mb-5">
        <StatCard label="Distractions" value={String(liveStats?.distractionCount ?? 0)} />
        <StatCard label="Stuck" value={String(liveStats?.stuckCount ?? 0)} />
        <StatCard label="Fatigue" value={String(liveStats?.fatigueCount ?? 0)} />
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-1.5 mb-3">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`cursor-pointer text-[12px] rounded-lg px-3 py-1.5 border transition-colors ${
              filter === f.key
                ? 'bg-purple-500/15 border-purple-400/25 text-purple-200'
                : 'bg-white/[0.03] border-white/[0.06] text-white/40 hover:text-white/60 hover:bg-white/[0.06]'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Timeline */}
      <div className="space-y-2 max-h-[340px] overflow-y-auto">
        {filteredEvents.length === 0 && (
          <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] px-4 py-3 text-[13px] text-white/40">
            No events yet. They'll show up as you study.
          </div>
        )}
        {filteredEvents.slice(0, 24).map((event) => (
          <div key={event.id} className="rounded-xl bg-white/[0.03] border border-white/[0.06] px-3.5 py-2.5">
            <div className="flex items-start gap-2.5">
              <span className="text-base leading-none mt-0.5">{EVENT_ICON[event.type]}</span>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] text-white/80 leading-snug">{event.text}</p>
                <p className="text-[11px] text-white/30 mt-1">
                  {new Date(event.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </motion.section>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] px-3 py-2.5 text-center">
      <p className="text-[11px] text-white/35">{label}</p>
      <p className="text-lg text-white/80 mt-0.5 font-medium">{value}</p>
    </div>
  )
}
