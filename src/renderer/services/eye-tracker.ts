export interface GazeData {
  x: number
  y: number
  timestamp: number
}

export interface EyeMetrics {
  isOnScreen: boolean
  gazePosition: { x: number; y: number } | null
  blinkRate: number           // blinks per minute (rolling 60s avg)
  gazeVelocity: number        // pixels per second
  stationaryDuration: number  // seconds gaze has been in same ~100px area
}

export class EyeTrackerService {
  private gazeHistory: GazeData[] = []
  private blinkTimestamps: number[] = []
  private lastGazeRegion: { x: number; y: number } | null = null
  private stationaryStart = Date.now()
  private isTracking = false
  private metricsInterval: ReturnType<typeof setInterval> | null = null
  private onMetricsUpdate: ((metrics: EyeMetrics) => void) | null = null

  private readonly HISTORY_WINDOW = 5000
  private readonly BLINK_WINDOW = 60000
  private readonly STATIONARY_THRESHOLD = 100
  private readonly METRICS_INTERVAL = 100

  async initialize(): Promise<boolean> {
    const webgazer = (window as any).webgazer
    if (!webgazer) {
      console.warn('[EyeTracker] webgazer not loaded. Eye tracking disabled.')
      return false
    }

    try {
      webgazer
        .setRegression('ridge')
        .setGazeListener((data: any) => {
          if (!data) {
            this.recordBlink()
            return
          }
          this.recordGaze(data.x, data.y)
        })
        .saveDataAcrossSessions(true)

      await webgazer.begin()

      // Hide WebGazer's default UI elements
      webgazer.showVideoPreview(false)
      webgazer.showPredictionPoints(false)

      this.isTracking = true
      this.startMetricsLoop()
      return true
    } catch (error) {
      console.error('[EyeTracker] Initialization failed:', error)
      return false
    }
  }

  private recordGaze(x: number, y: number) {
    const now = Date.now()
    this.gazeHistory.push({ x, y, timestamp: now })

    // Trim old data
    this.gazeHistory = this.gazeHistory.filter(
      (g) => now - g.timestamp < this.HISTORY_WINDOW
    )

    // Check if gaze has moved to a new region
    if (this.lastGazeRegion) {
      const dx = Math.abs(x - this.lastGazeRegion.x)
      const dy = Math.abs(y - this.lastGazeRegion.y)
      if (dx > this.STATIONARY_THRESHOLD || dy > this.STATIONARY_THRESHOLD) {
        this.lastGazeRegion = { x, y }
        this.stationaryStart = now
      }
    } else {
      this.lastGazeRegion = { x, y }
      this.stationaryStart = now
    }
  }

  private recordBlink() {
    const now = Date.now()
    this.blinkTimestamps.push(now)
    this.blinkTimestamps = this.blinkTimestamps.filter(
      (t) => now - t < this.BLINK_WINDOW
    )
  }

  private startMetricsLoop() {
    this.metricsInterval = setInterval(() => {
      if (!this.onMetricsUpdate) return

      const now = Date.now()
      const recentGaze = this.gazeHistory.filter(
        (g) => now - g.timestamp < 1000
      )

      // Calculate gaze velocity (px/sec over last second)
      let velocity = 0
      if (recentGaze.length >= 2) {
        let totalDist = 0
        for (let i = 1; i < recentGaze.length; i++) {
          const dx = recentGaze[i].x - recentGaze[i - 1].x
          const dy = recentGaze[i].y - recentGaze[i - 1].y
          totalDist += Math.sqrt(dx * dx + dy * dy)
        }
        const timeSpan =
          (recentGaze[recentGaze.length - 1].timestamp - recentGaze[0].timestamp) /
          1000
        velocity = timeSpan > 0 ? totalDist / timeSpan : 0
      }

      this.onMetricsUpdate({
        isOnScreen: recentGaze.length > 0,
        gazePosition:
          recentGaze.length > 0
            ? {
                x: recentGaze[recentGaze.length - 1].x,
                y: recentGaze[recentGaze.length - 1].y,
              }
            : null,
        blinkRate: this.blinkTimestamps.length,
        gazeVelocity: velocity,
        stationaryDuration: (now - this.stationaryStart) / 1000,
      })
    }, this.METRICS_INTERVAL)
  }

  setMetricsCallback(callback: (metrics: EyeMetrics) => void) {
    this.onMetricsUpdate = callback
  }

  clearCalibrationData() {
    const webgazer = (window as any).webgazer
    if (webgazer) {
      webgazer.clearData()
    }
    this.gazeHistory = []
    this.blinkTimestamps = []
    this.lastGazeRegion = null
    this.stationaryStart = Date.now()
  }

  destroy() {
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval)
      this.metricsInterval = null
    }
    if (this.isTracking) {
      const webgazer = (window as any).webgazer
      webgazer?.end()
      this.isTracking = false
    }
  }
}
