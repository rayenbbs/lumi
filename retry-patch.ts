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
        
        console.log(\[DriverState] Connecting to Python backend (Attempt \)...\)
        this.ws = new WebSocket('ws://127.0.0.1:8000/ws')

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
