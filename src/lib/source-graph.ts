// Pure deterministic SSR layout for the work-to-work (dictionary / source) quotation graph.
// Mirrors `stemma.ts` (left-to-right, oldest cited work -> newest citing work):
// breaks mutual-citation cycles by year/id, assigns longest-path column ranks, runs two
// barycentre crossing-reduction sweeps, and computes exact pixel geometry + Bezier midpoint
// coordinates for clickable quotation-count badges.

export const SOURCE_GRAPH_NODES_LIMIT = 60
export const SOURCE_GRAPH_EDGES_LIMIT = 80
export const SOURCE_GRAPH_HOPS_LIMIT = 2

export type SourceGraphNode = {
  id: number
  title: string | null
  author: string | null
  publisher: string | null
  report_date: string | null
  url: string | null
  container: string | null
  source_kind: string | null
  year: number | null
  records: number
}

export type SourceGraphEdge = {
  /** Older / quoted work (`cited_source_id`). */
  from: number
  /** Later / citing work (`citing_source_id`). */
  to: number
  records: number
  quotes: number
  edition: number
  derived: number
}

export type SourceGraphData = {
  focusId: number | null
  nodes: SourceGraphNode[]
  edges: SourceGraphEdge[]
  truncated: boolean
}

export type SourceGraphUnit = {
  id: number
  node: SourceGraphNode
  col: number
  row: number
  x: number
  y: number
  width: number
  height: number
}

export type SourceGraphRoute = {
  key: string
  from: number
  to: number
  records: number
  quotes: number
  edition: number
  derived: number
  derivedOnly: boolean
  backEdge: boolean
  strokeWidth: number
  path: string
  labelX: number
  labelY: number
}

export type SourceGraphLayout = {
  width: number
  height: number
  cols: number
  rows: number
  units: SourceGraphUnit[]
  edges: SourceGraphRoute[]
  ancestors: Record<number, number[]>
  descendants: Record<number, number[]>
}

type Metrics = {
  tileW: number
  tileH: number
  colGap: number
  rowGap: number
  padX: number
  padY: number
}

const METRICS: Record<'strip' | 'full', Metrics> = {
  strip: { tileW: 152, tileH: 76, colGap: 64, rowGap: 16, padX: 12, padY: 16 },
  full: { tileW: 184, tileH: 92, colGap: 84, rowGap: 24, padX: 18, padY: 22 },
}

function compareNodes(a: SourceGraphNode, b: SourceGraphNode, focusId: number | null): number {
  const ya = a.year ?? Number.POSITIVE_INFINITY
  const yb = b.year ?? Number.POSITIVE_INFINITY
  if (ya !== yb) return ya - yb
  if (focusId !== null) {
    if (a.id === focusId && b.id !== focusId) return -1
    if (b.id === focusId && a.id !== focusId) return 1
  }
  if (a.records !== b.records) return b.records - a.records
  return a.id - b.id
}

function strokeWidthFor(records: number, maxRecords: number): number {
  if (maxRecords <= 1 || records <= 1) return 1.6
  const ratio = Math.log1p(records) / Math.log1p(maxRecords)
  return Number((1.6 + ratio * 2.0).toFixed(2))
}

function cubicMidpoint(x0: number, y0: number, cx1: number, cy1: number, cx2: number, cy2: number, x3: number, y3: number) {
  return {
    x: Math.round(0.125 * x0 + 0.375 * cx1 + 0.375 * cx2 + 0.125 * x3),
    y: Math.round(0.125 * y0 + 0.375 * cy1 + 0.375 * cy2 + 0.125 * y3),
  }
}

/**
 * Computes deterministic left-to-right layered coordinates for a work-to-work quotation graph.
 */
export function layoutSourceGraph(graph: SourceGraphData, mode: 'strip' | 'full' = 'full'): SourceGraphLayout {
  const m = METRICS[mode]
  const nodeList = [...graph.nodes].sort((a, b) => compareNodes(a, b, graph.focusId))
  const nodeById = new Map(nodeList.map(node => [node.id, node]))
  const order = (a: number, b: number) => compareNodes(nodeById.get(a)!, nodeById.get(b)!, graph.focusId)

  const seenEdges = new Set<string>()
  const validEdges: SourceGraphEdge[] = []
  for (const edge of graph.edges) {
    if (edge.from === edge.to || !nodeById.has(edge.from) || !nodeById.has(edge.to)) continue
    const key = `${edge.from}->${edge.to}`
    if (seenEdges.has(key)) continue
    seenEdges.add(key)
    validEdges.push(edge)
  }

  // 1. Break residual mutual-citation cycles deterministically in chronological order.
  const outMap = new Map<number, SourceGraphEdge[]>()
  for (const edge of validEdges) outMap.set(edge.from, [...(outMap.get(edge.from) ?? []), edge])
  for (const list of outMap.values()) list.sort((a, b) => b.records - a.records || order(a.to, b.to))

  const state = new Map<number, 0 | 1 | 2>()
  const backEdgeKeys = new Set<string>()
  const dfs = (u: number) => {
    state.set(u, 1)
    for (const edge of outMap.get(u) ?? []) {
      const s = state.get(edge.to) ?? 0
      const key = `${edge.from}->${edge.to}`
      if (s === 1) backEdgeKeys.add(key)
      else if (s === 0) dfs(edge.to)
    }
    state.set(u, 2)
  }
  for (const node of nodeList) {
    if ((state.get(node.id) ?? 0) === 0) dfs(node.id)
  }

  // 2. Longest-path rank on the acyclic forward edges.
  const dagOut = new Map<number, number[]>()
  const dagIn = new Map<number, number[]>()
  const indeg = new Map<number, number>(nodeList.map(node => [node.id, 0]))
  for (const edge of validEdges) {
    const key = `${edge.from}->${edge.to}`
    if (backEdgeKeys.has(key)) continue
    dagOut.set(edge.from, [...(dagOut.get(edge.from) ?? []), edge.to])
    dagIn.set(edge.to, [...(dagIn.get(edge.to) ?? []), edge.from])
    indeg.set(edge.to, (indeg.get(edge.to) ?? 0) + 1)
  }
  const rank = new Map<number, number>(nodeList.map(node => [node.id, 0]))
  const queue = nodeList.filter(node => (indeg.get(node.id) ?? 0) === 0).map(node => node.id)
  while (queue.length) {
    const u = queue.shift()!
    const r = rank.get(u) ?? 0
    for (const v of dagOut.get(u) ?? []) {
      if (r + 1 > (rank.get(v) ?? 0)) rank.set(v, r + 1)
      const nextDeg = (indeg.get(v) ?? 1) - 1
      indeg.set(v, nextDeg)
      if (nextDeg === 0) queue.push(v)
    }
  }

  // 3. Bucket into columns and run 2 barycentre crossing-reduction sweeps.
  const maxCol = Math.max(0, ...rank.values())
  const columns: number[][] = Array.from({ length: maxCol + 1 }, () => [])
  for (const node of nodeList) columns[rank.get(node.id) ?? 0].push(node.id)
  for (const col of columns) col.sort(order)

  const rowOf = () => {
    const map = new Map<number, number>()
    for (const col of columns) col.forEach((id, index) => map.set(id, index))
    return map
  }
  const barycentre = (neighbors: readonly number[] | undefined, positions: Map<number, number>, fallback: number) => {
    if (!neighbors?.length) return fallback
    return neighbors.reduce((sum, id) => sum + (positions.get(id) ?? fallback), 0) / neighbors.length
  }
  for (let pass = 0; pass < 2; pass++) {
    for (let c = 1; c <= maxCol; c++) {
      const pos = rowOf()
      columns[c].sort((a, b) => {
        const ba = barycentre(dagIn.get(a), pos, pos.get(a) ?? 0)
        const bb = barycentre(dagIn.get(b), pos, pos.get(b) ?? 0)
        return ba !== bb ? ba - bb : order(a, b)
      })
    }
    for (let c = maxCol - 1; c >= 0; c--) {
      const pos = rowOf()
      columns[c].sort((a, b) => {
        const ba = barycentre(dagOut.get(a), pos, pos.get(a) ?? 0)
        const bb = barycentre(dagOut.get(b), pos, pos.get(b) ?? 0)
        return ba !== bb ? ba - bb : order(a, b)
      })
    }
  }

  // 4. Exact pixel coordinates (vertically centered shorter columns for balanced tree aesthetics).
  const maxRows = Math.max(1, ...columns.map(col => col.length))
  const totalInnerH = maxRows * m.tileH + (maxRows - 1) * m.rowGap
  const hasArc = validEdges.some(edge => {
    const c1 = rank.get(edge.from) ?? 0
    const c2 = rank.get(edge.to) ?? 0
    return backEdgeKeys.has(`${edge.from}->${edge.to}`) || c2 - c1 > 1
  })
  const extraArcPad = hasArc ? 36 : 0

  const units: SourceGraphUnit[] = []
  const placedById = new Map<number, SourceGraphUnit>()
  for (let c = 0; c <= maxCol; c++) {
    const colH = columns[c].length * m.tileH + Math.max(0, columns[c].length - 1) * m.rowGap
    const offsetY = Math.round((totalInnerH - colH) / 2)
    columns[c].forEach((id, r) => {
      const unit: SourceGraphUnit = {
        id,
        node: nodeById.get(id)!,
        col: c,
        row: r,
        x: m.padX + c * (m.tileW + m.colGap),
        y: m.padY + offsetY + r * (m.tileH + m.rowGap),
        width: m.tileW,
        height: m.tileH,
      }
      units.push(unit)
      placedById.set(id, unit)
    })
  }

  const width = Math.max(m.padX * 2 + (maxCol + 1) * m.tileW + maxCol * m.colGap, m.tileW + m.padX * 2)
  let height = Math.max(m.padY * 2 + totalInnerH + extraArcPad, m.tileH + m.padY * 2)

  // 5. Cubic Bezier routes with midpoint badge placement.
  const maxRecords = Math.max(1, ...validEdges.map(edge => edge.records))
  // Count skip-column edges arriving at each node so multiple arcs stagger their arrival ports cleanly.
  const skipInList = new Map<number, string[]>()
  const skipOutList = new Map<number, string[]>()
  for (const edge of validEdges) {
    const key = `${edge.from}->${edge.to}`
    if (backEdgeKeys.has(key)) continue
    const from = placedById.get(edge.from)!
    const to = placedById.get(edge.to)!
    if (to.col - from.col > 1) {
      skipInList.set(edge.to, [...(skipInList.get(edge.to) ?? []), key])
      skipOutList.set(edge.from, [...(skipOutList.get(edge.from) ?? []), key])
    }
  }

  // Compute bottom of each column so skip-column arcs route cleanly below any taller intermediate column.
  const colBottom = columns.map((col, c) =>
    col.length ? Math.max(...col.map(id => { const u = placedById.get(id)!; return u.y + u.height })) : m.padY + m.tileH,
  )

  const routes: SourceGraphRoute[] = validEdges.map((edge, idx) => {
    const from = placedById.get(edge.from)!
    const to = placedById.get(edge.to)!
    const key = `${edge.from}->${edge.to}`
    const isBack = backEdgeKeys.has(key)
    const derivedOnly = edge.derived > 0 && edge.quotes === 0 && edge.edition === 0
    const strokeWidth = strokeWidthFor(edge.records, maxRecords)

    if (isBack) {
      const x1 = from.x + from.width / 2
      const y1 = from.y + from.height
      const x2 = to.x + to.width / 2
      const y2 = to.y + to.height
      const dip = height - m.padY + 6 - (idx % 2) * 10
      const mid = cubicMidpoint(x1, y1, x1, dip, x2, dip, x2, y2)
      height = Math.max(height, mid.y + m.padY + 14)
      return { ...edge, key, derivedOnly, backEdge: true, strokeWidth, path: `M ${x1} ${y1} C ${x1} ${dip}, ${x2} ${dip}, ${x2} ${y2}`, labelX: mid.x, labelY: mid.y }
    }

    const span = to.col - from.col
    if (span > 1) {
      const inPeers = skipInList.get(edge.to) ?? [key]
      const outPeers = skipOutList.get(edge.from) ?? [key]
      const inIdx = inPeers.indexOf(key)
      const outIdx = outPeers.indexOf(key)
      const inFrac = inPeers.length > 1 ? 0.18 + (inIdx / (inPeers.length - 1)) * 0.34 : 0.25
      const outFrac = outPeers.length > 1 ? 0.52 + (outIdx / (outPeers.length - 1)) * 0.3 : 0.75
      let clearance = Math.max(from.y + from.height, to.y + to.height)
      for (let c = from.col + 1; c < to.col; c++) clearance = Math.max(clearance, colBottom[c])
      const sx1 = from.x + from.width * outFrac
      const sy1 = from.y + from.height
      const sx2 = to.x + to.width * inFrac
      const sy2 = to.y + to.height
      // Solve 0.25 * avg(sy1, sy2) + 0.75 * laneY = targetY so the curve apex actually clears every intermediate column.
      const targetY = clearance + 20 + inIdx * 22
      const laneY = Math.round((targetY - 0.125 * (sy1 + sy2)) / 0.75)
      const mid = cubicMidpoint(sx1, sy1, sx1, laneY, sx2, laneY, sx2, sy2)
      height = Math.max(height, mid.y + m.padY + 14)
      return { ...edge, key, derivedOnly, backEdge: false, strokeWidth, path: `M ${sx1} ${sy1} C ${sx1} ${laneY}, ${sx2} ${laneY}, ${sx2} ${sy2}`, labelX: mid.x, labelY: mid.y }
    }

    const x1 = from.x + from.width
    const y1 = from.y + from.height / 2
    const x2 = to.x
    const y2 = to.y + to.height / 2
    const dx = Math.max(28, (x2 - x1) * 0.45)
    const mid = cubicMidpoint(x1, y1, x1 + dx, y1, x2 - dx, y2, x2, y2)
    return { ...edge, key, derivedOnly, backEdge: false, strokeWidth, path: `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`, labelX: mid.x, labelY: mid.y }
  })

  // 6. Ancestor & descendant sets for O(1) hover/focus lineage highlighting.
  const preds = new Map<number, number[]>()
  const succs = new Map<number, number[]>()
  for (const edge of validEdges) {
    succs.set(edge.from, [...(succs.get(edge.from) ?? []), edge.to])
    preds.set(edge.to, [...(preds.get(edge.to) ?? []), edge.from])
  }
  const reach = (start: number, adj: Map<number, number[]>) => {
    const visited = new Set<number>()
    const stack = [...(adj.get(start) ?? [])]
    while (stack.length) {
      const cur = stack.pop()!
      if (visited.has(cur) || cur === start) continue
      visited.add(cur)
      for (const next of adj.get(cur) ?? []) if (!visited.has(next)) stack.push(next)
    }
    return [...visited]
  }
  const ancestors: Record<number, number[]> = {}
  const descendants: Record<number, number[]> = {}
  for (const unit of units) {
    ancestors[unit.id] = reach(unit.id, preds)
    descendants[unit.id] = reach(unit.id, succs)
  }

  return { width, height, cols: maxCol + 1, rows: maxRows, units, edges: routes, ancestors, descendants }
}
