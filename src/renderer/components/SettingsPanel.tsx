import { motion } from 'framer-motion'
import { useState } from 'react'

interface SettingsPanelProps {
  onClose: () => void
  customDistractingApps: string[]
  customDistractingUrls: string[]
  onAddDistractingApp: (value: string) => void
  onRemoveDistractingApp: (value: string) => void
  onAddDistractingUrl: (value: string) => void
  onRemoveDistractingUrl: (value: string) => void
  sttEnabled: boolean
  onToggleSTT: () => void
  sprintMinutes: number
  onSprintMinutesChange: (value: number) => void
}

export default function SettingsPanel({
  onClose,
  customDistractingApps,
  customDistractingUrls,
  onAddDistractingApp,
  onRemoveDistractingApp,
  onAddDistractingUrl,
  onRemoveDistractingUrl,
  sttEnabled,
  onToggleSTT,
  sprintMinutes,
  onSprintMinutesChange,
}: SettingsPanelProps) {
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
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="absolute inset-0 z-50 flex flex-col"
    >
      {/* Background */}
      <div className="absolute inset-0 bg-[rgba(12,8,24,0.95)] backdrop-blur-2xl rounded-l-2xl" />

      {/* Header */}
      <div className="relative z-10 px-5 pt-5 pb-4 flex items-center justify-between shrink-0">
        <h2 className="text-base font-semibold text-white/90">Settings</h2>
        <button
          onClick={onClose}
          className="cursor-pointer w-8 h-8 rounded-lg flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M12 4L4 12M4 4l8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {/* Content */}
      <div className="relative z-10 flex-1 overflow-y-auto px-5 pb-5 space-y-6">

        {/* Voice & Timer */}
        <div className="space-y-3">
          <h3 className="text-[13px] font-medium text-white/60 uppercase tracking-wider">Preferences</h3>

          <div className="flex items-center justify-between rounded-xl bg-white/[0.04] border border-white/[0.06] px-4 py-3">
            <div>
              <p className="text-[13px] text-white/90">Speech-to-Text</p>
              <p className="text-[12px] text-white/40 mt-0.5">Talk instead of typing</p>
            </div>
            <button
              onClick={onToggleSTT}
              className={`cursor-pointer relative w-11 h-6 rounded-full transition-colors ${
                sttEnabled ? 'bg-purple-500' : 'bg-white/15'
              }`}
            >
              <div
                className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                  sttEnabled ? 'translate-x-[22px]' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>

          <div className="flex items-center justify-between rounded-xl bg-white/[0.04] border border-white/[0.06] px-4 py-3">
            <div>
              <p className="text-[13px] text-white/90">Sprint Duration</p>
              <p className="text-[12px] text-white/40 mt-0.5">Focus session length</p>
            </div>
            <select
              value={sprintMinutes}
              onChange={(e) => onSprintMinutesChange(Number(e.target.value))}
              className="cursor-pointer rounded-lg border border-white/10 bg-white/[0.06] text-[13px] text-white px-3 py-1.5 outline-none"
            >
              <option value={15}>15 min</option>
              <option value={25}>25 min</option>
              <option value={35}>35 min</option>
              <option value={45}>45 min</option>
            </select>
          </div>
        </div>

        {/* Distracting Apps */}
        <div className="space-y-3">
          <h3 className="text-[13px] font-medium text-white/60 uppercase tracking-wider">Distracting Apps</h3>
          <p className="text-[12px] text-white/35">Lumi will nudge you when these are open</p>

          <div className="flex gap-2">
            <input
              value={appInput}
              onChange={(e) => setAppInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddApp()}
              placeholder="e.g. Discord, Twitter"
              className="flex-1 select-text rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2.5 text-[13px] text-white placeholder-white/25 outline-none focus:border-purple-400/40"
            />
            <button
              onClick={handleAddApp}
              className="cursor-pointer rounded-xl px-4 py-2.5 text-[13px] bg-purple-500/20 border border-purple-400/25 text-purple-200 hover:bg-purple-500/30 transition-colors"
            >
              Add
            </button>
          </div>

          {customDistractingApps.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {customDistractingApps.map((app) => (
                <button
                  key={app}
                  onClick={() => onRemoveDistractingApp(app)}
                  className="cursor-pointer inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] bg-white/[0.06] border border-white/[0.08] text-white/70 hover:bg-red-500/15 hover:border-red-400/25 hover:text-red-300 transition-colors"
                  title="Click to remove"
                >
                  {app}
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M9 3L3 9M3 3l6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Distracting Websites */}
        <div className="space-y-3">
          <h3 className="text-[13px] font-medium text-white/60 uppercase tracking-wider">Distracting Websites</h3>
          <p className="text-[12px] text-white/35">Lumi will notice when you browse these</p>

          <div className="flex gap-2">
            <input
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddUrl()}
              placeholder="e.g. x.com, reddit.com"
              className="flex-1 select-text rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2.5 text-[13px] text-white placeholder-white/25 outline-none focus:border-purple-400/40"
            />
            <button
              onClick={handleAddUrl}
              className="cursor-pointer rounded-xl px-4 py-2.5 text-[13px] bg-purple-500/20 border border-purple-400/25 text-purple-200 hover:bg-purple-500/30 transition-colors"
            >
              Add
            </button>
          </div>

          {customDistractingUrls.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {customDistractingUrls.map((url) => (
                <button
                  key={url}
                  onClick={() => onRemoveDistractingUrl(url)}
                  className="cursor-pointer inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] bg-white/[0.06] border border-white/[0.08] text-white/70 hover:bg-red-500/15 hover:border-red-400/25 hover:text-red-300 transition-colors"
                  title="Click to remove"
                >
                  {url}
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M9 3L3 9M3 3l6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  )
}
