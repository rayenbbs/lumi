/**
 * Lumi MCP Server
 * - Indexes course PDFs from ./data/courses/
 * - Exposes HTTP endpoint on port 3001 for the Electron app
 * - Also runs as an MCP server over stdio
 */

import { createServer } from 'http'
import { readFileSync, readdirSync, existsSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = join(__dirname, 'data', 'courses')
const PORT = 3001

// ── PDF INDEXING ─────────────────────────────────────────────────────────────

/** @type {Array<{id: string, text: string, source: string, page: number, keywords: string[]}>} */
let courseIndex = []

async function indexCoursePDFs() {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true })
  }

  const files = readdirSync(DATA_DIR).filter((f) => f.endsWith('.pdf'))
  if (files.length === 0) {
    console.log('[MCP] No PDFs found in data/courses/ — drop PDFs there to enable syllabus grounding')
    return
  }

  courseIndex = []

  for (const file of files) {
    try {
      // Dynamic import to handle ESM
      const pdfParse = (await import('pdf-parse')).default
      const buffer = readFileSync(join(DATA_DIR, file))
      const data = await pdfParse(buffer)

      const text = data.text
      const chunkSize = 600
      const overlap = 120

      for (let i = 0; i < text.length; i += chunkSize - overlap) {
        const chunk = text.substring(i, i + chunkSize)
        if (chunk.trim().length < 50) continue

        // Extract keywords by frequency
        const words = chunk
          .toLowerCase()
          .replace(/[^a-z0-9\s]/g, '')
          .split(/\s+/)
          .filter((w) => w.length > 3)

        const wordFreq = new Map()
        words.forEach((w) => wordFreq.set(w, (wordFreq.get(w) || 0) + 1))

        const keywords = [...wordFreq.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 12)
          .map(([word]) => word)

        courseIndex.push({
          id: `${file}-${i}`,
          text: chunk.trim(),
          source: file,
          page: Math.floor(i / 2000) + 1,
          keywords,
        })
      }

      console.log(`[MCP] Indexed ${file}: ${courseIndex.length} chunks total`)
    } catch (err) {
      console.error(`[MCP] Failed to index ${file}:`, err.message)
    }
  }

  console.log(`[MCP] Total chunks indexed: ${courseIndex.length}`)
}

// ── SEARCH ───────────────────────────────────────────────────────────────────

function searchCourse(query, maxResults = 5) {
  if (!query || courseIndex.length === 0) return []

  const queryWords = query
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 3)

  const scored = courseIndex.map((chunk) => {
    let score = 0

    for (const qw of queryWords) {
      // Keyword match
      if (chunk.keywords.some((kw) => kw.includes(qw) || qw.includes(kw))) {
        score += 3
      }
      // Direct text match
      if (chunk.text.toLowerCase().includes(qw)) {
        score += 2
      }
    }

    // Exact phrase bonus
    if (chunk.text.toLowerCase().includes(query.toLowerCase())) {
      score += 10
    }

    return { chunk, score }
  })

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults)
    .map((s) => ({
      text: s.chunk.text,
      source: s.chunk.source,
      page: s.chunk.page,
      score: s.score,
    }))
}

// ── HTTP SERVER ───────────────────────────────────────────────────────────────

function startHTTPServer() {
  const server = createServer((req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }

    if (req.method === 'POST' && req.url === '/search') {
      let body = ''
      req.on('data', (chunk) => { body += chunk })
      req.on('end', () => {
        try {
          const { query } = JSON.parse(body)
          const results = searchCourse(query, 5)
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ results, total: courseIndex.length }))
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Invalid request', results: [] }))
        }
      })
      return
    }

    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({
        status: 'ok',
        indexedChunks: courseIndex.length,
        pdfsLoaded: [...new Set(courseIndex.map((c) => c.source))].length,
      }))
      return
    }

    if (req.method === 'POST' && req.url === '/reindex') {
      indexCoursePDFs().then(() => {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ indexed: courseIndex.length }))
      })
      return
    }

    res.writeHead(404)
    res.end('Not found')
  })

  server.listen(PORT, '127.0.0.1', () => {
    console.log(`[MCP] HTTP server ready at http://localhost:${PORT}`)
    console.log(`[MCP] Endpoints: POST /search, GET /health, POST /reindex`)
  })

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`[MCP] Port ${PORT} already in use. Kill the existing process or change PORT.`)
    } else {
      console.error('[MCP] Server error:', err)
    }
  })
}

// ── MAIN ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('[MCP] Lumi Course Server starting...')
  await indexCoursePDFs()
  startHTTPServer()

  // Keep process alive
  process.on('SIGINT', () => {
    console.log('\n[MCP] Shutting down...')
    process.exit(0)
  })
}

main().catch((err) => {
  console.error('[MCP] Fatal error:', err)
  process.exit(1)
})
