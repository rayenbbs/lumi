// All LLM prompt building logic is in electron/ipc-handlers.ts (main process)
// This file provides types and client-side prompt helpers

export type TriggerType =
  | 'distraction'
  | 'stuck'
  | 'fatigue'
  | 'wandering'
  | 'session_start'
  | 'session_end'
  | 'proactive_bridge'
  | 'question'

export const TRIGGER_LABELS: Record<TriggerType, string> = {
  distraction: 'Distraction detected',
  stuck: 'Looks like you\'re stuck',
  fatigue: 'Time for a break?',
  wandering: 'Still with me?',
  session_start: 'Session started',
  session_end: 'Session complete',
  proactive_bridge: 'Quick note',
  question: 'Your question',
}

export const TRIGGER_ICONS: Record<TriggerType, string> = {
  distraction: '🔔',
  stuck: '🤔',
  fatigue: '😴',
  wandering: '👀',
  session_start: '👋',
  session_end: '📊',
  proactive_bridge: '🔗',
  question: '💬',
}

export const TRIGGER_COLORS: Record<TriggerType, string> = {
  distraction: 'from-orange-500/20 to-red-500/20 border-orange-400/20',
  stuck: 'from-blue-500/20 to-cyan-500/20 border-blue-400/20',
  fatigue: 'from-yellow-500/20 to-amber-500/20 border-yellow-400/20',
  wandering: 'from-teal-500/20 to-green-500/20 border-teal-400/20',
  session_start: 'from-purple-500/20 to-indigo-500/20 border-purple-400/20',
  session_end: 'from-purple-500/20 to-pink-500/20 border-purple-400/20',
  proactive_bridge: 'from-indigo-500/20 to-blue-500/20 border-indigo-400/20',
  question: 'from-purple-500/20 to-indigo-500/20 border-purple-400/20',
}
