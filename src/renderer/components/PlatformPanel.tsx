import { motion } from 'framer-motion'

interface PlatformPanelProps {
  onPrompt: (prompt: string) => void
  outcomeSignals: Array<{ label: string; value: string }>
  hasKnowledgeSources?: boolean
}

type QuickAction = {
  id: string
  title: string
  subtitle: string
  icon: string
  prompt: string
}

const QUICK_ACTIONS: QuickAction[] = [
  {
    id: 'explain-screen',
    title: 'Explain this',
    subtitle: 'Break down what\'s on screen',
    icon: '💡',
    prompt: 'Use only my screen content and syllabus context to explain this clearly in 5 bullets.',
  },
  {
    id: 'quiz-me',
    title: 'Quiz me',
    subtitle: '3 quick questions to check understanding',
    icon: '✏️',
    prompt: 'Create a 3-question micro quiz based only on my current screen and retrieved course context.',
  },
  {
    id: 'bridge-gaps',
    title: 'Fill in gaps',
    subtitle: 'Catch me up on prerequisites',
    icon: '🔗',
    prompt: 'Identify likely prerequisite gaps in what I am reading and teach them quickly before we continue.',
  },
]

export default function PlatformPanel({
  onPrompt,
  outcomeSignals,
  hasKnowledgeSources,
}: PlatformPanelProps) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className="relative z-10 px-4 pb-4"
    >
      {/* Quick Actions */}
      <div className="space-y-2.5">
        <p className="text-[13px] font-medium text-white/50 uppercase tracking-wider">Quick Actions</p>
        <div className="space-y-2">
          {QUICK_ACTIONS.map((action) => (
            <button
              key={action.id}
              onClick={() => onPrompt(action.prompt)}
              className="cursor-pointer w-full text-left rounded-2xl border border-white/[0.06] bg-white/[0.03] hover:bg-purple-500/10 hover:border-purple-400/20 transition-all px-4 py-3.5 group"
            >
              <div className="flex items-center gap-3">
                <span className="text-lg flex-shrink-0">{action.icon}</span>
                <div>
                  <p className="text-[14px] text-white/90 font-medium group-hover:text-white transition-colors">{action.title}</p>
                  <p className="text-[12px] text-white/40 mt-0.5">{action.subtitle}</p>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Knowledge Map — visualization tool */}
      <div className="mt-5 space-y-2.5">
        <p className="text-[13px] font-medium text-white/50 uppercase tracking-wider">Visualization</p>
        <button
          onClick={() => (window as any).electronAPI?.openKnowledgeGraph?.()}
          disabled={!hasKnowledgeSources}
          className="cursor-pointer w-full text-left rounded-2xl border border-white/[0.06] bg-white/[0.03] hover:bg-purple-500/10 hover:border-purple-400/20 transition-all px-4 py-3.5 group disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <div className="flex items-center gap-3">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="shrink-0">
              <path d="M12 3v18M12 3l-6 4v6M12 3l6 4v6M6 7l6 4M18 7l-6 4M6 13l6 4M18 13l-6 4" stroke="rgba(192,170,255,0.7)" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <div>
              <p className="text-[14px] text-white/90 font-medium group-hover:text-white transition-colors">Knowledge Map</p>
              <p className="text-[12px] text-white/40 mt-0.5">
                {hasKnowledgeSources
                  ? 'See how concepts connect across your PDFs'
                  : 'Add PDFs in Settings first'}
              </p>
            </div>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="ml-auto shrink-0 text-white/20 group-hover:text-white/40 transition-colors">
              <path d="M2 12L12 2M12 2H5M12 2v7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        </button>
      </div>

      {/* Session Stats — minimal */}
      <div className="mt-5 flex gap-3">
        {outcomeSignals.map((item) => (
          <div key={item.label} className="flex-1 rounded-xl bg-white/[0.03] border border-white/[0.06] px-3 py-2.5 text-center">
            <p className="text-[12px] text-white/35">{item.label}</p>
            <p className="text-[14px] text-white/80 mt-1 font-medium">{item.value}</p>
          </div>
        ))}
      </div>
    </motion.section>
  )
}
