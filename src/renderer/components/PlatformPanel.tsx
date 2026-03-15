import { motion } from 'framer-motion'

interface PlatformPanelProps {
  onPrompt: (prompt: string) => void
  outcomeSignals: Array<{ label: string; value: string }>
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
