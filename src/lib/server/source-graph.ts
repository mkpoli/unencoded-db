// Server reads and write-maintained counters for the work-to-work (dictionary / source) quotation graph.
// Every read and write is strictly bounded and backed by composite indexes on
// `source_citation_edges` and `source_citations` (zero rescanning of unrelated sightings).
import { datingOriginal, type CiteKind } from '$lib/scripts'
import {
  SOURCE_GRAPH_EDGES_LIMIT,
  SOURCE_GRAPH_HOPS_LIMIT,
  SOURCE_GRAPH_NODES_LIMIT,
  type SourceGraphData,
  type SourceGraphEdge,
  type SourceGraphNode,
} from '$lib/source-graph'
import { readDates, type DateBook } from './date-readings'
import { TILE_COLUMNS, toTile, type Tile, type TileRow } from './entries'

export const SOURCE_LINEAGE_LIMIT = 20
export const SOURCE_PAIR_LIMIT = 100
export const SOURCE_FRONTIER_LIMIT = 40
const PER_NODE_HOP_LIMIT = 40

const LIVE = 'e.hidden_at IS NULL AND e.merged_into IS NULL'
const SOURCE_NODE_COLUMNS = 'id, title, author, publisher, report_date, url, container, source_kind, year, records'

const owned = (owner: number | string) => ({
  sql: typeof owner === 'number' ? '?' : owner,
  values: typeof owner === 'number' ? [owner] : [],
})

/**
 * Statements to incrementally refresh `source_citation_edges` and `source_citations` inside the
 * same `db.batch` for `entry` and any entry whose sightings cite `entry`'s sightings.
 * Only the affected entries' edges and the exact touched `(citing, cited)` pairs are read or written.
 */
export function sourceCitationsRefreshStatements(db: D1Database, entry: number | string) {
  const { sql, values } = owned(entry)
  const affected = `WITH affected(id) AS (
    SELECT ${sql}
    UNION
    SELECT s2.entry_id
    FROM sightings t
    JOIN sighting_cites sc INDEXED BY sighting_cites_by_cited ON sc.cited_id = t.id
    JOIN sightings s2 ON s2.id = sc.sighting_id
    WHERE t.entry_id = ${sql}
  )`
  const oldPairs = `${affected}, old_pairs(citing_source_id, cited_source_id) AS (
    SELECT DISTINCT e.citing_source_id, e.cited_source_id
    FROM affected
    CROSS JOIN source_citation_edges e INDEXED BY source_citation_edges_by_entry ON e.entry_id = affected.id
  )`
  const newPairs = `${affected}, new_pairs(citing_source_id, cited_source_id) AS (
    SELECT DISTINCT e.citing_source_id, e.cited_source_id
    FROM affected
    CROSS JOIN source_citation_edges e INDEXED BY source_citation_edges_by_entry ON e.entry_id = affected.id
  )`
  const params = [...values, ...values]

  return [
    // 1. Drop summary rows for all old pairs touching `affected` entries before removing their edges.
    db.prepare(`${oldPairs}
      DELETE FROM source_citations
      WHERE (citing_source_id, cited_source_id) IN (SELECT citing_source_id, cited_source_id FROM old_pairs)`).bind(...params),
    // 2. Restore summary rows for old pairs that still have edges on unaffected entries.
    db.prepare(`${oldPairs}
      INSERT INTO source_citations (citing_source_id, cited_source_id, records, quotes_count, edition_count, derived_count)
      SELECT
        e.citing_source_id,
        e.cited_source_id,
        COUNT(DISTINCT e.entry_id),
        COUNT(DISTINCT CASE WHEN e.kind = 'quotes' THEN e.entry_id END),
        COUNT(DISTINCT CASE WHEN e.kind = 'edition' THEN e.entry_id END),
        COUNT(DISTINCT CASE WHEN e.kind = 'derived' THEN e.entry_id END)
      FROM old_pairs p
      CROSS JOIN source_citation_edges e ON e.citing_source_id = p.citing_source_id AND e.cited_source_id = p.cited_source_id
      WHERE e.entry_id NOT IN (SELECT id FROM affected)
      GROUP BY e.citing_source_id, e.cited_source_id`).bind(...params),
    // 3. Remove stale per-sighting edges for `affected` entries.
    db.prepare(`${affected}
      DELETE FROM source_citation_edges
      WHERE entry_id IN (SELECT id FROM affected)`).bind(...params),
    // 4. Recompute current per-sighting edges for `affected` entries only.
    db.prepare(`${affected}
      INSERT INTO source_citation_edges (citing_source_id, cited_source_id, entry_id, sighting_id, position, kind)
      SELECT
        citing_source_id,
        cited_source_id,
        entry_id,
        sighting_id,
        position,
        kind
      FROM (
        SELECT
          s.source_id AS citing_source_id,
          CASE
            WHEN sc.cited_id IS NOT NULL THEN COALESCE(cs.source_id, sc.source_id)
            ELSE sc.source_id
          END AS cited_source_id,
          s.entry_id AS entry_id,
          sc.sighting_id AS sighting_id,
          sc.position AS position,
          sc.kind AS kind
        FROM affected
        CROSS JOIN entries e ON e.id = affected.id
        CROSS JOIN sightings s ON s.entry_id = e.id
        CROSS JOIN sighting_cites sc ON sc.sighting_id = s.id
        LEFT JOIN sightings cs ON cs.id = sc.cited_id
        LEFT JOIN entries ce ON ce.id = cs.entry_id
        WHERE s.source_id IS NOT NULL
          AND s.hidden_at IS NULL
          AND ${LIVE}
          AND (
            (sc.cited_id IS NULL AND sc.source_id IS NOT NULL)
            OR (sc.cited_id IS NOT NULL AND cs.id IS NOT NULL AND cs.hidden_at IS NULL AND ce.hidden_at IS NULL AND ce.merged_into IS NULL)
          )
      )
      WHERE cited_source_id IS NOT NULL
        AND citing_source_id != cited_source_id`).bind(...params),
    // 5. Upsert summary rows for all pairs now present on `affected` entries.
    db.prepare(`${newPairs}
      INSERT OR REPLACE INTO source_citations (citing_source_id, cited_source_id, records, quotes_count, edition_count, derived_count)
      SELECT
        e.citing_source_id,
        e.cited_source_id,
        COUNT(DISTINCT e.entry_id),
        COUNT(DISTINCT CASE WHEN e.kind = 'quotes' THEN e.entry_id END),
        COUNT(DISTINCT CASE WHEN e.kind = 'edition' THEN e.entry_id END),
        COUNT(DISTINCT CASE WHEN e.kind = 'derived' THEN e.entry_id END)
      FROM new_pairs p
      CROSS JOIN source_citation_edges e ON e.citing_source_id = p.citing_source_id AND e.cited_source_id = p.cited_source_id
      GROUP BY e.citing_source_id, e.cited_source_id`).bind(...params),
  ]
}

export type SourceCitationPeer = SourceGraphNode & {
  shared: number
  quotes: number
  edition: number
  derived: number
}

export type SourceLineage = {
  cites: SourceCitationPeer[]
  citedBy: SourceCitationPeer[]
  hasMoreCites: boolean
  hasMoreCitedBy: boolean
  graph: SourceGraphData | null
}

type PeerRow = SourceGraphNode & {
  shared: number
  quotes_count: number
  edition_count: number
  derived_count: number
}

const toPeer = ({ quotes_count, edition_count, derived_count, ...rest }: PeerRow): SourceCitationPeer => ({
  ...rest,
  quotes: quotes_count,
  edition: edition_count,
  derived: derived_count,
})

/**
 * Bounded 1-hop work-to-work quotation summary for `/source/[id]`: works this source cites
 * and works that cite this source, plus a ready-to-render 1-hop strip graph when non-empty.
 */
export async function sourceLineage(db: D1Database, sourceId: number): Promise<SourceLineage> {
  const [selfRes, citesRes, citedByRes] = await db.batch<unknown>([
    db.prepare(`SELECT ${SOURCE_NODE_COLUMNS} FROM sources WHERE id = ?`).bind(sourceId),
    db.prepare(`SELECT sc.cited_source_id AS id, sc.records AS shared, sc.quotes_count, sc.edition_count, sc.derived_count,
        c.title, c.author, c.publisher, c.report_date, c.url, c.container, c.source_kind, c.year, c.records
      FROM source_citations sc INDEXED BY source_citations_by_citing
      JOIN sources c ON c.id = sc.cited_source_id
      WHERE sc.citing_source_id = ?
      ORDER BY sc.records DESC, sc.cited_source_id
      LIMIT ${SOURCE_LINEAGE_LIMIT + 1}`).bind(sourceId),
    db.prepare(`SELECT sc.citing_source_id AS id, sc.records AS shared, sc.quotes_count, sc.edition_count, sc.derived_count,
        c.title, c.author, c.publisher, c.report_date, c.url, c.container, c.source_kind, c.year, c.records
      FROM source_citations sc INDEXED BY source_citations_by_cited
      JOIN sources c ON c.id = sc.citing_source_id
      WHERE sc.cited_source_id = ?
      ORDER BY sc.records DESC, sc.citing_source_id
      LIMIT ${SOURCE_LINEAGE_LIMIT + 1}`).bind(sourceId),
  ])
  const self = selfRes.results[0] as SourceGraphNode | undefined
  const rawCites = citesRes.results as PeerRow[]
  const rawCitedBy = citedByRes.results as PeerRow[]
  const hasMoreCites = rawCites.length > SOURCE_LINEAGE_LIMIT
  const hasMoreCitedBy = rawCitedBy.length > SOURCE_LINEAGE_LIMIT
  const cites = rawCites.slice(0, SOURCE_LINEAGE_LIMIT).map(toPeer)
  const citedBy = rawCitedBy.slice(0, SOURCE_LINEAGE_LIMIT).map(toPeer)
  if (!self || (!cites.length && !citedBy.length)) return { cites, citedBy, hasMoreCites: false, hasMoreCitedBy: false, graph: null }

  const nodes = new Map<number, SourceGraphNode>([[self.id, self]])
  const edges: SourceGraphEdge[] = []
  for (const peer of cites) {
    nodes.set(peer.id, peer)
    edges.push({ from: peer.id, to: self.id, records: peer.shared, quotes: peer.quotes, edition: peer.edition, derived: peer.derived })
  }
  for (const peer of citedBy) {
    nodes.set(peer.id, peer)
    edges.push({ from: self.id, to: peer.id, records: peer.shared, quotes: peer.quotes, edition: peer.edition, derived: peer.derived })
  }
  return {
    cites,
    citedBy,
    hasMoreCites,
    hasMoreCitedBy,
    graph: {
      focusId: self.id,
      nodes: [...nodes.values()],
      edges,
      truncated: hasMoreCites || hasMoreCitedBy,
    },
  }
}

type CitationRow = {
  citing_source_id: number
  cited_source_id: number
  records: number
  quotes_count: number
  edition_count: number
  derived_count: number
}

const toEdge = (row: CitationRow): SourceGraphEdge => ({
  from: row.cited_source_id,
  to: row.citing_source_id,
  records: row.records,
  quotes: row.quotes_count,
  edition: row.edition_count,
  derived: row.derived_count,
})

async function loadSourceNodes(db: D1Database, ids: readonly number[]): Promise<Map<number, SourceGraphNode>> {
  const map = new Map<number, SourceGraphNode>()
  if (!ids.length) return map
  const placeholders = ids.map(() => '?').join(', ')
  const { results } = await db.prepare(`SELECT ${SOURCE_NODE_COLUMNS} FROM sources WHERE id IN (${placeholders})`).bind(...ids).all<SourceGraphNode>()
  for (const row of results) map.set(row.id, row)
  return map
}

/**
 * Bounded work-to-work quotation graph for `/sources/graph` (global top edges) or
 * `/sources/graph?source=<id>` (2-hop ego graph centered on one work, ordered highest-weight first).
 * Returns null only when `focusId` is provided and does not exist.
 */
export async function sourceGraph(db: D1Database, focusId: number | null = null): Promise<{ graph: SourceGraphData; dates: DateBook } | null> {
  if (focusId === null) {
    const { results } = await db.prepare(`SELECT citing_source_id, cited_source_id, records, quotes_count, edition_count, derived_count
      FROM source_citations INDEXED BY source_citations_by_records
      ORDER BY records DESC, citing_source_id, cited_source_id
      LIMIT ${SOURCE_GRAPH_EDGES_LIMIT + 1}`).all<CitationRow>()
    let truncated = results.length > SOURCE_GRAPH_EDGES_LIMIT
    const nodeIds = new Set<number>()
    const edges: SourceGraphEdge[] = []
    for (const row of results.slice(0, SOURCE_GRAPH_EDGES_LIMIT)) {
      const needed = (nodeIds.has(row.citing_source_id) ? 0 : 1) + (nodeIds.has(row.cited_source_id) ? 0 : 1)
      if (nodeIds.size + needed > SOURCE_GRAPH_NODES_LIMIT) {
        truncated = true
        continue
      }
      nodeIds.add(row.citing_source_id)
      nodeIds.add(row.cited_source_id)
      edges.push(toEdge(row))
    }
    const loaded = await loadSourceNodes(db, [...nodeIds])
    const nodes = [...nodeIds].map(id => loaded.get(id)).filter((node): node is SourceGraphNode => Boolean(node))
    const dates = await readDates(db, nodes.map(node => node.report_date))
    return { graph: { focusId: null, nodes, edges, truncated }, dates }
  }

  const focus = await db.prepare(`SELECT ${SOURCE_NODE_COLUMNS} FROM sources WHERE id = ?`).bind(focusId).first<SourceGraphNode>()
  if (!focus) return null

  const nodeIds = new Set<number>([focusId])
  const expanded = new Set<number>()
  const edgeByKey = new Map<string, SourceGraphEdge>()
  let frontier = [focusId]
  let truncated = false

  for (let hop = 0; hop < SOURCE_GRAPH_HOPS_LIMIT && frontier.length; hop++) {
    const pending = frontier.filter(id => !expanded.has(id))
    if (!pending.length) break
    if (pending.length > SOURCE_FRONTIER_LIMIT) truncated = true
    const batchIds = pending.slice(0, SOURCE_FRONTIER_LIMIT)
    for (const id of batchIds) expanded.add(id)

    // One indexed ORDER BY records DESC statement per frontier work in one db.batch so heavy edges always win.
    const statements = batchIds.flatMap(id => [
      db.prepare(`SELECT citing_source_id, cited_source_id, records, quotes_count, edition_count, derived_count
        FROM source_citations INDEXED BY source_citations_by_citing
        WHERE citing_source_id = ?
        ORDER BY records DESC, cited_source_id
        LIMIT ${PER_NODE_HOP_LIMIT + 1}`).bind(id),
      db.prepare(`SELECT citing_source_id, cited_source_id, records, quotes_count, edition_count, derived_count
        FROM source_citations INDEXED BY source_citations_by_cited
        WHERE cited_source_id = ?
        ORDER BY records DESC, citing_source_id
        LIMIT ${PER_NODE_HOP_LIMIT + 1}`).bind(id),
    ])
    const batches = await db.batch<CitationRow>(statements)
    const combined: CitationRow[] = []
    for (const res of batches) {
      if (res.results.length > PER_NODE_HOP_LIMIT) truncated = true
      combined.push(...res.results.slice(0, PER_NODE_HOP_LIMIT))
    }
    combined.sort((a, b) => b.records - a.records || a.citing_source_id - b.citing_source_id || a.cited_source_id - b.cited_source_id)

    const nextFrontier = new Set<number>()
    for (const row of combined) {
      const key = `${row.cited_source_id}->${row.citing_source_id}`
      if (edgeByKey.has(key)) continue
      const needed = (nodeIds.has(row.citing_source_id) ? 0 : 1) + (nodeIds.has(row.cited_source_id) ? 0 : 1)
      if (nodeIds.size + needed > SOURCE_GRAPH_NODES_LIMIT || edgeByKey.size >= SOURCE_GRAPH_EDGES_LIMIT) {
        truncated = true
        continue
      }
      nodeIds.add(row.citing_source_id)
      nodeIds.add(row.cited_source_id)
      edgeByKey.set(key, toEdge(row))
      if (!expanded.has(row.citing_source_id)) nextFrontier.add(row.citing_source_id)
      if (!expanded.has(row.cited_source_id)) nextFrontier.add(row.cited_source_id)
    }
    frontier = [...nextFrontier]
  }

  // Probe leftover frontier before setting `truncated` so naturally terminating chains show no limit badge.
  if (!truncated && frontier.length) {
    const pending = frontier.filter(id => !expanded.has(id))
    if (pending.length > SOURCE_FRONTIER_LIMIT) {
      truncated = true
    } else if (pending.length) {
      const probeStmts = pending.flatMap(id => [
        db.prepare(`SELECT citing_source_id, cited_source_id
          FROM source_citations INDEXED BY source_citations_by_citing
          WHERE citing_source_id = ?
          ORDER BY records DESC, cited_source_id
          LIMIT ${PER_NODE_HOP_LIMIT}`).bind(id),
        db.prepare(`SELECT citing_source_id, cited_source_id
          FROM source_citations INDEXED BY source_citations_by_cited
          WHERE cited_source_id = ?
          ORDER BY records DESC, citing_source_id
          LIMIT ${PER_NODE_HOP_LIMIT}`).bind(id),
      ])
      const probeRes = await db.batch<{ citing_source_id: number; cited_source_id: number }>(probeStmts)
      outer: for (const res of probeRes) {
        for (const row of res.results) {
          if (!edgeByKey.has(`${row.cited_source_id}->${row.citing_source_id}`)) {
            truncated = true
            break outer
          }
        }
      }
    }
  }

  const loaded = await loadSourceNodes(db, [...nodeIds])
  const nodes = [...nodeIds].map(id => loaded.get(id)).filter((node): node is SourceGraphNode => Boolean(node))
  const edges = [...edgeByKey.values()].sort((a, b) => b.records - a.records || a.from - b.from || a.to - b.to)
  const dates = await readDates(db, nodes.map(node => node.report_date))
  return { graph: { focusId, nodes, edges, truncated }, dates }
}

export type SourcePairItem = {
  sighting_id: number
  position: number
  entry_id: number
  place: string
  original_date: string | null
  kind: CiteKind
  quote: string | null
  note: string | null
  cited_sighting_id: number | null
  cited_entry_id: number | null
  cited_place: string | null
  tile: Tile
}

export type SourcePairSummary = {
  records: number
  quotes: number
  edition: number
  derived: number
}

export type SourcePairResult = {
  citing: SourceGraphNode
  cited: SourceGraphNode
  summary: SourcePairSummary | null
  items: SourcePairItem[]
  hasMore: boolean
}

/**
 * Exact sightings where work `citingId` cites work `citedId`, read from a single index range
 * on `source_citation_edges_by_pair` (O(matches), bounded to `SOURCE_PAIR_LIMIT`), paired with
 * the exact distinct-record summary row from `source_citations`.
 */
export async function sourcePairSightings(db: D1Database, citingId: number, citedId: number): Promise<SourcePairResult | null> {
  if (citingId === citedId) return null
  const [sourcesRes, summaryRes, itemsRes] = await db.batch<unknown>([
    db.prepare(`SELECT ${SOURCE_NODE_COLUMNS} FROM sources WHERE id IN (?, ?)`).bind(citingId, citedId),
    db.prepare(`SELECT records, quotes_count, edition_count, derived_count
      FROM source_citations
      WHERE citing_source_id = ?1 AND cited_source_id = ?2`).bind(citingId, citedId),
    db.prepare(`SELECT ${TILE_COLUMNS},
        edge.sighting_id AS s_id, edge.position AS sc_position, s.place AS s_place,
        ${datingOriginal('s')} AS s_original_date,
        edge.kind AS sc_kind, sc.quote AS sc_quote, sc.note AS sc_note,
        sc.cited_id AS cited_sighting_id, cs.entry_id AS cited_entry_id, cs.place AS cited_place
      FROM source_citation_edges edge INDEXED BY source_citation_edges_by_pair
      CROSS JOIN sightings s ON s.id = edge.sighting_id
      CROSS JOIN entries e ON e.id = edge.entry_id
      CROSS JOIN sighting_cites sc ON sc.sighting_id = edge.sighting_id AND sc.position = edge.position
      LEFT JOIN sightings cs ON cs.id = sc.cited_id
      WHERE edge.citing_source_id = ?1
        AND edge.cited_source_id = ?2
      ORDER BY edge.sighting_id, edge.position
      LIMIT ${SOURCE_PAIR_LIMIT + 1}`).bind(citingId, citedId),
  ])
  const byId = new Map((sourcesRes.results as SourceGraphNode[]).map(row => [row.id, row]))
  const citing = byId.get(citingId)
  const cited = byId.get(citedId)
  if (!citing || !cited) return null

  const rawSummary = summaryRes.results[0] as { records: number; quotes_count: number; edition_count: number; derived_count: number } | undefined
  const summary: SourcePairSummary | null = rawSummary
    ? { records: rawSummary.records, quotes: rawSummary.quotes_count, edition: rawSummary.edition_count, derived: rawSummary.derived_count }
    : null

  type Row = TileRow & {
    s_id: number
    sc_position: number
    s_place: string
    s_original_date: string | null
    sc_kind: CiteKind
    sc_quote: string | null
    sc_note: string | null
    cited_sighting_id: number | null
    cited_entry_id: number | null
    cited_place: string | null
  }
  const raw = itemsRes.results as Row[]
  const hasMore = raw.length > SOURCE_PAIR_LIMIT
  const items: SourcePairItem[] = raw.slice(0, SOURCE_PAIR_LIMIT).map(({
    s_id, sc_position, s_place, s_original_date, sc_kind, sc_quote, sc_note, cited_sighting_id, cited_entry_id, cited_place, ...tile
  }) => ({
    sighting_id: s_id,
    position: sc_position,
    entry_id: tile.id,
    place: s_place,
    original_date: s_original_date,
    kind: sc_kind,
    quote: sc_quote,
    note: sc_note,
    cited_sighting_id,
    cited_entry_id,
    cited_place,
    tile: toTile(tile),
  }))
  return { citing, cited, summary, items, hasMore }
}
