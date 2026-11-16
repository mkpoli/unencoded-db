// The records a person has starred, in `favourites`. Any session may star one, an anonymous one
// too, and signing in to a Glyph Atlas account brings its stars along (`people.ts`).
import { TILE_COLUMNS, toTile, type Tile, type TileRow } from './entries'

// How many records one person may star; the layout reads every starred id at once.
export const FAVOURITES_HELD = 2000
export const FAVOURITES_PAGE = 60

export class FavouriteError extends Error {
  constructor(readonly status: number, message: string) { super(message) }
}

// Newest first, read along `favourites_recent`: no temp B-tree sort.
export const favouriteIdsQuery = () => 'SELECT f.entry_id, e.merged_into, e.hidden_at FROM favourites f JOIN entries e ON e.id = f.entry_id WHERE f.person = ? ORDER BY f.at DESC, f.entry_id LIMIT ?'
export const favouritePageQuery = () => 'SELECT entry_id FROM favourites WHERE person = ? ORDER BY at DESC, entry_id LIMIT ? OFFSET ?'
export const favouriteCountQuery = () => 'SELECT count(*) AS n FROM favourites WHERE person = ?'

type StateRow = { id: number; merged_into: number | null; hidden_at: string | null }
type FavouriteStateRow = { entry_id: number; merged_into: number | null; hidden_at: string | null }
type EntryTileRow = TileRow & { merged_into: number | null; hidden_at: string | null }

/** Follows `merged_into` to the live, visible target record, or null when missing or hidden. */
export async function resolveLiveEntry(db: D1Database, id: number): Promise<number | null> {
  let current: number | null = id
  const seen = new Set<number>()
  for (let hop = 0; hop < 10 && current !== null; hop++) {
    if (seen.has(current)) return null
    seen.add(current)
    const row: StateRow | null = await db.prepare('SELECT id, merged_into, hidden_at FROM entries WHERE id = ?').bind(current).first<StateRow>()
    if (!row || row.hidden_at) return null
    if (row.merged_into === null) return row.id
    current = row.merged_into
  }
  return null
}

/** Validates `{ entry, favourite }` from a write request. */
export function parseFavouriteInput(input: unknown): { entry: number; favourite: boolean } {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new FavouriteError(422, 'Name the record to star.')
  const record = input as Record<string, unknown>
  const entry = record.entry
  const favourite = record.favourite
  if (typeof entry !== 'number' || !Number.isSafeInteger(entry) || entry <= 0) throw new FavouriteError(422, 'Name the record to star.')
  if (typeof favourite !== 'boolean') throw new FavouriteError(422, 'Say whether the record is starred.')
  return { entry, favourite }
}

/** Every live record the person has starred, newest first. Merged records resolve to their target. */
export async function favouriteIds(db: D1Database, person: string) {
  const { results } = await db.prepare(favouriteIdsQuery()).bind(person, FAVOURITES_HELD).all<FavouriteStateRow>()
  const seen = new Set<number>()
  const ids: number[] = []
  for (const row of results) {
    if (row.hidden_at) continue
    const target = row.merged_into === null ? row.entry_id : await resolveLiveEntry(db, row.merged_into)
    if (target !== null && !seen.has(target)) {
      seen.add(target)
      ids.push(target)
    }
  }
  return { ids }
}

/** One page of the person's starred records as gallery tiles, newest first. A merged record is shown
 *  as the record it merged into, and a hidden or missing one is left out. */
export async function favouriteEntries(db: D1Database, person: string, offset = 0, limit = FAVOURITES_PAGE) {
  const start = Math.max(0, Math.trunc(offset))
  const size = Math.min(Math.max(1, Math.trunc(limit)), FAVOURITES_PAGE)
  const [rows, total] = await db.batch<{ entry_id: number } | { n: number }>([
    db.prepare(favouritePageQuery()).bind(person, size, start),
    db.prepare(favouriteCountQuery()).bind(person),
  ])
  const ids = (rows.results as { entry_id: number }[]).map(row => row.entry_id)
  const n = (total.results[0] as { n: number } | undefined)?.n ?? 0
  if (!ids.length) return { tiles: [] as Tile[], total: n, offset: start, next: null as number | null }

  const { results: entryRows } = await db.prepare(`SELECT ${TILE_COLUMNS}, e.merged_into, e.hidden_at FROM json_each(?) j CROSS JOIN entries e ON e.id = j.value`).bind(JSON.stringify(ids)).all<EntryTileRow>()
  const found = new Map(entryRows.map(row => [row.id, row]))
  const moved = new Map<number, number>()
  for (const id of ids) {
    const row = found.get(id)
    if (!row || row.hidden_at || row.merged_into === null) continue
    const target = await resolveLiveEntry(db, row.merged_into)
    if (target !== null) moved.set(id, target)
  }
  const missingTargets = [...new Set(moved.values())].filter(id => !found.has(id))
  if (missingTargets.length) {
    const { results: targetRows } = await db.prepare(`SELECT ${TILE_COLUMNS}, e.merged_into, e.hidden_at FROM json_each(?) j CROSS JOIN entries e ON e.id = j.value`).bind(JSON.stringify(missingTargets)).all<EntryTileRow>()
    for (const row of targetRows) found.set(row.id, row)
  }

  const seen = new Set<number>()
  const tiles: Tile[] = []
  for (const id of ids) {
    const row = found.get(moved.get(id) ?? id)
    if (!row || row.hidden_at || row.merged_into !== null || seen.has(row.id)) continue
    seen.add(row.id)
    tiles.push(toTile(row))
  }
  return { tiles, total: n, offset: start, next: start + ids.length < n ? start + ids.length : null }
}

/** Star a record or take its star away. */
export async function setFavourite(db: D1Database, person: string, rawEntry: unknown, rawFavourite: unknown) {
  const { entry, favourite } = parseFavouriteInput({ entry: rawEntry, favourite: rawFavourite })
  if (!favourite) {
    await db.prepare('DELETE FROM favourites WHERE person = ? AND entry_id = ?').bind(person, entry).run()
    // If a starred record was later merged into `entry`, unstarring `entry` removes that star too.
    const { results: merged } = await db.prepare('SELECT f.entry_id, e.merged_into FROM favourites f JOIN entries e ON e.id = f.entry_id WHERE f.person = ? AND e.merged_into IS NOT NULL').bind(person).all<{ entry_id: number; merged_into: number }>()
    for (const row of merged) {
      if (await resolveLiveEntry(db, row.merged_into) === entry) {
        await db.prepare('DELETE FROM favourites WHERE person = ? AND entry_id = ?').bind(person, row.entry_id).run()
      }
    }
    return { entry, favourite: false }
  }

  const target = await resolveLiveEntry(db, entry)
  if (target === null) throw new FavouriteError(404, 'That record does not exist.')
  const [existing, held] = await db.batch<{ n: number }>([
    db.prepare('SELECT 1 AS n FROM favourites WHERE person = ? AND entry_id = ?').bind(person, target),
    db.prepare(favouriteCountQuery()).bind(person),
  ])
  if (!existing.results.length) {
    if ((held.results[0]?.n ?? 0) >= FAVOURITES_HELD) throw new FavouriteError(429, `You can star at most ${FAVOURITES_HELD} records.`)
    await db.prepare('INSERT OR IGNORE INTO favourites(person, entry_id, at) SELECT ?, ?, MAX(?, COALESCE((SELECT MAX(at) + 1 FROM favourites WHERE person = ?), 0)) WHERE (SELECT count(*) FROM favourites WHERE person = ?) < ?')
      .bind(person, target, Date.now(), person, person, FAVOURITES_HELD).run()
    const [nowPresent, nowHeld] = await db.batch<{ n: number }>([
      db.prepare('SELECT 1 AS n FROM favourites WHERE person = ? AND entry_id = ?').bind(person, target),
      db.prepare(favouriteCountQuery()).bind(person),
    ])
    if (!nowPresent.results.length && (nowHeld.results[0]?.n ?? 0) >= FAVOURITES_HELD) {
      throw new FavouriteError(429, `You can star at most ${FAVOURITES_HELD} records.`)
    }
  }
  return { entry: target, favourite: true }
}
