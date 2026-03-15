/**
 * Lumi MCP Server
 *
 * A proper Model Context Protocol server over stdio.
 * Tools:
 *   - search_syllabus  — keyword search across indexed course PDFs
 *   - chat             — build system prompt + call Gemini, returns Lumi's response
 *   - reindex          — force re-index all PDFs in data/courses/
 *   - get_status       — health check: indexed chunks, loaded PDFs
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import { readFileSync, readdirSync, existsSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = join(__dirname, 'data', 'courses')

const log = (...args) => console.error('[MCP]', ...args)

// ── PDF INDEXING ─────────────────────────────────────────────────────────────

/** @type {Array<{id: string, text: string, source: string, page: number, keywords: string[]}>} */
let courseIndex = []

async function indexCoursePDFs() {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true })
  }

  const files = readdirSync(DATA_DIR).filter((f) => f.endsWith('.pdf'))
  if (files.length === 0) {
    log('No PDFs found in data/courses/ — drop PDFs there to enable syllabus grounding')
    return
  }

  courseIndex = []

  for (const file of files) {
    try {
      const pdfParse = (await import('pdf-parse')).default
      const buffer = readFileSync(join(DATA_DIR, file))
      const data = await pdfParse(buffer)

      const text = data.text
      const chunkSize = 600
      const overlap = 120

      for (let i = 0; i < text.length; i += chunkSize - overlap) {
        const chunk = text.substring(i, i + chunkSize)
        if (chunk.trim().length < 50) continue

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

      log(`Indexed ${file}: ${courseIndex.length} chunks total`)
    } catch (err) {
      log(`Failed to index ${file}:`, err.message)
    }
  }

  log(`Total chunks indexed: ${courseIndex.length}`)
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
      if (chunk.keywords.some((kw) => kw.includes(qw) || qw.includes(kw))) score += 3
      if (chunk.text.toLowerCase().includes(qw)) score += 2
    }
    if (chunk.text.toLowerCase().includes(query.toLowerCase())) score += 10
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

// ── GEMINI LLM ───────────────────────────────────────────────────────────────

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || ''
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemma-3-27b-it:generateContent?key=${GEMINI_API_KEY}`

async function callGemini(triggerType, ocrText, userQuestion, driverState, conversationHistory, syllabusContext) {
  if (!GEMINI_API_KEY) {
    return { success: false, message: 'GEMINI_API_KEY not configured.' }
  }

  const systemPrompt = buildSystemPrompt(triggerType, ocrText, syllabusContext, driverState)

  log('triggerType:', triggerType)
  log('ocrText:', ocrText?.substring(0, 200))

  // Convert history — Gemini uses "model" not "assistant"
  const rawContents = (conversationHistory || []).map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    text: m.content,
  }))

  if (userQuestion) {
    rawContents.push({ role: 'user', text: userQuestion })
  }

  if (rawContents.length === 0 || rawContents[rawContents.length - 1].role !== 'user') {
    rawContents.push({ role: 'user', text: 'What should I know right now?' })
  }

  // Merge consecutive same-role messages (Gemini requires strict alternation)
  const contents = []
  for (const msg of rawContents) {
    const last = contents[contents.length - 1]
    if (last && last.role === msg.role) {
      last.parts[0].text += '\n' + msg.text
    } else {
      contents.push({ role: msg.role, parts: [{ text: msg.text }] })
    }
  }

  // Prepend system prompt into first user turn (Gemma doesn't support system_instruction)
  if (contents.length > 0 && contents[0].role === 'user') {
    contents[0].parts[0].text = systemPrompt + '\n\n' + contents[0].parts[0].text
  } else {
    contents.unshift({ role: 'user', parts: [{ text: systemPrompt }] })
  }

  const geminiPayload = {
    contents,
    generationConfig: {
      temperature: 1,
      maxOutputTokens: 200,
      topP: 0.9,
    },
  }

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 30000)

    const response = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify(geminiPayload),
    })

    clearTimeout(timeout)
    const data = await response.json()

    if (data.error) {
      log('Gemini API error:', data.error.message || JSON.stringify(data.error))
      return { success: false, message: `Gemini error: ${data.error.message || 'Unknown error'}` }
    }

    let text = data.candidates?.[0]?.content?.parts?.[0]?.text
    if (text) {
      text = text
        .replace(/^(Lumi|Response|Trigger|Note|Output|Message|Internal|Analysis)\s*[:：]\s*/i, '')
        .replace(/^\*\*.*?\*\*\s*/m, '')
        .replace(/^#+\s+.*\n/m, '')
        .trim()
    }

    return { success: true, message: text || "I couldn't generate a response." }
  } catch (error) {
    const isTimeout = error?.name === 'AbortError'
    return {
      success: false,
      message: isTimeout
        ? "I'm taking too long to think. Try a simpler question!"
        : "I'm having trouble connecting to Gemini. Check your internet connection.",
    }
  }
}

// ── SYSTEM PROMPT BUILDER ────────────────────────────────────────────────────

function buildSystemPrompt(triggerType, ocrText, syllabusContext, driverState) {
  const base = `You are Lumi, an AI study companion that lives on a student's desktop as a small animated character. You were built to help neurodivergent students (ADHD, Autism, Dyslexia) stay focused while studying.

HOW YOU WORK:
- You monitor the student's screen in real-time: what app/window they have open, what's on screen (via OCR), and their eye gaze patterns.
- Based on this data, you detect specific situations (called "triggers") and respond accordingly.
- You speak through small chat bubbles overlaid on their screen. You are NOT a full chatbot — you are a gentle, ambient companion.

THE CURRENT TRIGGER TYPE IS: "${triggerType}"
This is the MOST IMPORTANT piece of context. Your entire response must be shaped by this trigger type. Follow the trigger-specific instructions below EXACTLY.

OUTPUT FORMAT:
- Your response is displayed DIRECTLY to the student in a chat bubble. Output ONLY the message the student will see.
- Do NOT include any internal reasoning, thoughts, analysis, labels, or metadata.
- Do NOT prefix your response with things like "Trigger:", "Response:", "Lumi:", "Note:", etc.
- Do NOT narrate what you're doing (e.g. "I'll now encourage the student..."). Just speak TO the student.
- No markdown, no bullet points, no headers. Just plain conversational text.

RESPONSE RULES:
- 1-3 sentences MAXIMUM. You speak in chat bubbles — brevity is essential.
- Warm, casual, friendly tone. You're a supportive friend, not a teacher or authority figure.
- Never condescending, never scolding, never guilt-tripping.
- 1 emoji max per message.
- NEVER make up information. Only reference material if provided below.
- NEVER ignore the trigger type. If the trigger says "distraction", your response MUST be about redirecting the student back to studying.

LATEST DRIVER-STATE SNAPSHOT:
${driverState ? JSON.stringify(driverState) : 'No driver-state metrics available'}${syllabusContext ? `\n\nRELEVANT COURSE MATERIAL:\n${syllabusContext}` : ''}`

  const triggerContexts = {
    distraction: `TRIGGER: DISTRACTION DETECTED
============================
The student has LEFT their study material and opened a distracting app/website.
Detected window: ${ocrText}

THIS IS NOT STUDY CONTENT. The student is procrastinating.

ESCALATION: The context above includes which nudge number this is. Vary your tone accordingly:
- Nudge #1: Light and playful. "Ooh, I see Instagram! But your notes miss you — let's go back?"
- Nudge #2: A bit more direct but still friendly. "Hey, still on Instagram? You were on a roll earlier — let's not lose that momentum!"
- Nudge #3+: More urgent, appeal to their goals. "Okay real talk — you've been here a while now. Your future self will thank you for closing this. Let's crush that next section!"
IMPORTANT: Each nudge MUST feel different from the last. Never repeat the same message. Be creative.

YOUR RESPONSE MUST:
1. Acknowledge what they opened
2. Nudge them to close it and go back to studying
3. Match the escalation level above

YOUR RESPONSE MUST NOT:
- Discuss, analyze, or engage with the content of the distracting app
- Treat the distracting app as study material
- Talk about any other topic
- Ignore the distraction
- Repeat a previous nudge message`,

    stuck: `TRIGGER: STUDENT APPEARS STUCK
The student has been staring at the same content for 40+ seconds without progress. They may be confused or overwhelmed.

Content on their screen:
${ocrText?.substring(0, 500)}

YOUR RESPONSE MUST:
1. Acknowledge they might be stuck (without being patronizing)
2. Offer to help break down the concept in simpler terms
3. Reference the specific content they're looking at if possible`,

    asleep: `TRIGGER: STUDENT FELL ASLEEP
The student has physically closed their eyes or fallen asleep during study.

YOUR RESPONSE MUST:
1. Be very high energy and loud! Tell them to wake up!
2. Suggest taking a real break or getting a coffee, instead of sleeping at the desk.
3. Keep it brief and impactful.
DO NOT talk about the course material right now.`,

    tired: `TRIGGER: DEEP FATIGUE
The driver-state model has detected high PERCLOS (eye closure duration) meaning the student is deeply fatigued.

YOUR RESPONSE MUST:
1. Express concern for their physical tiredness gently.
2. Tell them they've been doing great, but looking at a screen this tired is counterproductive.
3. Suggest a 5-minute break to close their eyes and stretch.`,

    fatigue: `TRIGGER: FATIGUE DETECTED
The student is showing signs of moderate tiredness (high blink rate or long study session without breaks).

Study context: ${ocrText?.substring(0, 200)}
YOUR RESPONSE MUST:
1. Suggest taking a short break
2. Celebrate how long they've been studying
3. Be encouraging about their progress`,

    wandering: `TRIGGER: ATTENTION WANDERING
The student's gaze has been off-screen for a sustained period. They may be daydreaming or distracted by something in their environment.

Last content on screen: ${ocrText?.substring(0, 200)}

YOUR RESPONSE MUST:
1. Gently bring their attention back to the screen
2. Be light and playful, not demanding`,

    question: `TRIGGER: STUDENT QUESTION
The student is asking you a direct question. Answer helpfully using ONLY the provided course context. If the context doesn't contain the answer, say so honestly.

Screen content: ${ocrText}`,

    session_start: `TRIGGER: SESSION START
The student just started a new study session. Welcome them warmly in 1-2 sentences.

What they opened: ${ocrText?.substring(0, 100)}`,

    session_end: `TRIGGER: SESSION END
The study session is ending. Briefly summarize their effort, praise them, and suggest when to review next. 2-3 sentences max.

Session info: ${ocrText?.substring(0, 300)}`,

    proactive_bridge: `TRIGGER: PREREQUISITE KNOWLEDGE GAP
The current material may require background knowledge the student might not have. Proactively offer a quick refresher.

Current topic: ${ocrText?.substring(0, 300)}`,
  }

  const ctx = triggerContexts[triggerType] || triggerContexts.question
  return `${base}\n\n${ctx}`
}

// ── MCP SERVER ───────────────────────────────────────────────────────────────

const TOOL_DEFINITIONS = [
  {
    name: 'search_syllabus',
    description: 'Search indexed course PDFs for content relevant to a query. Returns up to 5 matching text chunks with source file and page number.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The search query' },
        maxResults: { type: 'number', description: 'Max results to return (default 5)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'chat',
    description: 'Send a message through Lumi\'s LLM pipeline. Builds a context-aware system prompt based on the trigger type, optionally searches syllabus for grounding, calls Gemini, and returns the response.',
    inputSchema: {
      type: 'object',
      properties: {
        triggerType: { type: 'string', description: 'The trigger type (distraction, stuck, fatigue, wandering, question, session_start, session_end, proactive_bridge, asleep, tired)' },
        ocrText: { type: 'string', description: 'OCR text from the student\'s screen' },
        userQuestion: { type: 'string', description: 'Direct question from the student (optional)' },
        driverState: { type: 'object', description: 'Driver state metrics (optional)' },
        conversationHistory: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              role: { type: 'string' },
              content: { type: 'string' },
            },
          },
          description: 'Conversation history',
        },
        syllabusContext: { type: 'string', description: 'Pre-fetched syllabus context (optional — if omitted, auto-searches for stuck/question triggers)' },
      },
      required: ['triggerType', 'ocrText', 'conversationHistory'],
    },
  },
  {
    name: 'reindex',
    description: 'Force re-index all PDFs in the data/courses/ directory.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'get_status',
    description: 'Get server health status: number of indexed chunks, loaded PDFs, and whether Gemini API key is configured.',
    inputSchema: { type: 'object', properties: {} },
  },
]

async function handleToolCall(name, args) {
  switch (name) {
    case 'search_syllabus': {
      const results = searchCourse(args.query, args.maxResults || 5)
      return {
        content: [{ type: 'text', text: JSON.stringify({ results, total: courseIndex.length }) }],
      }
    }

    case 'chat': {
      let syllabusContext = args.syllabusContext || ''

      // Auto-search syllabus for relevant triggers if no context provided
      if (!syllabusContext && ['stuck', 'question'].includes(args.triggerType)) {
        const searchQuery = (args.userQuestion || args.ocrText || '').substring(0, 100)
        const results = searchCourse(searchQuery, 3)
        if (results.length > 0) {
          syllabusContext = results.map((r) => r.text).join('\n\n')
        }
      }

      const result = await callGemini(
        args.triggerType,
        args.ocrText,
        args.userQuestion,
        args.driverState,
        args.conversationHistory,
        syllabusContext
      )

      return {
        content: [{ type: 'text', text: JSON.stringify(result) }],
      }
    }

    case 'reindex': {
      await indexCoursePDFs()
      return {
        content: [{ type: 'text', text: JSON.stringify({ indexed: courseIndex.length }) }],
      }
    }

    case 'get_status': {
      const sources = [...new Set(courseIndex.map((c) => c.source))]
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            status: 'ok',
            indexedChunks: courseIndex.length,
            pdfsLoaded: sources.length,
            pdfFiles: sources,
            geminiConfigured: !!GEMINI_API_KEY,
          }),
        }],
      }
    }

    default:
      return {
        content: [{ type: 'text', text: JSON.stringify({ error: `Unknown tool: ${name}` }) }],
        isError: true,
      }
  }
}

// ── MAIN ─────────────────────────────────────────────────────────────────────

async function main() {
  log('Lumi MCP Server starting...')

  const server = new Server(
    { name: 'lumi-mcp', version: '1.0.0' },
    { capabilities: { tools: {} } }
  )

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOL_DEFINITIONS,
  }))

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params
    log(`Tool call: ${name}`)
    try {
      return await handleToolCall(name, args || {})
    } catch (err) {
      log(`Tool ${name} failed:`, err.message)
      return {
        content: [{ type: 'text', text: JSON.stringify({ error: err.message }) }],
        isError: true,
      }
    }
  })

  // Connect transport FIRST so we can receive the initialize handshake,
  // then index PDFs in the background (avoids race condition with client).
  const transport = new StdioServerTransport()
  await server.connect(transport)
  log('MCP server connected via stdio')

  // Index PDFs after transport is ready
  await indexCoursePDFs()
}

main().catch((err) => {
  console.error('[MCP] Fatal error:', err)
  process.exit(1)
})
