// The records a record is compared with, each with its first pictures, so that forms kept apart are seen
// together. A record is related when a relation claim of this one names it, by a description it states or
// by the encoded character it is or by its own code, or when a relation claim of its own names this one the same way.
//
// Every read is bounded: the names are capped, each is one key of `claims_by_value`, and the records and
// their sightings are then read by key.
import { claimsOf, type Claim } from '$lib/claims'
import { codedRecord, recordCode } from '$lib/code'
import { cleanIds, codePointCharacters, codePoints, encodedCharacter } from '$lib/ids'
import { isRelationKind, type RelationKind } from '$lib/related'
import { TILE_COLUMNS, toTile, type Tile, type TileRow } from './entries'

export const RELATED_MAX = 12
export const RELATED_PICTURES = 4
// D1 binds at most 100 values to a statement; each lookup binds its names and nothing else.
const NAMES_MAX = 90
const ROWS_MAX = 100

export type RelatedPicture = { sighting: number; thumb_key: string; place: string; title: string | null; date: string | null }
/** `relationships` are what this record states of the other, `stated` what the other states of this one. */
export type RelatedRecord = { tile: Tile; relationships: RelationKind[]; stated: RelationKind[]; pictures: RelatedPicture[]; /** The records this one's relations name by code that led here, itself or one merged into it. */ named: number[] }

/** The spellings a relation's value is looked up by: as written, as a description, and as the characters its codes name; a record's code is that record alone. */
const spellings = (value: string) => { const record = codedRecord(value); return record ? [recordCode(record)] : [...new Set([value, cleanIds(value), codePointCharacters(value)].filter(Boolean))] }
const single = (text: string) => [...text].length === 1
/** A character's code as it is usually stored, in either letter case. */
const codes = (char: string) => [codePoints(char), codePoints(char).toLowerCase()]

const marks = (count: number) => Array.from({ length: count }, () => '?').join(', ')
// Claims by their value, of records anyone may see: a key of `claims_by_value` per name, then the record by its key.
const byValue = (db: D1Database, kind: 'ids' | 'encoding' | 'relation', values: readonly string[]) =>
  db.prepare(`SELECT k.entry_id, k.value, '${kind}' AS kind, json_extract(k.data, '$.relationship') AS relationship FROM claims k CROSS JOIN entries e ON e.id = k.entry_id
    WHERE k.kind = '${kind}' AND k.value IN (${marks(values.length)})${kind === 'encoding' ? ` AND json_extract(k.data, '$.charset') = 'unicode'` : ''} AND e.merged_into IS NULL AND e.hidden_at IS NULL LIMIT ${ROWS_MAX}`).bind(...values)

export const relatedTilesStatement = (db: D1Database, ids: readonly number[]) =>
  db.prepare(`SELECT ${TILE_COLUMNS} FROM entries e WHERE e.id IN (${marks(ids.length)}) AND e.merged_into IS NULL AND e.hidden_at IS NULL`).bind(...ids)

// The first picture of each of a record's first visible sightings.
export const relatedPicturesStatement = (db: D1Database, ids: readonly number[]) =>
  db.prepare(`SELECT s.entry_id, s.id AS sighting, x.thumb_key, s.place, c.title, COALESCE(s.original_date, c.report_date) AS date
    FROM entries e CROSS JOIN sightings s ON s.id IN (SELECT id FROM sightings WHERE entry_id = e.id AND hidden_at IS NULL ORDER BY id LIMIT ${RELATED_PICTURES})
    JOIN sighting_media x ON x.sighting_id = s.id AND x.position = 0
    LEFT JOIN sources c ON c.id = s.source_id
    WHERE e.id IN (${marks(ids.length)})`).bind(...ids)

// The records named by their codes, each followed through its merges to the record that stays; one that is
// hidden, or leads to none, is left out. Every step is a read by key, and the steps are capped.
const byCode = (db: D1Database, ids: readonly number[]) =>
  db.prepare(`WITH RECURSIVE named(origin, id) AS (
      SELECT value, value FROM json_each(?)
      UNION ALL SELECT n.origin, e.merged_into FROM named n JOIN entries e ON e.id = n.id WHERE e.merged_into IS NOT NULL LIMIT ${NAMES_MAX * 4})
    SELECT n.id AS entry_id, n.origin AS value, 'code' AS kind, NULL AS relationship FROM named n JOIN entries e ON e.id = n.id WHERE e.merged_into IS NULL AND e.hidden_at IS NULL`).bind(JSON.stringify(ids))

export const relatedClaimsStatements = (db: D1Database, named: readonly string[], own: readonly string[]) => {
  const records = named.flatMap(name => codedRecord(name) ?? []).slice(0, NAMES_MAX)
  const theirs = named.filter(name => !codedRecord(name))
  const characters = theirs.filter(single).slice(0, NAMES_MAX / 2)
  return [
    ...(records.length ? [byCode(db, records)] : []),
    ...(theirs.length ? [byValue(db, 'ids', theirs.slice(0, NAMES_MAX))] : []),
    ...(characters.length ? [byValue(db, 'encoding', characters.flatMap(codes))] : []),
    ...(own.length ? [byValue(db, 'relation', own.slice(0, NAMES_MAX))] : []),
  ]
}

export async function relatedRecords(db: D1Database, id: number, claims: readonly Claim[]): Promise<RelatedRecord[]> {
  // What this record calls the others, each spelling to the relationships stated of it.
  const said = new Map<string, RelationKind[]>()
  for (const claim of claimsOf(claims, 'relation')) {
    const relationship = claim.data?.relationship
    if (!isRelationKind(relationship)) continue
    for (const name of spellings(claim.value)) said.set(name, [...(said.get(name) ?? []), relationship])
  }
  // What the others may call this record: its own code, its descriptions, and its encoded character with its code.
  const characters = claimsOf(claims, 'encoding').filter(claim => claim.data?.charset === 'unicode').map(claim => encodedCharacter(claim.value)).filter(Boolean)
  const own = [...new Set([recordCode(id), ...claimsOf(claims, 'ids').map(claim => claim.value), ...characters, ...characters.flatMap(codes)])]

  const statements = relatedClaimsStatements(db, [...said.keys()], own)
  if (!statements.length) return []
  const found = new Map<number, { relationships: Set<RelationKind>; stated: Set<RelationKind>; named: number[] }>()
  const note = (entry: number, side: 'relationships' | 'stated', kinds: readonly RelationKind[]) => {
    if (entry === id) return
    const held = found.get(entry) ?? { relationships: new Set(), stated: new Set(), named: [] }
    for (const kind of kinds) held[side].add(kind)
    found.set(entry, held)
  }
  for (const { results } of await db.batch<{ entry_id: number; value: string; kind: string; relationship: unknown }>(statements)) {
    for (const row of results) {
      if (row.kind === 'code') { note(row.entry_id, 'relationships', said.get(recordCode(Number(row.value))) ?? []); found.get(row.entry_id)?.named.push(Number(row.value)); continue }
      if (row.kind === 'relation') { if (isRelationKind(row.relationship)) note(row.entry_id, 'stated', [row.relationship]) }
      // A code is every spelling of its character this record wrote.
      else note(row.entry_id, 'relationships', row.kind === 'encoding' ? [encodedCharacter(row.value), ...codes(encodedCharacter(row.value))].flatMap(name => said.get(name) ?? []) : said.get(row.value) ?? [])
    }
  }
  const ids = [...found.keys()].sort((a, b) => a - b).slice(0, RELATED_MAX)
  if (!ids.length) return []
  const [tiles, pictures] = await db.batch<unknown>([relatedTilesStatement(db, ids), relatedPicturesStatement(db, ids)])
  const drawn = new Map<number, RelatedPicture[]>()
  for (const { entry_id, ...picture } of (pictures.results as (RelatedPicture & { entry_id: number })[]).sort((a, b) => a.sighting - b.sighting)) drawn.set(entry_id, [...(drawn.get(entry_id) ?? []), picture])
  return (tiles.results as TileRow[]).sort((a, b) => a.id - b.id).map(row => ({ tile: toTile(row), relationships: [...found.get(row.id)!.relationships], stated: [...found.get(row.id)!.stated], pictures: drawn.get(row.id) ?? [], named: found.get(row.id)!.named }))
}
