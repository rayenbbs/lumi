import { motion } from 'framer-motion'
import { useState, useCallback, useRef } from 'react'

interface KnowledgeSource {
  name: string
  chunks: number
}

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
  knowledgeSources: KnowledgeSource[]
  onAddKnowledgeFile: () => void
  onAddKnowledgeFilesByPath: (filePaths: string[]) => void
  onRemoveKnowledgeFile: (fileName: string) => void
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
  knowledgeSources,
  onAddKnowledgeFile,
  onAddKnowledgeFilesByPath,
  onRemoveKnowledgeFile,
}: SettingsPanelProps) {
  const [appInput, setAppInput] = useState('')
  const [urlInput, setUrlInput] = useState('')
  const [isDragOver, setIsDragOver] = useState(false)
  const dragCounterRef = useRef(0)

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounterRef.current++
    if (dragCounterRef.current === 1) {
      setIsDragOver(true)
    }
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounterRef.current--
    if (dragCounterRef.current === 0) {
      setIsDragOver(false)
    }
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounterRef.current = 0
    setIsDragOver(false)

    const files = Array.from(e.dataTransfer.files)
    const pdfPaths = files
      .filter((f) => f.name.toLowerCase().endsWith('.pdf'))
      .map((f) => (window as any).electronAPI?.getPathForFile?.(f) || f.path)
      .filter(Boolean)

    if (pdfPaths.length > 0) {
      onAddKnowledgeFilesByPath(pdfPaths)
    }
  }, [onAddKnowledgeFilesByPath])

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

  const totalChunks = knowledgeSources.reduce((sum, s) => sum + s.chunks, 0)

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

        {/* Knowledge Base */}
        <div className="space-y-3">
          <h3 className="text-[13px] font-medium text-white/60 uppercase tracking-wider">Knowledge Base</h3>
          <p className="text-[12px] text-white/35">
            Add your course PDFs so Lumi can reference them when you're stuck
          </p>

          <div
            onDragEnter={handleDragEnter}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={onAddKnowledgeFile}
            className={`cursor-pointer w-full flex flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed transition-all px-4 py-5 ${
              isDragOver
                ? 'border-purple-400/60 bg-purple-500/20 scale-[1.02]'
                : 'border-purple-400/25 bg-purple-500/[0.06] hover:bg-purple-500/[0.12] hover:border-purple-400/40'
            }`}
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M9 3v12M3 9h12" stroke="rgba(192,170,255,0.7)" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <span className="text-[13px] text-purple-200/70">
              {isDragOver ? 'Drop PDF files here' : 'Drop PDFs here or click to browse'}
            </span>
          </div>

          {knowledgeSources.length > 0 && (
            <div className="space-y-1.5">
              {knowledgeSources.map((source) => (
                <div
                  key={source.name}
                  className="flex items-center gap-3 rounded-xl bg-white/[0.04] border border-white/[0.06] px-3.5 py-2.5 group"
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0">
                    <path d="M4 1h5l4 4v9a1 1 0 01-1 1H4a1 1 0 01-1-1V2a1 1 0 011-1z" stroke="rgba(192,170,255,0.5)" strokeWidth="1.2" />
                    <path d="M9 1v4h4" stroke="rgba(192,170,255,0.5)" strokeWidth="1.2" />
                  </svg>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] text-white/80 truncate">{source.name}</p>
                    {source.chunks > 0 && (
                      <p className="text-[11px] text-white/30">{source.chunks} indexed chunks</p>
                    )}
                  </div>
                  <button
                    onClick={() => onRemoveKnowledgeFile(source.name)}
                    className="cursor-pointer shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-white/20 opacity-0 group-hover:opacity-100 hover:text-red-400 hover:bg-red-500/10 transition-all"
                    title="Remove"
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path d="M9 3L3 9M3 3l6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                  </button>
                </div>
              ))}
              <p className="text-[11px] text-white/25 pt-1">
                {knowledgeSources.length} file{knowledgeSources.length !== 1 ? 's' : ''} · {totalChunks} chunks indexed
              </p>
            </div>
          )}
        </div>

        {/* Preferences */}
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
