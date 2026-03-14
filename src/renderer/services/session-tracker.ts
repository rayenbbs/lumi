export interface SessionStats {
  startTime: number
  endTime: number | null
  distractionCount: number
  stuckCount: number
  fatigueCount: number
  topicsDiscussed: string[]
  breaksTaken: number
  totalFocusTime: number  // ms actively studying
}

export class SessionTracker {
  private stats: SessionStats = this.initialStats()

  private initialStats(): SessionStats {
    return {
      startTime: Date.now(),
      endTime: null,
      distractionCount: 0,
      stuckCount: 0,
      fatigueCount: 0,
      topicsDiscussed: [],
      breaksTaken: 0,
      totalFocusTime: 0,
    }
  }

  start() {
    this.stats = this.initialStats()
  }

  recordTrigger(type: string) {
    switch (type) {
      case 'distraction':
        this.stats.distractionCount++
        break
      case 'stuck':
        this.stats.stuckCount++
        break
      case 'fatigue':
        this.stats.fatigueCount++
        break
    }
  }

  recordTopic(topic: string) {
    if (topic && !this.stats.topicsDiscussed.includes(topic)) {
      this.stats.topicsDiscussed.push(topic)
    }
  }

  recordBreak() {
    this.stats.breaksTaken++
  }

  end() {
    this.stats.endTime = Date.now()
    this.stats.totalFocusTime = this.stats.endTime - this.stats.startTime
  }

  getStats(): SessionStats {
    return { ...this.stats }
  }

  getDurationMinutes(): number {
    const end = this.stats.endTime || Date.now()
    return Math.round((end - this.stats.startTime) / 60_000)
  }

  getFocusScore(): number {
    // Simple heuristic: penalize distractions, reward long sessions
    const duration = this.getDurationMinutes()
    if (duration === 0) return 0
    const distractionPenalty = this.stats.distractionCount * 5
    const score = Math.max(0, Math.min(100, 70 + duration / 2 - distractionPenalty))
    return Math.round(score)
  }

  buildSummaryContext(): string {
    const duration = this.getDurationMinutes()
    const topics = this.stats.topicsDiscussed.slice(0, 5).join(', ') || 'various topics'
    return `Studied for ${duration} minutes. Topics: ${topics}. Distractions: ${this.stats.distractionCount}. Breaks: ${this.stats.breaksTaken}.`
  }
}
