import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

// ── Types ────────────────────────────────────────────────────────────────────

interface OntologyNode {
  id: string
  label: string
  summary?: string
  predicate?: string
  children?: OntologyNode[]
}

interface SourceOntology {
  name: string
  tree: OntologyNode
}

interface GraphData {
  sources: SourceOntology[]
  tree: OntologyNode | null
}

// ── Ontology Tree (left panel) ───────────────────────────────────────────────

function TreeNode({
  node,
  depth,
  isLast,
  parentLines,
  selectedId,
  onSelect,
}: {
  node: OntologyNode
  depth: number
  isLast: boolean
  parentLines: boolean[]
  selectedId: string | null
  onSelect: (node: OntologyNode) => void
}) {
  const [expanded, setExpanded] = useState(depth < 2)
  const hasChildren = node.children && node.children.length > 0
  const isRoot = depth === 0
  const isSelected = selectedId === node.id

  return (
    <div className={isRoot ? '' : 'relative'}>
      {!isRoot && (
        <div className="absolute left-0 top-0 bottom-0 pointer-events-none" style={{ width: depth * 24 }}>
          {parentLines.map((show, i) => show && (
            <div key={i} className="absolute top-0 bottom-0 border-l border-white/[0.08]" style={{ left: i * 24 + 11 }} />
          ))}
          <div className="absolute border-t border-white/[0.08]" style={{ left: (depth - 1) * 24 + 11, top: 16, width: 13 }} />
          <div className="absolute border-l border-white/[0.08]" style={{ left: (depth - 1) * 24 + 11, top: 0, height: isLast ? 16 : '100%' }} />
        </div>
      )}

      <div
        className={`flex items-start gap-1.5 rounded-lg transition-colors cursor-pointer ${isSelected ? 'bg-purple-500/10' : 'hover:bg-white/[0.03]'}`}
        style={{ paddingLeft: depth * 24 }}
        onClick={(e) => { e.stopPropagation(); onSelect(node); if (hasChildren) setExpanded(!expanded) }}
      >
        {hasChildren ? (
          <div className="mt-1.5 w-5 h-5 rounded flex items-center justify-center shrink-0 text-white/30">
            <motion.svg width="10" height="10" viewBox="0 0 10 10" fill="none" animate={{ rotate: expanded ? 90 : 0 }} transition={{ duration: 0.15 }}>
              <path d="M3 1l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </motion.svg>
          </div>
        ) : (
          <div className="mt-1.5 w-5 h-5 flex items-center justify-center shrink-0">
            <div className={`w-1.5 h-1.5 rounded-full ${depth === 0 ? 'bg-amber-400/70' : depth === 1 ? 'bg-purple-400/60' : 'bg-white/25'}`} />
          </div>
        )}
        <div className="flex-1 min-w-0 py-1">
          {node.predicate && <span className="text-[10px] text-purple-300/40 font-mono mr-1.5 tracking-wide">{node.predicate} &rarr;</span>}
          <span className={`${isRoot ? 'text-[14px] font-semibold text-amber-200/90' : depth === 1 ? 'text-[13px] font-medium text-white/80' : 'text-[12px] text-white/60'}`}>{node.label}</span>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {expanded && hasChildren && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2, ease: 'easeInOut' }} className="overflow-hidden">
            {node.children!.map((child, i) => (
              <TreeNode key={child.id} node={child} depth={depth + 1} isLast={i === node.children!.length - 1} parentLines={[...parentLines, !isLast && depth > 0]} selectedId={selectedId} onSelect={onSelect} />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ── Visual Tree Graph (SVG with zoom/pan/drag) ──────────────────────────────

interface LayoutNode {
  id: string
  node: OntologyNode
  x: number
  y: number
  depth: number
  parentId?: string
}

function buildLayout(root: OntologyNode): LayoutNode[] {
  const result: LayoutNode[] = []
  const yStep = 48
  let yCounter = 0

  function getMaxDepth(n: OntologyNode): number {
    if (!n.children || n.children.length === 0) return 0
    return 1 + Math.max(...n.children.map(getMaxDepth))
  }
  const maxDepth = Math.max(getMaxDepth(root), 1)
  const xStep = 200

  function walk(n: OntologyNode, depth: number, parentId?: string) {
    const x = 60 + depth * xStep
    const y = 40 + yCounter * yStep
    yCounter++
    result.push({ id: n.id, node: n, x, y, depth, parentId })
    if (n.children) {
      for (const child of n.children) walk(child, depth + 1, n.id)
    }
  }

  walk(root, 0)
  return result
}

function VisualTree({
  root,
  selectedId,
  onSelect,
}: {
  root: OntologyNode
  selectedId: string | null
  onSelect: (node: OntologyNode) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)

  // Layout
  const initialLayout = useRef(buildLayout(root))
  const [positions, setPositions] = useState<Map<string, { x: number; y: number }>>(() => {
    const m = new Map<string, { x: number; y: number }>()
    for (const l of initialLayout.current) m.set(l.id, { x: l.x, y: l.y })
    return m
  })
  const layout = initialLayout.current

  // Rebuild layout when root changes
  useEffect(() => {
    const newLayout = buildLayout(root)
    initialLayout.current = newLayout
    const m = new Map<string, { x: number; y: number }>()
    for (const l of newLayout) m.set(l.id, { x: l.x, y: l.y })
    setPositions(m)
  }, [root])

  // Pan & zoom state
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const isPanning = useRef(false)
  const panStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 })

  // Drag node state
  const draggingNode = useRef<string | null>(null)
  const dragOffset = useRef({ x: 0, y: 0 })

  // Canvas size
  const maxX = Math.max(...layout.map(l => (positions.get(l.id)?.x ?? l.x) + 200), 600)
  const maxY = Math.max(...layout.map(l => (positions.get(l.id)?.y ?? l.y) + 60), 400)

  const nodeColor = (d: number) => d === 0 ? '#f59e0b' : d === 1 ? '#a78bfa' : d === 2 ? '#818cf8' : '#64748b'

  // Convert screen coords to SVG coords
  const screenToSvg = (clientX: number, clientY: number) => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return { x: 0, y: 0 }
    return {
      x: (clientX - rect.left - pan.x) / zoom,
      y: (clientY - rect.top - pan.y) / zoom,
    }
  }

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? 0.9 : 1.1
    setZoom(z => Math.min(Math.max(z * delta, 0.15), 4))
  }, [])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // Only pan on middle click or left click on background
    if (e.button === 1 || (e.button === 0 && (e.target as HTMLElement).tagName === 'svg')) {
      e.preventDefault()
      isPanning.current = true
      panStart.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y }
    }
  }, [pan])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isPanning.current) {
      setPan({
        x: panStart.current.panX + (e.clientX - panStart.current.x),
        y: panStart.current.panY + (e.clientY - panStart.current.y),
      })
      return
    }
    if (draggingNode.current) {
      const svgPt = screenToSvg(e.clientX, e.clientY)
      setPositions(prev => {
        const next = new Map(prev)
        next.set(draggingNode.current!, { x: svgPt.x - dragOffset.current.x, y: svgPt.y - dragOffset.current.y })
        return next
      })
    }
  }, [zoom, pan])

  const handleMouseUp = useCallback(() => {
    isPanning.current = false
    draggingNode.current = null
  }, [])

  const handleNodeMouseDown = useCallback((e: React.MouseEvent, nodeId: string) => {
    e.stopPropagation()
    e.preventDefault()
    const pos = positions.get(nodeId)
    if (!pos) return
    const svgPt = screenToSvg(e.clientX, e.clientY)
    dragOffset.current = { x: svgPt.x - pos.x, y: svgPt.y - pos.y }
    draggingNode.current = nodeId
  }, [positions, zoom, pan])

  const handleNodeClick = useCallback((e: React.MouseEvent, node: OntologyNode) => {
    // Only select if we weren't dragging
    if (!draggingNode.current) {
      e.stopPropagation()
      onSelect(node)
    }
  }, [onSelect])

  return (
    <div
      ref={containerRef}
      className="w-full h-full overflow-hidden cursor-grab active:cursor-grabbing relative"
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* Zoom indicator */}
      <div className="absolute top-2 right-3 z-10 flex items-center gap-1.5">
        <button onClick={() => setZoom(z => Math.min(z * 1.25, 4))} className="cursor-pointer w-6 h-6 rounded bg-white/[0.06] border border-white/[0.08] text-white/40 hover:text-white/70 hover:bg-white/[0.1] flex items-center justify-center text-[14px] transition-all">+</button>
        <span className="text-[10px] text-white/20 w-10 text-center">{Math.round(zoom * 100)}%</span>
        <button onClick={() => setZoom(z => Math.max(z * 0.8, 0.15))} className="cursor-pointer w-6 h-6 rounded bg-white/[0.06] border border-white/[0.08] text-white/40 hover:text-white/70 hover:bg-white/[0.1] flex items-center justify-center text-[14px] transition-all">-</button>
        <button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }) }} className="cursor-pointer ml-1 text-[10px] text-white/25 hover:text-white/50 transition-all">Reset</button>
      </div>

      <svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${maxX} ${maxY}`}
        style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: '0 0' }}
        className="select-none"
      >
        {/* Edges */}
        {layout.filter(l => l.parentId).map((l) => {
          const parentPos = positions.get(l.parentId!)
          const childPos = positions.get(l.id)
          if (!parentPos || !childPos) return null
          const midX = (parentPos.x + childPos.x) / 2
          return (
            <g key={`edge-${l.id}`}>
              <path
                d={`M${parentPos.x} ${parentPos.y} C${midX} ${parentPos.y}, ${midX} ${childPos.y}, ${childPos.x} ${childPos.y}`}
                fill="none"
                stroke={selectedId === l.id || selectedId === l.parentId ? 'rgba(168,139,250,0.35)' : 'rgba(168,139,250,0.12)'}
                strokeWidth={selectedId === l.id || selectedId === l.parentId ? 2 : 1.2}
              />
              {l.node.predicate && (
                <text
                  x={(parentPos.x + childPos.x) / 2}
                  y={(parentPos.y + childPos.y) / 2 - 5}
                  textAnchor="middle"
                  fill="rgba(168,139,250,0.25)"
                  fontSize={8}
                  fontFamily="monospace"
                >{l.node.predicate}</text>
              )}
            </g>
          )
        })}

        {/* Nodes */}
        {layout.map((l) => {
          const pos = positions.get(l.id)
          if (!pos) return null
          const isSelected = selectedId === l.id
          const r = l.depth === 0 ? 10 : l.depth === 1 ? 7 : 5
          const color = nodeColor(l.depth)
          return (
            <g
              key={`node-${l.id}`}
              className="cursor-pointer"
              onMouseDown={(e) => handleNodeMouseDown(e, l.id)}
              onClick={(e) => handleNodeClick(e, l.node)}
            >
              {/* Invisible larger hit area */}
              <circle cx={pos.x} cy={pos.y} r={r + 12} fill="transparent" />
              {/* Glow on select */}
              {isSelected && <circle cx={pos.x} cy={pos.y} r={r + 8} fill={color} opacity={0.12} />}
              {/* Node circle */}
              <circle
                cx={pos.x} cy={pos.y} r={r}
                fill={isSelected ? color : '#0a0614'}
                stroke={color}
                strokeWidth={isSelected ? 2.5 : 1.5}
                opacity={isSelected ? 1 : 0.7}
              />
              {/* Label */}
              <text
                x={pos.x + r + 8} y={pos.y + 4}
                fill={isSelected ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.5)'}
                fontSize={l.depth === 0 ? 13 : l.depth === 1 ? 12 : 11}
                fontWeight={l.depth <= 1 ? 600 : 400}
                style={{ pointerEvents: 'none' }}
              >{l.node.label}</text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

// ── Detail Panel ─────────────────────────────────────────────────────────────

function DetailPanel({ node, onClose }: { node: OntologyNode; onClose: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 6 }}
      className="border-t border-white/[0.06] px-5 py-3 shrink-0 bg-white/[0.02]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            {node.predicate && <span className="text-[10px] text-purple-300/40 font-mono">{node.predicate} &rarr;</span>}
            <span className="text-[14px] font-semibold text-white/90">{node.label}</span>
          </div>
          {node.summary && <p className="text-[12px] text-white/45 leading-relaxed">{node.summary}</p>}
          {node.children && node.children.length > 0 && (
            <p className="text-[11px] text-white/25 mt-1">
              {node.children.length} sub-concept{node.children.length !== 1 ? 's' : ''}:{' '}
              {node.children.map(c => c.label).join(', ')}
            </p>
          )}
        </div>
        <button onClick={onClose} className="cursor-pointer w-6 h-6 rounded flex items-center justify-center text-white/25 hover:text-white/50 hover:bg-white/[0.06] transition-all shrink-0">
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M8 2L2 8M2 2l6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
        </button>
      </div>
    </motion.div>
  )
}

// ── Main App ─────────────────────────────────────────────────────────────────

export default function GraphApp() {
  const [data, setData] = useState<GraphData | null>(null)
  const [allSourceNames, setAllSourceNames] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedSource, setSelectedSource] = useState<string | undefined>(undefined)
  const [selectedNode, setSelectedNode] = useState<OntologyNode | null>(null)

  // Load all sources on mount to populate filter pills
  useEffect(() => {
    (async () => {
      try {
        const result = await (window as any).electronAPI.listKnowledgeFiles()
        setAllSourceNames((result?.sources || []).map((s: any) => s.name))
      } catch { /* ignore */ }
    })()
  }, [])

  const loadGraph = useCallback(async (source?: string) => {
    setLoading(true)
    setSelectedNode(null)
    try {
      const result = await (window as any).electronAPI.buildKnowledgeGraph(source)
      setData(result)
    } catch (err) {
      console.error('Failed to build ontology:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadGraph(selectedSource) }, [selectedSource, loadGraph])

  const sources = data?.sources || []
  const unifiedTree = data?.tree || null
  const totalConcepts = unifiedTree ? (function count(n: OntologyNode): number { return 1 + (n.children || []).reduce((s, c) => s + count(c), 0) })(unifiedTree) : 0

  return (
    <div className="h-screen w-screen bg-[#0a0614] text-white flex flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.06] shrink-0">
        <div className="flex items-center gap-3">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M12 3v18M12 3l-6 4v6M12 3l6 4v6M6 7l6 4M18 7l-6 4M6 13l6 4M18 13l-6 4" stroke="rgba(192,170,255,0.6)" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <span className="text-[14px] font-semibold text-white/80">Knowledge Map</span>
          {!loading && sources.length > 0 && (
            <span className="text-[11px] text-white/20">{sources.length} source{sources.length !== 1 ? 's' : ''} &middot; {totalConcepts} concepts</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {allSourceNames.length > 1 && (
            <div className="flex gap-1 mr-2">
              <button onClick={() => setSelectedSource(undefined)} className={`cursor-pointer text-[10px] rounded-full px-2.5 py-0.5 border transition-all ${!selectedSource ? 'bg-purple-500/20 border-purple-400/40 text-purple-200' : 'border-white/10 text-white/30 hover:text-white/50'}`}>All</button>
              {allSourceNames.map(name => (
                <button key={name} onClick={() => setSelectedSource(name)} className={`cursor-pointer text-[10px] rounded-full px-2.5 py-0.5 border transition-all truncate max-w-[120px] ${selectedSource === name ? 'bg-amber-500/20 border-amber-400/40 text-amber-200' : 'border-white/10 text-white/30 hover:text-white/50'}`}>{name.replace('.pdf', '')}</button>
              ))}
            </div>
          )}
          <button onClick={() => loadGraph(selectedSource)} disabled={loading} className="cursor-pointer text-[11px] text-purple-300/60 hover:text-purple-200 bg-purple-500/10 border border-purple-400/20 rounded-lg px-2.5 py-1 transition-all hover:bg-purple-500/20 disabled:opacity-40">{loading ? 'Building...' : 'Rebuild'}</button>
        </div>
      </div>

      {/* Main content */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-4">
            <motion.div animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: 'linear' }} className="w-10 h-10 mx-auto rounded-full border-2 border-purple-400/30 border-t-purple-400" />
            <p className="text-[13px] text-white/40">Analyzing your study material...</p>
          </div>
        </div>
      ) : sources.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-2">
            <p className="text-[13px] text-white/40">No PDFs indexed yet</p>
            <p className="text-[11px] text-white/20">Add PDFs in the main Lumi window</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex min-h-0">
          {/* Left: Ontology list */}
          <div className="w-[38%] min-w-[260px] border-r border-white/[0.06] overflow-y-auto px-3 py-3">
            <p className="text-[10px] text-white/20 uppercase tracking-wider font-medium mb-2 px-1">Ontology</p>
            {unifiedTree && (
              <TreeNode node={unifiedTree} depth={0} isLast={true} parentLines={[]} selectedId={selectedNode?.id || null} onSelect={setSelectedNode} />
            )}
            <div className="mt-4 pt-3 border-t border-white/[0.04] flex flex-wrap gap-x-4 gap-y-1 px-1">
              <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-amber-400/70" /><span className="text-[10px] text-white/20">Source</span></div>
              <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-purple-400/60" /><span className="text-[10px] text-white/20">Topic</span></div>
              <div className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-white/25" /><span className="text-[10px] text-white/20">Concept</span></div>
              <div className="flex items-center gap-1.5"><span className="text-[9px] text-purple-300/30 font-mono">pred &rarr;</span><span className="text-[10px] text-white/20">Relationship</span></div>
            </div>
          </div>

          {/* Right: Visual tree */}
          <div className="flex-1 flex flex-col min-h-0 bg-[#080412]">
            <div className="flex items-center justify-between px-4 pt-2 pb-1 shrink-0">
              <p className="text-[10px] text-white/20 uppercase tracking-wider font-medium">Visual Tree</p>
              <p className="text-[10px] text-white/15">Scroll to zoom · Drag background to pan · Drag nodes to move</p>
            </div>
            <div className="flex-1 min-h-0">
              {unifiedTree && (
                <VisualTree root={unifiedTree} selectedId={selectedNode?.id || null} onSelect={setSelectedNode} />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Detail panel */}
      <AnimatePresence>
        {selectedNode && <DetailPanel key={selectedNode.id} node={selectedNode} onClose={() => setSelectedNode(null)} />}
      </AnimatePresence>
    </div>
  )
}
