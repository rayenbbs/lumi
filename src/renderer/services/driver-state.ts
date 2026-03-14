export interface DriverStateMetrics {
  tired: boolean
  asleep: boolean
  looking_away: boolean
  distracted: boolean
  ear: number
  perclos: number
  gaze: number
  roll: number
  pitch: number
  yaw: number
  blink_rate: number  // blinks per minute (rolling 60s window)
}

export class DriverStateService {
  private ws: WebSocket | null = null
  private onMetricsUpdate: ((metrics: DriverStateMetrics) => void) | null = null
  private _isTracking = false

  async initialize(): Promise<boolean> {
    return this.connectWebSocket()
  }

  private async connectWebSocket(): Promise<boolean> {
    let retries = 0
    const maxRetries = 10

    return new Promise((resolve) => {
      const tryConnect = () => {
        if (retries >= maxRetries) {
          console.error('[DriverState] WebSocket failed after max retries')
          resolve(false)
          return
        }
        retries++
        
        console.log('[DriverState] Connecting to Python backend (Attempt ' + retries + ')...')
        this.ws = new WebSocket('ws://127.0.0.1:8000')

        this.ws.onopen = () => {
          console.log('[DriverState] WebSocket connected to Python backend')
          resolve(true)
        }

        this.ws.onmessage = (event) => {
          if (this.onMetricsUpdate) {
            try {
              const metrics: DriverStateMetrics = JSON.parse(event.data)
              this.onMetricsUpdate(metrics)
            } catch (e) {
              console.error('[DriverState] Failed to parse metrics:', e)
            }
          }
        }

        this.ws.onerror = (error) => {
          console.error('[DriverState] WebSocket error:', error)
          this.ws?.close()
        }

        this.ws.onclose = () => {
          console.log('[DriverState] WebSocket closed')
          if (this.ws?.readyState !== WebSocket.OPEN && retries < maxRetries) {
            setTimeout(tryConnect, 1000)
          }
        }
      }
      tryConnect()
    })
  }

  startTracking() {
    this._isTracking = true
  }

  setMetricsCallback(callback: (metrics: DriverStateMetrics) => void) {
    this.onMetricsUpdate = callback
  }

  destroy() {
    this._isTracking = false
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
  }
}
