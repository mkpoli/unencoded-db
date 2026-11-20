// The records a record is compared with, each with its first pictures, so that forms kept apart are seen
// together. A record is related when a relation claim of this one names it, by a description it states or
// by the encoded character it is, or when a relation claim of its own names this one the same way.
//
// Every read is bounded: the names are capped, each is one key of `claims_by_value`, and the records and
// their sightings are then read by key.
import { claimsOf, type Claim } from '$lib/claims'
import { cleanIds, codePointCharacters, codePoints, encodedCharacter } from '$lib/ids'
import { isRelationKind, type RelationKind } from '$lib/related'
import { TILE_COLUMNS, toTile, type Tile, type TileRow } from './entries'

export const RELATED_MAX = 12
export const RELATED_PICTURES = 4
const NAMES_MAX = 40
const ROWS_MAX = 100

export type RelatedPicture = { sighting: number; thumb_key: string; place: string; title: string | null; date: string | null }
export type RelatedRecord = { tile: Tile; relationships: RelationKind[]; pictures: RelatedPicture[] }

/** The spellings a relation's value is looked up by: as written, as a description, and as the characters its codes name. */
const spellings = (value: string) => [...new Set([value, cleanIds(value), codePointCharacters(value)].filter(Boolean))]
const single = (text: string) => [...text].length === 1

const marks = (count: number) => Array.from({ length: count }, () => '?').join(', ')
const byValue = (db: D1Database, kind: Claim['kind'], values: readonly string[], columns = 'entry_id, value') =>
  db.prepare(`SELECT ${columns} FROM claims WHERE kind = ? AND value IN (${marks(values.length)}) LIMIT ${ROWS_MAX}`).bind(kind, ...values)

export const relatedTilesStatement = (db: D1Database, ids: readonly number[]) =>
  db.prepare(`SELECT ${TILE_COLUMNS} FROM entries e WHERE e.id IN (${marks(ids.length)}) AND e.merged_into IS NULL AND e.hidden_at IS NULL`).bind(...ids)

// The first picture of each of a record's first visible sightings.
export const relatedPicturesStatement = (db: D1Database, ids: readonly number[]) =>
  db.prepare(`SELECT s.entry_id, s.id AS sighting, x.thumb_key, s.place, c.title, COALESCE(s.original_date, c.report_date) AS date
    FROM entries e CROSS JOIN sightings s ON s.id IN (SELECT id FROM sightings WHERE entry_id = e.id AND hidden_at IS NULL ORDER BY id LIMIT ${RELATED_PICTURES})
    JOIN sighting_media x ON x.sighting_id = s.id AND x.position = 0
    LEFT JOIN sources c ON c.id = s.source_id
    WHERE e.id IN (${marks(ids.length)})`).bind(...ids)

export const relatedClaimsStatements = (db: D1Database, theirs: readonly string[], own: readonly string[]) => [
  ...(theirs.length ? [byValue(db, 'ids', theirs)] : []),
  ...(theirs.some(single) ? [byValue(db, 'encoding', theirs.filter(single).map(codePoints))] : []),
  ...(own.length ? [byValue(db, 'relation', own, "entry_id, value, json_extract(data, '$.relationship') AS relationship")] : []),
]

export async function relatedRecords(db: D1Database, id: number, claims: readonly Claim[]): Promise<RelatedRecord[]> {
  // What this record calls the others, each spelling to the relationships stated of it.
  const stated = new Map<string, RelationKind[]>()
  for (const claim of claimsOf(claims, 'relation')) {
    const relationship = claim.data?.relationship
    if (!isRelationKind(relationship)) continue
    for (const name of spellings(claim.value)) stated.set(name, [...(stated.get(name) ?? []), relationship])
  }
  const theirs = [...stated.keys()].slice(0, NAMES_MAX)
  // What the others may call this record: its descriptions, and its encoded character with its code.
  const characters = claimsOf(claims, 'encoding').filter(claim => claim.data?.charset === 'unicode').map(claim => encodedCharacter(claim.value)).filter(Boolean)
  const own = [...new Set([...claimsOf(claims, 'ids').map(claim => claim.value), ...characters, ...characters.map(codePoints)])].slice(0, NAMES_MAX)

  const statements = relatedClaimsStatements(db, theirs, own)
  if (!statements.length) return []
  const found = new Map<number, Set<RelationKind>>()
  const note = (entry: number, relationships: readonly RelationKind[]) => {
    if (entry === id) return
    const held = found.get(entry) ?? new Set()
    for (const relationship of relationships) held.add(relationship)
    found.set(entry, held)
  }
  for (const { results } of await db.batch<{ entry_id: number; value: string; relationship?: unknown }>(statements)) {
    for (const row of results) {
      if ('relationship' in row) { if (isRelationKind(row.relationship)) note(row.entry_id, [row.relationship]) }
      else note(row.entry_id, stated.get(row.value) ?? stated.get(encodedCharacter(row.value)) ?? [])
    }
  }
  const ids = [...found.keys()].sort((a, b) => a - b).slice(0, RELATED_MAX)
  if (!ids.length) return []
  const [tiles, pictures] = await db.batch<unknown>([relatedTilesStatement(db, ids), relatedPicturesStatement(db, ids)])
  const drawn = new Map<number, RelatedPicture[]>()
  for (const { entry_id, ...picture } of (pictures.results as (RelatedPicture & { entry_id: number })[]).sort((a, b) => a.sighting - b.sighting)) drawn.set(entry_id, [...(drawn.get(entry_id) ?? []), picture])
  return (tiles.results as TileRow[]).sort((a, b) => a.id - b.id).map(row => ({ tile: toTile(row), relationships: [...found.get(row.id)!], pictures: drawn.get(row.id) ?? [] }))
}
