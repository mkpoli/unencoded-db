import { sourceMatches, sourceMatchParams } from './source-aliases'
import { hashHex } from './image'
import type { CardPicture } from './entries'

type Copy = { slug: string; title: string; collection: string }

export async function matchingCopies(db: D1Database, query: string) {
  if (!query.trim()) return []
  const { results } = await db.prepare(`SELECT d.* FROM digitized_copies d
    WHERE EXISTS (SELECT 1 FROM digitized_copy_pages p WHERE p.copy_slug = d.slug
      AND p.source_id IN (${sourceMatches})) ORDER BY d.title, d.slug`).bind(...sourceMatchParams(query)).all<Copy>()
  return results
}

export function copyOfSource(db: D1Database, id: number) {
  return db.prepare(`SELECT d.* FROM digitized_copy_pages p JOIN digitized_copies d ON d.slug = p.copy_slug
    WHERE p.source_id = ?`).bind(id).first<Copy>()
}

const citations = (paged: boolean) => `WITH pages AS MATERIALIZED (
  SELECT source_id, scan, url FROM digitized_copy_pages WHERE copy_slug = ?
), cited AS (
  SELECT s.id AS sighting, p.source_id, p.scan, p.url, 0 AS via FROM pages p CROSS JOIN sightings s INDEXED BY sightings_by_source ON s.source_id = p.source_id
    ${paged ? 'WHERE s.id > ?2' : ''}
  UNION
  SELECT v.sighting_id, p.source_id, p.scan, p.url, 1 FROM pages p CROSS JOIN sighting_vias v INDEXED BY sighting_vias_by_source ON v.source_id = p.source_id
    CROSS JOIN sightings s ON s.id = v.sighting_id WHERE s.source_id IS NOT p.source_id ${paged ? 'AND v.sighting_id > ?2' : ''}
), visible AS (
  SELECT c.*, s.entry_id, s.page, e.ids, e.layout FROM cited c
    CROSS JOIN sightings s ON s.id = c.sighting CROSS JOIN entries e ON e.id = s.entry_id
    WHERE s.hidden_at IS NULL AND e.hidden_at IS NULL AND e.merged_into IS NULL
)`
type Citation = { source: number; scan: string; url: string; via: number }
type Sighting = { sighting: number; entry_id: number; page: string | null; ids: string | null; layout: string | null; thumb: string | null }

// Pick artwork from the whole copy regardless of which page of sightings was shared.
// A via-only sighting can supply its record glyph, but its scan belongs to the direct citation.
function specimenQuery(db: D1Database, slug: string) {
  return db.prepare(`${citations(false)} SELECT d.title, d.collection, v.entry_id, v.ids, v.layout,
      x.thumb_key, x.image_key, x.image_w, x.image_h, x.box
    FROM visible v JOIN digitized_copies d ON d.slug = ?1
    LEFT JOIN sighting_media x ON v.via = 0 AND x.sighting_id = v.sighting AND x.position = 0
    ORDER BY x.image_key IS NULL, nullif(v.ids, '') IS NULL, v.via, v.sighting LIMIT 1`)
    .bind(slug)
}

type Specimen = Pick<Copy, 'title' | 'collection'> & Pick<Sighting, 'entry_id' | 'ids' | 'layout'> &
  (CardPicture | Record<keyof CardPicture, null>)

export function copyCardSpecimen(db: D1Database, slug: string) {
  return specimenQuery(db, slug).first<Specimen>()
}

const PAGE_SIZE = 50

export async function copyPage(db: D1Database, slug: string, after: number) {
  const [metadata, counts, rows] = await db.batch([
    specimenQuery(db, slug),
    db.prepare(`${citations(false)} SELECT count(DISTINCT sighting) AS sightings, count(DISTINCT entry_id) AS records
      FROM visible`).bind(slug),
    db.prepare(`${citations(true)} SELECT sighting, entry_id, CASE WHEN min(via) = 0 THEN page END AS page, ids, layout,
      (SELECT thumb_key FROM sighting_media WHERE sighting_id = visible.sighting ORDER BY position LIMIT 1) AS thumb,
      json_group_array(json_object('source',source_id,'scan',scan,'url',url,'via',via)) AS links
      FROM visible GROUP BY sighting ORDER BY sighting LIMIT ?`).bind(slug, after, PAGE_SIZE + 1),
  ])
  const specimen = metadata.results[0] as Specimen | undefined
  const totals = counts.results[0] as { sightings: number; records: number }
  if (!specimen || !rows.results.length) return null
  const copy = { slug, title: specimen.title, collection: specimen.collection }
  const cardVersion = (await hashHex(JSON.stringify(specimen))).slice(0, 16)
  const sightings = (rows.results as (Sighting & { links: string })[]).slice(0, PAGE_SIZE)
    .map(({ links, ...row }) => ({ ...row, citations: (JSON.parse(links) as Citation[]).sort((a, b) => a.via - b.via || a.source - b.source) }))
  return { copy, cardVersion, totals, sightings, next: rows.results.length > PAGE_SIZE ? sightings[PAGE_SIZE - 1].sighting : null }
}
