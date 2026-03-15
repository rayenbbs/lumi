/**
 * Minimal MCP client that communicates with the Lumi MCP server over stdio.
 * Uses newline-delimited JSON-RPC 2.0 (the MCP stdio transport format).
 */

import { spawn, ChildProcess } from 'child_process'
import path from 'path'

interface PendingRequest {
  resolve: (value: any) => void
  reject: (error: Error) => void
}

export class LumiMcpClient {
  private process: ChildProcess | null = null
  private buffer = ''
  private pendingRequests = new Map<number, PendingRequest>()
  private nextId = 1
  private connected = false

  /** Spawn the MCP server and complete the initialization handshake. */
  async connect(): Promise<void> {
    const serverPath = path.join(__dirname, '../../mcp-server/index.js')

    console.log('[MCP Client] Spawning server:', serverPath)

    this.process = spawn('node', [serverPath], {
      env: { ...process.env },
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    // Forward server stderr to our console for debugging
    this.process.stderr?.on('data', (data: Buffer) => {
      const lines = data.toString().trim()
      if (lines) console.log(lines)
    })

    this.process.stdout?.on('data', (data: Buffer) => {
      this.buffer += data.toString('utf8')
      this.drainBuffer()
    })

    this.process.on('error', (err) => {
      console.error('[MCP Client] Server process error:', err.message)
      this.connected = false
    })

    this.process.on('close', (code) => {
      console.log(`[MCP Client] Server exited with code ${code}`)
      this.connected = false
      for (const [, pending] of this.pendingRequests) {
        pending.reject(new Error('MCP server process exited'))
      }
      this.pendingRequests.clear()
    })

    // MCP initialization handshake
    try {
      const result = await this.request('initialize', {
        protocolVersion: '2025-11-25',
        capabilities: {},
        clientInfo: { name: 'lumi-electron', version: '1.0.0' },
      })

      console.log('[MCP Client] Server initialized:', JSON.stringify(result).substring(0, 200))

      // Send initialized notification (no response expected)
      this.notify('notifications/initialized', {})
      this.connected = true
      console.log('[MCP Client] Connected to Lumi MCP server')
    } catch (err: any) {
      console.error('[MCP Client] Initialization failed:', err.message)
      this.disconnect()
      throw err
    }
  }

  /** Parse newline-delimited JSON messages from the buffer. */
  private drainBuffer(): void {
    while (true) {
      const newlineIndex = this.buffer.indexOf('\n')
      if (newlineIndex < 0) break

      const line = this.buffer.substring(0, newlineIndex).replace(/\r$/, '')
      this.buffer = this.buffer.substring(newlineIndex + 1)

      if (!line.trim()) continue

      try {
        const message = JSON.parse(line)
        this.handleMessage(message)
      } catch {
        console.warn('[MCP Client] Failed to parse JSON line:', line.substring(0, 200))
      }
    }
  }

  private handleMessage(message: any): void {
    if (message.id != null && this.pendingRequests.has(message.id)) {
      const pending = this.pendingRequests.get(message.id)!
      this.pendingRequests.delete(message.id)

      if (message.error) {
        pending.reject(new Error(message.error.message || JSON.stringify(message.error)))
      } else {
        pending.resolve(message.result)
      }
    }
    // Server notifications — ignore
  }

  /** Send a newline-delimited JSON-RPC message to the server's stdin. */
  private send(message: object): void {
    if (!this.process?.stdin?.writable) return
    const json = JSON.stringify(message) + '\n'
    this.process.stdin.write(json, 'utf8')
  }

  /** Send a JSON-RPC request and return a promise for the result. */
  private request(method: string, params: any): Promise<any> {
    return new Promise((resolve, reject) => {
      const id = this.nextId++
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id)
        reject(new Error(`MCP request timed out: ${method}`))
      }, 35000)

      this.pendingRequests.set(id, {
        resolve: (value) => { clearTimeout(timer); resolve(value) },
        reject: (err) => { clearTimeout(timer); reject(err) },
      })

      this.send({ jsonrpc: '2.0', id, method, params })
    })
  }

  /** Send a JSON-RPC notification (no response expected). */
  private notify(method: string, params: any): void {
    this.send({ jsonrpc: '2.0', method, params })
  }

  // ── PUBLIC TOOL METHODS ──────────────────────────────────────────────────

  get isConnected(): boolean {
    return this.connected
  }

  /** Call an MCP tool and return the parsed result. */
  async callTool(name: string, args: Record<string, any> = {}): Promise<any> {
    if (!this.connected) {
      throw new Error('MCP client not connected')
    }

    const result = await this.request('tools/call', { name, arguments: args })

    const textContent = result?.content?.find((c: any) => c.type === 'text')
    if (textContent) {
      try {
        return JSON.parse(textContent.text)
      } catch {
        return textContent.text
      }
    }
    return result
  }

  /** Search indexed course PDFs. */
  async searchSyllabus(query: string, maxResults = 5): Promise<any[]> {
    try {
      const result = await this.callTool('search_syllabus', { query, maxResults })
      return result?.results || []
    } catch (err: any) {
      console.warn('[MCP Client] searchSyllabus failed:', err.message)
      return []
    }
  }

  /** Run the full Lumi chat pipeline (system prompt + Qwen local model). */
  async chat(payload: {
    triggerType: string
    ocrText: string
    userQuestion?: string
    driverState?: any
    conversationHistory: Array<{ role: string; content: string }>
    syllabusContext?: string
  }): Promise<{ success: boolean; message: string }> {
    try {
      return await this.callTool('chat', payload)
    } catch (err: any) {
      console.warn('[MCP Client] chat failed:', err.message)
      return { success: false, message: "I'm having trouble thinking right now. Try again in a moment." }
    }
  }

  /** Force re-index PDFs. */
  async reindex(): Promise<{ indexed: number }> {
    try {
      return await this.callTool('reindex')
    } catch (err: any) {
      console.warn('[MCP Client] reindex failed:', err.message)
      return { indexed: 0 }
    }
  }

  /** Get server status. */
  async getStatus(): Promise<any> {
    try {
      return await this.callTool('get_status')
    } catch (err: any) {
      console.warn('[MCP Client] getStatus failed:', err.message)
      return { status: 'error', error: err.message }
    }
  }

  /** Kill the server process. */
  disconnect(): void {
    this.connected = false
    if (this.process) {
      this.process.kill()
      this.process = null
    }
    for (const [, pending] of this.pendingRequests) {
      pending.reject(new Error('MCP client disconnected'))
    }
    this.pendingRequests.clear()
  }
}

// Singleton instance
let client: LumiMcpClient | null = null

export async function getMcpClient(): Promise<LumiMcpClient> {
  if (client?.isConnected) return client
  client = new LumiMcpClient()
  await client.connect()
  return client
}

export function getMcpClientSync(): LumiMcpClient | null {
  return client?.isConnected ? client : null
}

export function shutdownMcpClient(): void {
  if (client) {
    client.disconnect()
    client = null
  }
}
