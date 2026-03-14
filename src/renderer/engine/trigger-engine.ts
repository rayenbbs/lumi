import { EyeMetrics } from '../services/eye-tracker'
import { isDistractingWindow, isStudyWindow } from '../config/distractions'
import { CONFIG } from '../config/constants'

export type TriggerType =
  | 'distraction'
  | 'stuck'
  | 'fatigue'
  | 'wandering'
  | 'session_start'
  | 'session_end'
  | 'proactive_bridge'
  | 'question'
  | null

export type LumiState =
  | 'sleeping'      // No active study session
  | 'watching'      // Monitoring, student is focused
  | 'intervening'   // Currently showing a message
  | 'chatting'      // Student initiated a conversation
  | 'break'         // Break time

export interface ActiveWindowInfo {
  title: string
  owner: string
  url: string | null
}

export interface TriggerEvent {
  type: TriggerType
  confidence: number    // 0-1 how sure we are
  context: string       // What to pass to the LLM
  timestamp: number
}

export class TriggerEngine {
  private state: LumiState = 'sleeping'
  private lastInterventionTime = 0
  private triggerCooldowns = new Map<string, number>()
  private sessionStartTime: number | null = null
  private lastBreakTime: number | null = null

  // Distraction tracking
  private distractionStartTime: number | null = null
  private nonDistractingStartTime: number | null = null
  private distractionNudgeCount = 0

  // Wandering tracking
  private offScreenStartTime: number | null = null

  private onTrigger: ((event: TriggerEvent) => void) | null = null

  setTriggerCallback(callback: (event: TriggerEvent) => void) {
    this.onTrigger = callback
  }

  getState(): LumiState {
    return this.state
  }

  setState(state: LumiState) {
    this.state = state
  }

  getSessionDuration(): number {
    if (!this.sessionStartTime) return 0
    return Date.now() - this.sessionStartTime
  }

  startSession() {
    this.state = 'watching'
    this.sessionStartTime = Date.now()
    this.lastBreakTime = Date.now()
    this.fireTrigger({
      type: 'session_start',
      confidence: 1,
      context: 'Student started a new study session.',
      timestamp: Date.now(),
    })
  }

  endSession(summary: string) {
    this.fireTrigger({
      type: 'session_end',
      confidence: 1,
      context: summary,
      timestamp: Date.now(),
    })
    this.state = 'sleeping'
    this.sessionStartTime = null
  }

  returnFromBreak() {
    this.state = 'watching'
    this.lastBreakTime = Date.now()
  }

  // === MAIN UPDATE — Call every 500ms ===
  update(
    eyeMetrics: EyeMetrics | null,
    activeWindow: ActiveWindowInfo | null,
    ocrText: string
  ) {
    if (this.state === 'sleeping' || this.state === 'break') {
      console.log('[TRIGGER] skip: state =', this.state)
      return
    }
    if (this.state === 'intervening') {
      console.log('[TRIGGER] skip: state = intervening')
      return
    }
    if (this.state === 'chatting') {
      console.log('[TRIGGER] skip: state = chatting')
      return
    }

    const now = Date.now()

    // Respect minimum gap between interventions
    if (now - this.lastInterventionTime < CONFIG.MIN_INTERVENTION_GAP) {
      console.log('[TRIGGER] skip: intervention gap, wait', Math.round((CONFIG.MIN_INTERVENTION_GAP - (now - this.lastInterventionTime)) / 1000), 's')
      return
    }

    // 1. Distraction (highest priority)
    if (activeWindow) {
      console.log('[TRIGGER] checking distraction:', activeWindow.owner, '|', activeWindow.title, '| isDistracting:', isDistractingWindow(activeWindow))
    }
    const distraction = this.checkDistraction(activeWindow, now)
    if (distraction) { this.fireTrigger(distraction); return }

    // 2. Eye-based checks
    if (eyeMetrics) {
      const stuck = this.checkStuck(eyeMetrics, ocrText, now)
      if (stuck) { this.fireTrigger(stuck); return }

      const fatigue = this.checkFatigue(eyeMetrics, ocrText, now)
      if (fatigue) { this.fireTrigger(fatigue); return }

      const wandering = this.checkWandering(eyeMetrics, now)
      if (wandering) { this.fireTrigger(wandering); return }
    } else {
      // No eye tracking — just check session-based fatigue
      const sessionFatigue = this.checkSessionFatigue(ocrText, now)
      if (sessionFatigue) { this.fireTrigger(sessionFatigue); return }
    }
  }

  private checkDistraction(
    activeWindow: ActiveWindowInfo | null,
    now: number
  ): TriggerEvent | null {
    if (!activeWindow) return null
    if (this.isOnCooldown('distraction', now)) return null

    if (isDistractingWindow(activeWindow)) {
      // On a distracting window — start or continue the grace timer
      this.nonDistractingStartTime = null
      if (!this.distractionStartTime) {
        this.distractionStartTime = now
        console.log('[TRIGGER] distraction grace period started')
      }
      const elapsed = now - this.distractionStartTime
      console.log('[TRIGGER] distraction grace elapsed:', Math.round(elapsed / 1000), 's /', Math.round(CONFIG.DISTRACTION_GRACE_PERIOD / 1000), 's')
      if (elapsed >= CONFIG.DISTRACTION_GRACE_PERIOD) {
        this.distractionNudgeCount++
        // Reset grace timer so it re-fires after another grace period
        this.distractionStartTime = now
        console.log('[TRIGGER] distraction nudge #', this.distractionNudgeCount)
        return {
          type: 'distraction',
          confidence: Math.min(0.9 + this.distractionNudgeCount * 0.02, 1),
          context: `Student switched to: ${activeWindow.owner} — "${activeWindow.title}"${
            activeWindow.url ? ` (${activeWindow.url})` : ''
          }. This is nudge #${this.distractionNudgeCount} — student has been distracted for ~${Math.round(this.distractionNudgeCount * CONFIG.DISTRACTION_GRACE_PERIOD / 1000)}s total.`,
          timestamp: now,
        }
      }
    } else if (this.distractionStartTime) {
      // Was on a distracting window, now on something else.
      // Only reset after 3s of sustained non-distracting focus
      // (handles brief bounces to Lumi/Electron/taskbar)
      if (!this.nonDistractingStartTime) {
        this.nonDistractingStartTime = now
      }
      if (now - this.nonDistractingStartTime > 3000) {
        console.log('[TRIGGER] distraction timer reset — student returned to non-distracting window')
        this.distractionStartTime = null
        this.nonDistractingStartTime = null
        this.distractionNudgeCount = 0
      }
    }

    return null
  }

  private checkStuck(
    metrics: EyeMetrics,
    ocrText: string,
    now: number
  ): TriggerEvent | null {
    if (this.isOnCooldown('stuck', now)) return null

    if (
      metrics.stationaryDuration > CONFIG.STUCK_THRESHOLD_SECS &&
      metrics.gazeVelocity < CONFIG.GAZE_VELOCITY_STUCK
    ) {
      return {
        type: 'stuck',
        confidence: Math.min(metrics.stationaryDuration / 60, 1),
        context: ocrText.substring(0, 500),
        timestamp: now,
      }
    }

    return null
  }

  private checkFatigue(
    metrics: EyeMetrics,
    ocrText: string,
    now: number
  ): TriggerEvent | null {
    if (this.isOnCooldown('fatigue', now)) return null

    const timeSinceBreak = this.lastBreakTime ? now - this.lastBreakTime : 0
    const isBlinkFatigued = metrics.blinkRate > CONFIG.FATIGUE_BLINK_THRESHOLD
    const isSessionLong = timeSinceBreak > CONFIG.FATIGUE_SESSION_THRESHOLD

    if (isBlinkFatigued || isSessionLong) {
      const sessionMinutes = Math.round(timeSinceBreak / 60_000)
      return {
        type: 'fatigue',
        confidence: isBlinkFatigued && isSessionLong ? 1 : 0.7,
        context: `Session: ${sessionMinutes} min. Blink rate: ${metrics.blinkRate}/min. Topic: ${ocrText.substring(0, 200)}`,
        timestamp: now,
      }
    }

    return null
  }

  private checkSessionFatigue(ocrText: string, now: number): TriggerEvent | null {
    if (this.isOnCooldown('fatigue', now)) return null
    const timeSinceBreak = this.lastBreakTime ? now - this.lastBreakTime : 0
    if (timeSinceBreak > CONFIG.FATIGUE_SESSION_THRESHOLD) {
      return {
        type: 'fatigue',
        confidence: 0.8,
        context: `Session: ${Math.round(timeSinceBreak / 60_000)} min. Topic: ${ocrText.substring(0, 200)}`,
        timestamp: now,
      }
    }
    return null
  }

  private checkWandering(
    metrics: EyeMetrics,
    now: number
  ): TriggerEvent | null {
    if (this.isOnCooldown('wandering', now)) return null

    if (!metrics.isOnScreen) {
      if (!this.offScreenStartTime) {
        this.offScreenStartTime = now
      }
      if (now - this.offScreenStartTime > CONFIG.WANDERING_THRESHOLD) {
        this.offScreenStartTime = null
        return {
          type: 'wandering',
          confidence: 0.6,
          context: 'Student has been looking away from screen.',
          timestamp: now,
        }
      }
    } else {
      this.offScreenStartTime = null
    }

    return null
  }

  private isOnCooldown(triggerType: string, now: number): boolean {
    const lastFired = this.triggerCooldowns.get(triggerType)
    if (!lastFired) return false

    const cooldowns: Record<string, number> = {
      distraction: CONFIG.DISTRACTION_COOLDOWN,
      stuck: CONFIG.STUCK_COOLDOWN,
      fatigue: CONFIG.FATIGUE_COOLDOWN,
      wandering: CONFIG.WANDERING_COOLDOWN,
    }

    return now - lastFired < (cooldowns[triggerType] ?? CONFIG.MIN_INTERVENTION_GAP)
  }

  private fireTrigger(event: TriggerEvent) {
    this.lastInterventionTime = event.timestamp
    if (event.type) {
      this.triggerCooldowns.set(event.type, event.timestamp)
    }
    if (event.type !== 'session_start') {
      this.state = 'intervening'
    }
    this.onTrigger?.(event)
  }
}
