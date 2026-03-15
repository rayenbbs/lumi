import { motion } from 'framer-motion'
import { useState } from 'react'

interface PlatformPanelProps {
  onPrompt: (prompt: string) => void
  outcomeSignals: Array<{ label: string; value: string }>
  customDistractingApps: string[]
  customDistractingUrls: string[]
  onAddDistractingApp: (value: string) => void
  onRemoveDistractingApp: (value: string) => void
  onAddDistractingUrl: (value: string) => void
  onRemoveDistractingUrl: (value: string) => void
}

type SubjectCard = {
  id: string
  label: string
  icon: string
  seedPrompt: string
}

type GroundedAction = {
  id: string
  title: string
  detail: string
  prompt: string
}

const SUBJECTS: SubjectCard[] = [
  {
    id: 'cs',
    label: 'Computer Science',
    icon: '💻',
    seedPrompt: 'I am studying computer science. Explain the core concept on my current screen with one concrete example.',
  },
  {
    id: 'math',
    label: 'Mathematics',
    icon: '📐',
    seedPrompt: 'I am studying mathematics. Break down what is on my screen into simple steps and one practice question.',
  },
  {
    id: 'biology',
    label: 'Biology',
    icon: '🧬',
    seedPrompt: 'I am studying biology. Summarize what is on my screen and relate it to a real-world system.',
  },
  {
    id: 'business',
    label: 'Business',
    icon: '📈',
    seedPrompt: 'I am studying business. Turn what is on my screen into a quick decision framework I can remember.',
  },
  {
    id: 'law',
    label: 'Law',
    icon: '⚖️',
    seedPrompt: 'I am studying law. Extract key terms from my screen and give me a mini issue-rule-analysis format.',
  },
]

const GROUNDED_ACTIONS: GroundedAction[] = [
  {
    id: 'explain-screen',
    title: 'Explain Current Screen',
    detail: 'Ground explanation to OCR + course context',
    prompt: 'Use only my screen content and syllabus context to explain this clearly in 5 bullets.',
  },
  {
    id: 'quiz-me',
    title: 'Generate Micro Quiz',
    detail: '3 questions, immediate answers after I try',
    prompt: 'Create a 3-question micro quiz based only on my current screen and retrieved course context.',
  },
  {
    id: 'bridge-gaps',
    title: 'Prerequisite Bridge',
    detail: 'Find missing concepts and bridge them',
    prompt: 'Identify likely prerequisite gaps in what I am reading and teach them quickly before we continue.',
  },
]

export default function PlatformPanel({
  onPrompt,
  outcomeSignals,
  customDistractingApps,
  customDistractingUrls,
  onAddDistractingApp,
  onRemoveDistractingApp,
  onAddDistractingUrl,
  onRemoveDistractingUrl,
}: PlatformPanelProps) {
  const [appInput, setAppInput] = useState('')
  const [urlInput, setUrlInput] = useState('')

  const handleAddApp = () => {
    const value = appInput.trim().toLowerCase()
    if (!value) return
    onAddDistractingApp(value)
    setAppInput('')
  }

  const handleAddUrl = () => {
    const value = urlInput.trim().toLowerCase()
    if (!value) return
    onAddDistractingUrl(value)
    setUrlInput('')
  }

  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: 'easeOut' }}
      className="relative z-10 px-4 pb-3"
    >
      <div className="rounded-2xl border border-cyan-300/20 bg-slate-900/45 backdrop-blur-xl overflow-hidden">
        <div className="px-3 py-2 border-b border-white/10 bg-gradient-to-r from-cyan-500/15 via-emerald-400/10 to-amber-300/10">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-cyan-100 tracking-wide">Study Platform</p>
            <p className="text-[10px] text-white/60">Grounded • Local-first • Inclusive</p>
          </div>
        </div>

        <div className="p-3 space-y-3 max-h-[320px] overflow-y-auto">
          <div>
            <p className="text-[11px] text-white/70 mb-2">Subject Studio</p>
            <div className="grid grid-cols-2 gap-2">
              {SUBJECTS.map((subject) => (
                <button
                  key={subject.id}
                  onClick={() => onPrompt(subject.seedPrompt)}
                  className="text-left rounded-xl border border-white/10 bg-white/5 hover:bg-cyan-500/15 hover:border-cyan-300/35 transition-all px-2.5 py-2"
                >
                  <span className="text-sm mr-1">{subject.icon}</span>
                  <span className="text-[11px] text-white/85 leading-tight">{subject.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-[11px] text-white/70 mb-2">Grounded Assistance</p>
            <div className="space-y-2">
              {GROUNDED_ACTIONS.map((action) => (
                <button
                  key={action.id}
                  onClick={() => onPrompt(action.prompt)}
                  className="w-full text-left rounded-xl border border-white/10 bg-white/5 hover:bg-emerald-400/10 hover:border-emerald-300/35 transition-all px-2.5 py-2"
                >
                  <p className="text-[11px] text-white/90">{action.title}</p>
                  <p className="text-[10px] text-white/50 mt-0.5">{action.detail}</p>
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-[11px] text-white/70 mb-2">Outcome Signals</p>
            <div className="grid grid-cols-3 gap-2">
              {outcomeSignals.map((item) => (
                <div key={item.label} className="rounded-lg border border-amber-300/20 bg-amber-200/10 px-2 py-1.5">
                  <p className="text-[9px] text-white/50">{item.label}</p>
                  <p className="text-[10px] text-amber-100 mt-0.5">{item.value}</p>
                </div>
              ))}
            </div>
          </div>

          <div>
            <p className="text-[11px] text-white/70 mb-2">Custom Distractions</p>

            <div className="rounded-xl border border-white/10 bg-white/5 p-2.5 mb-2">
              <p className="text-[10px] text-white/55 mb-1">Add distracting application name</p>
              <div className="flex gap-1.5">
                <input
                  value={appInput}
                  onChange={(e) => setAppInput(e.target.value)}
                  placeholder="e.g. notion calendar"
                  className="flex-1 rounded-md border border-white/15 bg-slate-900/65 px-2 py-1.5 text-[11px] text-white placeholder-white/35 outline-none"
                />
                <button
                  onClick={handleAddApp}
                  className="rounded-md px-2.5 py-1.5 text-[11px] bg-cyan-500/20 border border-cyan-300/30 text-cyan-100 hover:bg-cyan-500/30"
                >
                  Add
                </button>
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {customDistractingApps.map((app) => (
                  <button
                    key={app}
                    onClick={() => onRemoveDistractingApp(app)}
                    className="rounded-full px-2 py-0.5 text-[10px] bg-white/10 border border-white/20 text-white/80 hover:bg-red-400/20"
                    title="Remove"
                  >
                    {app} ✕
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/5 p-2.5">
              <p className="text-[10px] text-white/55 mb-1">Add distracting website/domain</p>
              <div className="flex gap-1.5">
                <input
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  placeholder="e.g. x.com"
                  className="flex-1 rounded-md border border-white/15 bg-slate-900/65 px-2 py-1.5 text-[11px] text-white placeholder-white/35 outline-none"
                />
                <button
                  onClick={handleAddUrl}
                  className="rounded-md px-2.5 py-1.5 text-[11px] bg-emerald-500/20 border border-emerald-300/30 text-emerald-100 hover:bg-emerald-500/30"
                >
                  Add
                </button>
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {customDistractingUrls.map((url) => (
                  <button
                    key={url}
                    onClick={() => onRemoveDistractingUrl(url)}
                    className="rounded-full px-2 py-0.5 text-[10px] bg-white/10 border border-white/20 text-white/80 hover:bg-red-400/20"
                    title="Remove"
                  >
                    {url} ✕
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </motion.section>
  )
}
