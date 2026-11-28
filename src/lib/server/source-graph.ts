// Server reads and write-maintained counters for the work-to-work (dictionary / source) quotation graph.
// Every read is strictly bounded and backed by composite indexes on `source_citations` and `sightings_by_source`.
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

const LIVE = 'e.hidden_at IS NULL AND e.merged_into IS NULL'
const SOURCE_NODE_COLUMNS = 'id, title, author, publisher, report_date, url, container, source_kind, year, records'

const owned = (owner: number | string) => ({
  sql: typeof owner === 'number' ? '?' : owner,
  values: typeof owner === 'number' ? [owner] : [],
})

/**
 * Statements to refresh `source_citations` inside the same `db.batch` for every citing source
 * affected by a change on `entry` (both outbound cites from `entry`'s sightings and inbound cites
 * pointing at `entry`'s sightings via `sighting_cites_by_cited`, plus any previously-citing source IDs).
 */
export function sourceCitationsRefreshStatements(
  db: D1Database,
  entry: number | string,
  alsoCiting: readonly (number | null)[] = [],
) {
  const { sql, values } = owned(entry)
  const extra = JSON.stringify([...new Set(alsoCiting.filter((id): id is number => id !== null))])
  const touched = `WITH touched(id) AS (
    SELECT s.source_id
    FROM sightings s
    JOIN sighting_cites sc ON sc.sighting_id = s.id
    WHERE s.entry_id = ${sql} AND s.source_id IS NOT NULL
    UNION
    SELECT s2.source_id
    FROM sightings t
    JOIN sighting_cites sc INDEXED BY sighting_cites_by_cited ON sc.cited_id = t.id
    JOIN sightings s2 ON s2.id = sc.sighting_id
    WHERE t.entry_id = ${sql} AND s2.source_id IS NOT NULL
    UNION
    SELECT value FROM json_each(?)
  )`
  const params = [...values, ...values, extra]
  return [
    db.prepare(`${touched} DELETE FROM source_citations WHERE citing_source_id IN (SELECT id FROM touched)`).bind(...params),
    db.prepare(`${touched}
      INSERT INTO source_citations (citing_source_id, cited_source_id, records, quotes_count, edition_count, derived_count)
      SELECT
        citing_source_id,
        cited_source_id,
        COUNT(DISTINCT entry_id),
        COUNT(DISTINCT CASE WHEN kind = 'quotes' THEN entry_id END),
        COUNT(DISTINCT CASE WHEN kind = 'edition' THEN entry_id END),
        COUNT(DISTINCT CASE WHEN kind = 'derived' THEN entry_id END)
      FROM (
        SELECT
          s.source_id AS citing_source_id,
          CASE
            WHEN sc.cited_id IS NOT NULL THEN COALESCE(cs.source_id, sc.source_id)
            ELSE sc.source_id
          END AS cited_source_id,
          s.entry_id AS entry_id,
          sc.kind AS kind
        FROM touched
        CROSS JOIN sightings s INDEXED BY sightings_by_source ON s.source_id = touched.id
        CROSS JOIN entries e ON e.id = s.entry_id
        CROSS JOIN sighting_cites sc ON sc.sighting_id = s.id
        LEFT JOIN sightings cs ON cs.id = sc.cited_id
        LEFT JOIN entries ce ON ce.id = cs.entry_id
        WHERE s.hidden_at IS NULL
          AND ${LIVE}
          AND (
            (sc.cited_id IS NULL AND sc.source_id IS NOT NULL)
            OR (sc.cited_id IS NOT NULL AND cs.id IS NOT NULL AND cs.hidden_at IS NULL AND ce.hidden_at IS NULL AND ce.merged_into IS NULL)
          )
      )
      WHERE cited_source_id IS NOT NULL
        AND citing_source_id != cited_source_id
      GROUP BY citing_source_id, cited_source_id`).bind(...params),
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
 * Bounded 1-hop work-to-work quotation summary for `/source/[id]`: works this source quotes
 * and works that quote this source, plus a ready-to-render 1-hop strip graph when non-empty.
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
      LIMIT ${SOURCE_LINEAGE_LIMIT}`).bind(sourceId),
    db.prepare(`SELECT sc.citing_source_id AS id, sc.records AS shared, sc.quotes_count, sc.edition_count, sc.derived_count,
        c.title, c.author, c.publisher, c.report_date, c.url, c.container, c.source_kind, c.year, c.records
      FROM source_citations sc INDEXED BY source_citations_by_cited
      JOIN sources c ON c.id = sc.citing_source_id
      WHERE sc.cited_source_id = ?
      ORDER BY sc.records DESC, sc.citing_source_id
      LIMIT ${SOURCE_LINEAGE_LIMIT}`).bind(sourceId),
  ])
  const self = selfRes.results[0] as SourceGraphNode | undefined
  const cites = (citesRes.results as PeerRow[]).map(toPeer)
  const citedBy = (citedByRes.results as PeerRow[]).map(toPeer)
  if (!self || (!cites.length && !citedBy.length)) return { cites, citedBy, graph: null }

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
    graph: {
      focusId: self.id,
      nodes: [...nodes.values()],
      edges,
      truncated: cites.length >= SOURCE_LINEAGE_LIMIT || citedBy.length >= SOURCE_LINEAGE_LIMIT,
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
  for (let i = 0; i < ids.length; i += 60) {
    const chunk = ids.slice(i, i + 60)
    const placeholders = chunk.map(() => '?').join(', ')
    const { results } = await db.prepare(`SELECT ${SOURCE_NODE_COLUMNS} FROM sources WHERE id IN (${placeholders})`).bind(...chunk).all<SourceGraphNode>()
    for (const row of results) map.set(row.id, row)
  }
  return map
}

/**
 * Bounded work-to-work quotation graph for `/sources/graph` (global top edges) or
 * `/sources/graph?source=<id>` (2-hop ego graph centered on one work).
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
  const hopReadLimit = SOURCE_GRAPH_EDGES_LIMIT * 2

  for (let hop = 0; hop < SOURCE_GRAPH_HOPS_LIMIT && frontier.length; hop++) {
    const batchIds = frontier.filter(id => !expanded.has(id)).slice(0, 40)
    if (!batchIds.length) break
    for (const id of batchIds) expanded.add(id)
    const placeholders = batchIds.map(() => '?').join(', ')
    const [outRes, inRes] = await db.batch<CitationRow>([
      db.prepare(`SELECT citing_source_id, cited_source_id, records, quotes_count, edition_count, derived_count
        FROM source_citations INDEXED BY source_citations_by_citing
        WHERE citing_source_id IN (${placeholders})
        LIMIT ${hopReadLimit + 1}`).bind(...batchIds),
      db.prepare(`SELECT citing_source_id, cited_source_id, records, quotes_count, edition_count, derived_count
        FROM source_citations INDEXED BY source_citations_by_cited
        WHERE cited_source_id IN (${placeholders})
        LIMIT ${hopReadLimit + 1}`).bind(...batchIds),
    ])
    if (outRes.results.length > hopReadLimit || inRes.results.length > hopReadLimit) truncated = true
    const combined = [...outRes.results.slice(0, hopReadLimit), ...inRes.results.slice(0, hopReadLimit)]
      .sort((a, b) => b.records - a.records || a.citing_source_id - b.citing_source_id || a.cited_source_id - b.cited_source_id)
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
    const leftover = frontier.filter(id => !expanded.has(id)).slice(0, 40)
    if (leftover.length) {
      const placeholders = leftover.map(() => '?').join(', ')
      const [moreOut, moreIn] = await db.batch<{ citing_source_id: number; cited_source_id: number }>([
        db.prepare(`SELECT citing_source_id, cited_source_id FROM source_citations INDEXED BY source_citations_by_citing WHERE citing_source_id IN (${placeholders}) LIMIT ${hopReadLimit}`).bind(...leftover),
        db.prepare(`SELECT citing_source_id, cited_source_id FROM source_citations INDEXED BY source_citations_by_cited WHERE cited_source_id IN (${placeholders}) LIMIT ${hopReadLimit}`).bind(...leftover),
      ])
      for (const row of [...moreOut.results, ...moreIn.results]) {
        if (!edgeByKey.has(`${row.cited_source_id}->${row.citing_source_id}`)) {
          truncated = true
          break
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

export type SourcePairResult = {
  citing: SourceGraphNode
  cited: SourceGraphNode
  items: SourcePairItem[]
  hasMore: boolean
}

/**
 * Exact sightings where work `citingId` cites work `citedId` (either through a linked witness or
 * an unseen named source stub), bounded to `SOURCE_PAIR_LIMIT` rows in `sightings_by_source` order.
 */
export async function sourcePairSightings(db: D1Database, citingId: number, citedId: number): Promise<SourcePairResult | null> {
  if (citingId === citedId) return null
  const [sourcesRes, itemsRes] = await db.batch<unknown>([
    db.prepare(`SELECT ${SOURCE_NODE_COLUMNS} FROM sources WHERE id IN (?, ?)`).bind(citingId, citedId),
    db.prepare(`SELECT ${TILE_COLUMNS},
        s.id AS s_id, sc.position AS sc_position, s.place AS s_place,
        ${datingOriginal('s')} AS s_original_date,
        sc.kind AS sc_kind, sc.quote AS sc_quote, sc.note AS sc_note,
        sc.cited_id AS cited_sighting_id, cs.entry_id AS cited_entry_id, cs.place AS cited_place
      FROM sightings s INDEXED BY sightings_by_source
      CROSS JOIN entries e ON e.id = s.entry_id
      CROSS JOIN sighting_cites sc ON sc.sighting_id = s.id
      LEFT JOIN sightings cs ON cs.id = sc.cited_id
      LEFT JOIN entries ce ON ce.id = cs.entry_id
      WHERE s.source_id = ?1
        AND s.hidden_at IS NULL
        AND ${LIVE}
        AND (
          (sc.cited_id IS NULL AND sc.source_id = ?2)
          OR (sc.cited_id IS NOT NULL AND cs.id IS NOT NULL AND cs.hidden_at IS NULL AND ce.hidden_at IS NULL AND ce.merged_into IS NULL AND COALESCE(cs.source_id, sc.source_id) = ?2)
        )
      ORDER BY s.id
      LIMIT ${SOURCE_PAIR_LIMIT + 1}`).bind(citingId, citedId),
  ])
  const byId = new Map((sourcesRes.results as SourceGraphNode[]).map(row => [row.id, row]))
  const citing = byId.get(citingId)
  const cited = byId.get(citedId)
  if (!citing || !cited) return null

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
  return { citing, cited, items, hasMore }
}
