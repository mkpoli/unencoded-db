// Indexed reads for component function analysis (`/parts`, `/part/<part>`, and `/api/parts/functions`).
// Every read uses a dedicated index on `entry_part_roles`, `part_function_counts`, or `part_counts`
// with bounded limits and keyset pagination (`?after=`), avoiding table scans and temp B-trees.
import { partKey, validPartKey } from '$lib/composition'
import { TILE_COLUMNS, toTile, type Tile, type TileRow } from './entries'

export const PARTS_LIST_LIMIT = 200
export const PART_SLICES_LIMIT = 50
export const PART_SUGGESTIONS_LIMIT = 30
export const PART_PAGE_SIZE = 48

export type PartCount = { part: string; n: number }
export type FunctionSlice = { func: string; n: number }
export type PartEntry = { tile: Tile; role: string; func: string }

/** Top components with tagged composition roles/functions, ordered by frequency. */
export const partCountsStatement = (db: D1Database, limit = PARTS_LIST_LIMIT) =>
  db.prepare('SELECT part, n FROM part_counts ORDER BY n DESC, part LIMIT ?').bind(limit)

/** Pie-chart function breakdown for one canonical component (including `''` unlabeled). */
export const partFunctionCountsStatement = (db: D1Database, part: string, limit = PART_SLICES_LIMIT) =>
  db.prepare('SELECT func, n FROM part_function_counts WHERE part = ? ORDER BY n DESC, func LIMIT ?').bind(part, limit)

/** Shared function-tag autocomplete suggestions for one canonical component (non-empty labels only). */
export const partFunctionSuggestionsStatement = (db: D1Database, part: string, limit = PART_SUGGESTIONS_LIMIT) =>
  db.prepare("SELECT func, n FROM part_function_counts WHERE part = ? AND func != '' ORDER BY n DESC, func LIMIT ?").bind(part, limit)

/** Total tagged-role count for one canonical component. */
export const partTotalStatement = (db: D1Database, part: string) =>
  db.prepare('SELECT n FROM part_counts WHERE part = ?').bind(part)

/**
 * One keyset-paginated page of live records for a component, optionally filtered by `func`
 * (pass `''` for unlabeled rows, a non-empty string for a specific function, or `null` for all).
 */
export function partEntriesStatement(
  db: D1Database,
  part: string,
  func: string | null,
  after: number | null,
  limit = PART_PAGE_SIZE + 1,
) {
  const ceiling = after ?? Number.MAX_SAFE_INTEGER
  if (func !== null) {
    return db.prepare(`SELECT ${TILE_COLUMNS}, p.role AS part_role, p.func AS part_func
      FROM entry_part_roles p INDEXED BY entry_part_roles_by_func
      CROSS JOIN entries e ON e.id = p.entry_id
      WHERE p.part = ? AND p.func = ? AND p.entry_id < ?
      ORDER BY p.entry_id DESC LIMIT ?`).bind(part, func, ceiling, limit)
  }
  return db.prepare(`SELECT ${TILE_COLUMNS}, p.role AS part_role, p.func AS part_func
    FROM entry_part_roles p INDEXED BY entry_part_roles_by_part
    CROSS JOIN entries e ON e.id = p.entry_id
    WHERE p.part = ? AND p.entry_id < ?
    ORDER BY p.entry_id DESC LIMIT ?`).bind(part, ceiling, limit)
}

export async function listParts(db: D1Database, limit = PARTS_LIST_LIMIT): Promise<PartCount[]> {
  const { results } = await partCountsStatement(db, limit).all<PartCount>()
  return results
}

export async function partSuggestions(db: D1Database, rawPart: string, limit = PART_SUGGESTIONS_LIMIT): Promise<{ part: string; functions: FunctionSlice[] }> {
  const part = partKey(rawPart)
  if (!validPartKey(part)) return { part: '', functions: [] }
  const { results } = await partFunctionSuggestionsStatement(db, part, limit).all<FunctionSlice>()
  return { part, functions: results }
}

export async function partSummary(db: D1Database, part: string): Promise<{ total: number; slices: FunctionSlice[] }> {
  const [totalRow, slicesRes] = await Promise.all([
    partTotalStatement(db, part).first<{ n: number }>(),
    partFunctionCountsStatement(db, part).all<FunctionSlice>(),
  ])
  return { total: totalRow?.n ?? 0, slices: slicesRes.results }
}

type PartEntryRow = TileRow & { part_role: string; part_func: string }

export async function partEntries(
  db: D1Database,
  part: string,
  options: { func?: string | null; after?: number | null; limit?: number } = {},
): Promise<{ entries: PartEntry[]; more: number | null }> {
  const limit = options.limit ?? PART_PAGE_SIZE
  const { results } = await partEntriesStatement(db, part, options.func ?? null, options.after ?? null, limit + 1).all<PartEntryRow>()
  const page = results.slice(0, limit)
  const more = results.length > limit && page.length > 0 ? page[page.length - 1].id : null
  const entries = page.map(({ part_role, part_func, ...row }) => ({
    tile: toTile(row),
    role: part_role,
    func: part_func,
  }))
  return { entries, more }
}
