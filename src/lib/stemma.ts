// Deterministic SSR layout for an evidence provenance stemma (left-to-right, oldest -> newest).
// Pure TypeScript with zero DOM measurement: computes edition bundles, longest-path column ranks
// (breaking any residual cycles by year/id), two-pass barycentre crossing reduction, and exact pixel
// geometry for layered HTML tiles + SVG cubic Bezier edges.
import type { DateReading } from './dates'
import { parseYear } from './cites'
import type { CiteKind } from './scripts'
import type { Sighting } from './server/entries'

export type StemmaNodeKind = 'witness' | 'unseen' | 'removed'

export type StemmaNode = {
  id: string
  kind: StemmaNodeKind
  sightingId: number | null
  entryId: number | null
  sourceId: number | null
  title: string | null
  place: string
  date: string | null
  year: number | null
  thumbKey: string | null
}

export type StemmaEdge = {
  from: string
  to: string
  kind: CiteKind
  quote?: string | null
  note?: string | null
}

export type StemmaGraph = {
  entryId: number
  nodes: StemmaNode[]
  edges: StemmaEdge[]
  unlinkedCount: number
  truncated?: boolean
}

export type StemmaUnit = {
  id: string
  kind: 'single' | 'edition'
  members: StemmaNode[]
  col: number
  row: number
  x: number
  y: number
  width: number
  height: number
}

export type StemmaRoute = {
  key: string
  fromUnit: string
  toUnit: string
  fromNode: string
  toNode: string
  kind: CiteKind
  fromUnseen: boolean
  backEdge: boolean
  path: string
}

export type StemmaLayout = {
  mode: 'strip' | 'full'
  width: number
  height: number
  cols: number
  rows: number
  units: StemmaUnit[]
  edges: StemmaRoute[]
  ancestors: Record<string, string[]>
  descendants: Record<string, string[]>
  nodeToUnit: Record<string, string>
  overflowsStrip: boolean
}

type Metrics = {
  tileW: number
  tileH: number
  memberW: number
  clusterPad: number
  clusterGap: number
  clusterLabelH: number
  colGap: number
  rowGap: number
  padX: number
  padY: number
}

const METRICS: Record<'strip' | 'full', Metrics> = {
  strip: { tileW: 108, tileH: 118, memberW: 92, clusterPad: 8, clusterGap: 8, clusterLabelH: 18, colGap: 48, rowGap: 18, padX: 12, padY: 16 },
  full: { tileW: 140, tileH: 158, memberW: 118, clusterPad: 10, clusterGap: 10, clusterLabelH: 20, colGap: 68, rowGap: 26, padX: 18, padY: 22 },
}

export const witnessNodeId = (sightingId: number) => `s:${sightingId}`
export const unseenNodeId = (sourceId: number | null, fallbackKey: string) => sourceId !== null ? `u:${sourceId}` : `u:name:${fallbackKey}`
export const removedNodeId = (sightingId: number) => `r:${sightingId}`

function yearFor(originalDate: string | null, reportDate: string | null, dates?: ReadonlyMap<string, DateReading | null>): number | null {
  const years = [originalDate, reportDate].map(text => parseYear(text, dates)).filter((value): value is number => value !== null)
  return years.length ? Math.min(...years) : null
}

/**
 * Builds the 1-hop provenance graph around a single entry's already-loaded sightings.
 * Returns null when the record has zero cite edges (keeping plain entries unchanged).
 */
export function buildEntryStemma(
  entryId: number,
  sightings: readonly Sighting[],
  dates?: ReadonlyMap<string, DateReading | null>,
): StemmaGraph | null {
  const nodes = new Map<string, StemmaNode>()
  const edges: StemmaEdge[] = []
  const edgeKeys = new Set<string>()
  const linkedSightings = new Set<number>()

  const putNode = (node: StemmaNode) => {
    const existing = nodes.get(node.id)
    if (!existing) { nodes.set(node.id, node); return }
    // Prefer richer witness metadata if the same node is encountered twice.
    if (!existing.thumbKey && node.thumbKey) existing.thumbKey = node.thumbKey
    if (!existing.title && node.title) existing.title = node.title
    if (!existing.date && node.date) existing.date = node.date
    if (existing.year === null && node.year !== null) existing.year = node.year
  }

  const addEdge = (edge: StemmaEdge) => {
    if (edge.from === edge.to) return
    const key = `${edge.from}\u0000${edge.to}\u0000${edge.kind}`
    if (edgeKeys.has(key)) return
    edgeKeys.add(key)
    edges.push(edge)
  }

  for (const sighting of sightings) {
    if (sighting.hidden_at) continue
    if (!sighting.cites.length && !sighting.cited_by.length) continue
    const selfId = witnessNodeId(sighting.id)
    linkedSightings.add(sighting.id)
    putNode({
      id: selfId,
      kind: 'witness',
      sightingId: sighting.id,
      entryId: sighting.entry_id,
      sourceId: sighting.source_id,
      title: sighting.title,
      place: sighting.place,
      date: sighting.original_date ?? sighting.report_date,
      year: yearFor(sighting.original_date, sighting.report_date, dates),
      thumbKey: sighting.media[0]?.thumb_key ?? null,
    })

    for (const cite of sighting.cites) {
      if (cite.status === 'witness' && cite.target) {
        const targetId = witnessNodeId(cite.target.id)
        if (cite.target.entry_id === entryId) linkedSightings.add(cite.target.id)
        putNode({
          id: targetId,
          kind: 'witness',
          sightingId: cite.target.id,
          entryId: cite.target.entry_id,
          sourceId: cite.source_id,
          title: cite.target.title || cite.title,
          place: cite.target.place,
          date: cite.target.original_date ?? cite.target.report_date,
          year: yearFor(cite.target.original_date, cite.target.report_date, dates),
          thumbKey: cite.target.thumb_key,
        })
        addEdge({ from: targetId, to: selfId, kind: cite.kind, quote: cite.quote, note: cite.note })
      } else if (cite.status === 'unseen') {
        const fallback = `${cite.title ?? ''}|${cite.author ?? ''}|${cite.report_date ?? ''}|${cite.url ?? ''}`
        const targetId = unseenNodeId(cite.source_id, fallback)
        putNode({
          id: targetId,
          kind: 'unseen',
          sightingId: null,
          entryId: null,
          sourceId: cite.source_id,
          title: cite.title || cite.author || cite.url,
          place: '',
          date: cite.report_date,
          year: yearFor(null, cite.report_date, dates),
          thumbKey: null,
        })
        addEdge({ from: targetId, to: selfId, kind: cite.kind, quote: cite.quote, note: cite.note })
      } else if (cite.status === 'removed' && cite.target) {
        const targetId = removedNodeId(cite.target.id)
        putNode({
          id: targetId,
          kind: 'removed',
          sightingId: cite.target.id,
          entryId: cite.target.entry_id,
          sourceId: null,
          title: cite.title || cite.target.title,
          place: cite.target.place,
          date: cite.target.original_date ?? cite.target.report_date,
          year: yearFor(cite.target.original_date, cite.target.report_date, dates),
          thumbKey: null,
        })
        addEdge({ from: targetId, to: selfId, kind: cite.kind, quote: cite.quote, note: cite.note })
      }
    }

    for (const inbound of sighting.cited_by) {
      const fromId = selfId
      const toId = witnessNodeId(inbound.sighting_id)
      if (inbound.entry_id === entryId) linkedSightings.add(inbound.sighting_id)
      putNode({
        id: toId,
        kind: 'witness',
        sightingId: inbound.sighting_id,
        entryId: inbound.entry_id,
        sourceId: null,
        title: inbound.title,
        place: inbound.place,
        date: inbound.original_date ?? inbound.report_date,
        year: yearFor(inbound.original_date, inbound.report_date, dates),
        thumbKey: inbound.thumb_key,
      })
      addEdge({ from: fromId, to: toId, kind: inbound.kind, quote: inbound.quote, note: inbound.note })
    }
  }

  if (!edges.length) return null
  const visibleCount = sightings.filter(s => !s.hidden_at).length
  const unlinkedCount = Math.max(0, visibleCount - linkedSightings.size)
  return { entryId, nodes: [...nodes.values()], edges, unlinkedCount }
}

function compareNodes(a: StemmaNode, b: StemmaNode, focalEntryId: number): number {
  const ya = a.year ?? Number.POSITIVE_INFINITY
  const yb = b.year ?? Number.POSITIVE_INFINITY
  if (ya !== yb) return ya - yb
  const fa = a.entryId === focalEntryId ? 0 : a.kind === 'unseen' ? -1 : 1
  const fb = b.entryId === focalEntryId ? 0 : b.kind === 'unseen' ? -1 : 1
  if (fa !== fb) return fa - fb
  return a.id.localeCompare(b.id)
}

/**
 * Deterministic layered layout (Sugiyama-lite):
 * 1. Bundles witness-to-witness `edition` components into compound edition frames.
 * 2. Breaks any residual cycles by earliest year/id so longest-path ranking terminates.
 * 3. Assigns longest-path column rank (oldest -> newest, left -> right).
 * 4. Runs two barycentre crossing-reduction sweeps across columns.
 * 5. Computes exact pixel rectangles and smooth cubic Bezier SVG paths (bowing skip-column arcs).
 */
export function layoutStemma(graph: StemmaGraph, mode: 'strip' | 'full' = 'strip'): StemmaLayout {
  const m = METRICS[mode]
  const byId = new Map(graph.nodes.map(node => [node.id, node]))

  // 1. Group witness-to-witness `edition` edges into compound edition clusters (union-find).
  const parent = new Map<string, string>(graph.nodes.map(node => [node.id, node.id]))
  const find = (id: string): string => {
    let cur = id
    while (parent.get(cur) !== cur) cur = parent.get(cur)!
    let walk = id
    while (walk !== cur) {
      const next = parent.get(walk)!
      parent.set(walk, cur)
      walk = next
    }
    return cur
  }
  const union = (a: string, b: string) => {
    const ra = find(a), rb = find(b)
    if (ra !== rb) parent.set(rb, ra)
  }

  for (const edge of graph.edges) {
    if (edge.kind !== 'edition') continue
    const a = byId.get(edge.from), b = byId.get(edge.to)
    if (a?.kind === 'witness' && b?.kind === 'witness') union(a.id, b.id)
  }

  const groups = new Map<string, StemmaNode[]>()
  for (const node of graph.nodes) {
    const root = find(node.id)
    groups.set(root, [...(groups.get(root) ?? []), node])
  }

  const nodeToUnit: Record<string, string> = {}
  const unitList: Omit<StemmaUnit, 'col' | 'row' | 'x' | 'y'>[] = []
  for (const members of groups.values()) {
    members.sort((a, b) => compareNodes(a, b, graph.entryId))
    const isEdition = members.length > 1
    const unitId = isEdition ? `ed:${members.map(node => node.id).join('+')}` : members[0].id
    for (const member of members) nodeToUnit[member.id] = unitId
    const width = isEdition
      ? members.length * m.memberW + (members.length - 1) * m.clusterGap + m.clusterPad * 2
      : m.tileW
    const height = isEdition ? m.tileH + m.clusterPad * 2 + m.clusterLabelH : m.tileH
    unitList.push({ id: unitId, kind: isEdition ? 'edition' : 'single', members, width, height })
  }

  const unitById = new Map(unitList.map(unit => [unit.id, unit]))
  const unitOrder = (a: string, b: string) => compareNodes(unitById.get(a)!.members[0], unitById.get(b)!.members[0], graph.entryId)
  unitList.sort((a, b) => unitOrder(a.id, b.id))

  // Collapse inter-unit edges (intra-bundle `edition` edges are represented by the bundle frame).
  type RawUnitEdge = { key: string; fromUnit: string; toUnit: string; fromNode: string; toNode: string; kind: CiteKind; fromUnseen: boolean }
  const unitEdges: RawUnitEdge[] = []
  const seenUnitEdge = new Set<string>()
  for (const edge of graph.edges) {
    const fromUnit = nodeToUnit[edge.from]
    const toUnit = nodeToUnit[edge.to]
    if (!fromUnit || !toUnit || fromUnit === toUnit) continue
    const key = `${fromUnit}->${toUnit}:${edge.kind}`
    if (seenUnitEdge.has(key)) continue
    seenUnitEdge.add(key)
    unitEdges.push({
      key,
      fromUnit,
      toUnit,
      fromNode: edge.from,
      toNode: edge.to,
      kind: edge.kind,
      fromUnseen: byId.get(edge.from)?.kind === 'unseen',
    })
  }

  // 2. Break any residual cycles with DFS in deterministic order (marking back-edges).
  const outMap = new Map<string, RawUnitEdge[]>()
  for (const edge of unitEdges) outMap.set(edge.fromUnit, [...(outMap.get(edge.fromUnit) ?? []), edge])
  const state = new Map<string, 0 | 1 | 2>()
  const backEdgeKeys = new Set<string>()
  const dfs = (u: string) => {
    state.set(u, 1)
    for (const edge of outMap.get(u) ?? []) {
      const s = state.get(edge.toUnit) ?? 0
      if (s === 1) backEdgeKeys.add(edge.key)
      else if (s === 0) dfs(edge.toUnit)
    }
    state.set(u, 2)
  }
  for (const unit of unitList) {
    if ((state.get(unit.id) ?? 0) === 0) dfs(unit.id)
  }

  // 3. Longest-path rank on the acyclic forward edges.
  const dagOut = new Map<string, string[]>()
  const dagIn = new Map<string, string[]>()
  const indeg = new Map<string, number>(unitList.map(unit => [unit.id, 0]))
  for (const edge of unitEdges) {
    if (backEdgeKeys.has(edge.key)) continue
    dagOut.set(edge.fromUnit, [...(dagOut.get(edge.fromUnit) ?? []), edge.toUnit])
    dagIn.set(edge.toUnit, [...(dagIn.get(edge.toUnit) ?? []), edge.fromUnit])
    indeg.set(edge.toUnit, (indeg.get(edge.toUnit) ?? 0) + 1)
  }
  const rank = new Map<string, number>(unitList.map(unit => [unit.id, 0]))
  const queue = unitList.filter(unit => (indeg.get(unit.id) ?? 0) === 0).map(unit => unit.id)
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

  // 4. Bucket units into columns and run 2 barycentre crossing-reduction sweeps.
  const maxCol = Math.max(0, ...rank.values())
  const columns: string[][] = Array.from({ length: maxCol + 1 }, () => [])
  for (const unit of unitList) columns[rank.get(unit.id) ?? 0].push(unit.id)
  for (const col of columns) col.sort(unitOrder)

  const rowOf = () => {
    const map = new Map<string, number>()
    for (const col of columns) col.forEach((id, index) => map.set(id, index))
    return map
  }
  const barycentre = (id: string, neighbors: readonly string[] | undefined, positions: Map<string, number>, fallback: number) => {
    if (!neighbors?.length) return fallback
    const sum = neighbors.reduce((acc, n) => acc + (positions.get(n) ?? fallback), 0)
    return sum / neighbors.length
  }
  for (let pass = 0; pass < 2; pass++) {
    for (let c = 1; c <= maxCol; c++) {
      const pos = rowOf()
      columns[c].sort((a, b) => {
        const ba = barycentre(a, dagIn.get(a), pos, pos.get(a) ?? 0)
        const bb = barycentre(b, dagIn.get(b), pos, pos.get(b) ?? 0)
        return ba !== bb ? ba - bb : unitOrder(a, b)
      })
    }
    for (let c = maxCol - 1; c >= 0; c--) {
      const pos = rowOf()
      columns[c].sort((a, b) => {
        const ba = barycentre(a, dagOut.get(a), pos, pos.get(a) ?? 0)
        const bb = barycentre(b, dagOut.get(b), pos, pos.get(b) ?? 0)
        return ba !== bb ? ba - bb : unitOrder(a, b)
      })
    }
  }

  // 5. Assign exact pixel coordinates. Each column takes its widest unit; each row band takes its tallest unit.
  const colWidths = columns.map(col => col.length ? Math.max(...col.map(id => unitById.get(id)!.width)) : m.tileW)
  const colX: number[] = []
  let cursorX = m.padX
  for (let c = 0; c <= maxCol; c++) {
    colX.push(cursorX)
    cursorX += colWidths[c] + m.colGap
  }
  const maxRows = Math.max(1, ...columns.map(col => col.length))
  const rowHeights = Array.from({ length: maxRows }, (_, r) => {
    const heights = columns.map(col => col[r] ? unitById.get(col[r])!.height : 0)
    return Math.max(m.tileH, ...heights)
  })
  const rowY: number[] = []
  let cursorY = m.padY
  for (let r = 0; r < maxRows; r++) {
    rowY.push(cursorY)
    cursorY += rowHeights[r] + m.rowGap
  }

  // Reserve a small bottom arc lane if any skip-column or back-edge exists so curves stay inside viewBox.
  const hasArc = unitEdges.some(edge => {
    const c1 = rank.get(edge.fromUnit) ?? 0
    const c2 = rank.get(edge.toUnit) ?? 0
    return backEdgeKeys.has(edge.key) || c2 - c1 > 1
  })
  const extraArcPad = hasArc ? 26 : 0

  const placed: StemmaUnit[] = []
  const placedById = new Map<string, StemmaUnit>()
  for (let c = 0; c <= maxCol; c++) {
    columns[c].forEach((id, r) => {
      const base = unitById.get(id)!
      const unit: StemmaUnit = {
        ...base,
        col: c,
        row: r,
        x: colX[c] + Math.round((colWidths[c] - base.width) / 2),
        y: rowY[r] + Math.round((rowHeights[r] - base.height) / 2),
      }
      placed.push(unit)
      placedById.set(id, unit)
    })
  }

  const width = Math.max(cursorX - m.colGap + m.padX, m.tileW + m.padX * 2)
  const height = Math.max(cursorY - m.rowGap + m.padY + extraArcPad, m.tileH + m.padY * 2)

  // 6. Compute smooth SVG cubic Bezier edge routes.
  const routes: StemmaRoute[] = unitEdges.map((edge, idx) => {
    const from = placedById.get(edge.fromUnit)!
    const to = placedById.get(edge.toUnit)!
    const isBack = backEdgeKeys.has(edge.key)
    if (isBack) {
      const x1 = from.x + from.width / 2
      const y1 = from.y + from.height
      const x2 = to.x + to.width / 2
      const y2 = to.y + to.height
      const dip = Math.max(y1, y2) + 22 + (idx % 3) * 8
      return { ...edge, backEdge: true, path: `M ${x1} ${y1} C ${x1} ${dip}, ${x2} ${dip}, ${x2} ${y2}` }
    }
    const x1 = from.x + from.width
    const y1 = from.y + from.height / 2
    const x2 = to.x
    const y2 = to.y + to.height / 2
    const span = to.col - from.col
    if (span > 1 && from.row === to.row) {
      // Bow below the shared row so skip-column edges never cut straight behind intermediate cards.
      const bottom = Math.max(from.y + from.height, to.y + to.height) + 18 + (idx % 2) * 8
      const sx1 = from.x + from.width * 0.72
      const sy1 = from.y + from.height
      const sx2 = to.x + to.width * 0.28
      const sy2 = to.y + to.height
      return { ...edge, backEdge: false, path: `M ${sx1} ${sy1} C ${sx1} ${bottom}, ${sx2} ${bottom}, ${sx2} ${sy2}` }
    }
    const dx = Math.max(24, (x2 - x1) * 0.45)
    return { ...edge, backEdge: false, path: `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}` }
  })

  // 7. Precompute ancestor & descendant unit sets for O(1) hover/focus lineage highlighting.
  const unitPreds = new Map<string, string[]>()
  const unitSuccs = new Map<string, string[]>()
  for (const edge of unitEdges) {
    unitSuccs.set(edge.fromUnit, [...(unitSuccs.get(edge.fromUnit) ?? []), edge.toUnit])
    unitPreds.set(edge.toUnit, [...(unitPreds.get(edge.toUnit) ?? []), edge.fromUnit])
  }
  const reach = (start: string, adj: Map<string, string[]>) => {
    const visited = new Set<string>()
    const stack = [...(adj.get(start) ?? [])]
    while (stack.length) {
      const cur = stack.pop()!
      if (visited.has(cur) || cur === start) continue
      visited.add(cur)
      for (const next of adj.get(cur) ?? []) if (!visited.has(next)) stack.push(next)
    }
    return [...visited]
  }
  const ancestors: Record<string, string[]> = {}
  const descendants: Record<string, string[]> = {}
  for (const unit of placed) {
    ancestors[unit.id] = reach(unit.id, unitPreds)
    descendants[unit.id] = reach(unit.id, unitSuccs)
  }

  const hasCrossRecord = graph.nodes.some(node => node.kind === 'witness' && node.entryId !== null && node.entryId !== graph.entryId)
  const overflowsStrip = maxRows > 3 || hasCrossRecord || graph.nodes.length > 12

  return {
    mode,
    width,
    height,
    cols: maxCol + 1,
    rows: maxRows,
    units: placed,
    edges: routes,
    ancestors,
    descendants,
    nodeToUnit,
    overflowsStrip,
  }
}
