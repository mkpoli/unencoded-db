// Indexed reads for component function analysis (`/parts`, `/part/<part>`, and `/api/parts/functions`).
// Every read uses a dedicated index on `entry_part_roles`, `part_function_counts`, or `part_counts`
// with bounded limits and tuple keyset pagination (`?after=`), avoiding table scans and temp B-trees.
import { FUNCTION_MAX, partKey, ROLE_MAX, validPartKey } from '$lib/composition'
import { TILE_COLUMNS, toTile, type Tile, type TileRow } from './entries'

export const PARTS_LIST_LIMIT = 200
export const PART_SLICES_LIMIT = 50
export const PART_SUGGESTIONS_LIMIT = 30
export const PART_PAGE_SIZE = 48

export type PartCount = { part: string; n: number }
export type FunctionSlice = { func: string; n: number }
export type PartEntry = { tile: Tile; role: string; func: string }
export type PartCursor = { id: number; role: string; func: string }

const INT_RE = /^[1-9]\d{0,15}$/
const B64URL_RE = /^[A-Za-z0-9_-]{1,400}$/

/** Encode a keyset cursor. Uses a plain integer when no intra-record tie-break is needed. */
export function encodePartCursor(cursor: PartCursor, needsTieBreak = false): string {
  if (!needsTieBreak) return String(cursor.id)
  const payload = Buffer.from(JSON.stringify([cursor.role, cursor.func]), 'utf8').toString('base64url')
  return `${cursor.id}.${payload}`
}

/** Parse `?after=` into a tuple cursor, or null when malformed. */
export function parsePartCursor(raw: string): PartCursor | null {
  if (INT_RE.test(raw)) {
    const id = Number(raw)
    return Number.isSafeInteger(id) && id >= 1 ? { id, role: '', func: '' } : null
  }
  const dot = raw.indexOf('.')
  if (dot <= 0) return null
  const head = raw.slice(0, dot), tail = raw.slice(dot + 1)
  if (!INT_RE.test(head) || !B64URL_RE.test(tail)) return null
  const id = Number(head)
  if (!Number.isSafeInteger(id) || id < 1) return null
  try {
    const parsed = JSON.parse(Buffer.from(tail, 'base64url').toString('utf8'))
    if (!Array.isArray(parsed) || parsed.length !== 2) return null
    const [role, func] = parsed
    if (typeof role !== 'string' || typeof func !== 'string') return null
    if ([...role].length > ROLE_MAX || [...func].length > FUNCTION_MAX) return null
    return { id, role, func }
  } catch {
    return null
  }
}

/** Top components with tagged composition roles/functions, ordered by frequency. */
export const partCountsStatement = (db: D1Database, limit = PARTS_LIST_LIMIT) =>
  db.prepare('SELECT part, n FROM part_counts ORDER BY n DESC, part LIMIT ?').bind(limit)

/** Pie-chart function breakdown for one canonical component (including `''` unlabeled). */
export const partFunctionCountsStatement = (db: D1Database, part: string, limit = PART_SLICES_LIMIT) =>
  db.prepare('SELECT func, n FROM part_function_counts WHERE part = ? ORDER BY n DESC, func LIMIT ?').bind(part, limit)

/** Shared function-tag autocomplete suggestions for one canonical component (specific custom labels only). */
export const partFunctionSuggestionsStatement = (db: D1Database, part: string, limit = PART_SUGGESTIONS_LIMIT) =>
  db.prepare("SELECT func, n FROM part_function_counts WHERE part = ? AND func NOT IN ('', 'semantic', 'phonetic', 'symbol', 'initial', 'final') ORDER BY n DESC, func LIMIT ?").bind(part, limit)

/** Total tagged-role count for one canonical component. */
export const partTotalStatement = (db: D1Database, part: string) =>
  db.prepare('SELECT n FROM part_counts WHERE part = ?').bind(part)

/**
 * One keyset-paginated page of live records for a component, optionally filtered by effective
 * function bucket (`func || role`, or `''` for unlabeled, or `null` for all).
 * Uses tuple keyset comparisons so a record tagging the same part with multiple `(role, func)`
 * pairs never loses rows across a page boundary.
 */
export function partEntriesStatement(
  db: D1Database,
  part: string,
  func: string | null,
  after: PartCursor | null,
  limit = PART_PAGE_SIZE + 1,
) {
  if (func !== null) {
    if (after) {
      return db.prepare(`SELECT ${TILE_COLUMNS}, p.role AS part_role, p.func AS part_func
        FROM entry_part_roles p INDEXED BY entry_part_roles_by_bucket
        CROSS JOIN entries e ON e.id = p.entry_id
        WHERE p.part = ? AND p.bucket = ? AND (p.entry_id, p.role, p.func) < (?, ?, ?)
        ORDER BY p.entry_id DESC, p.role DESC, p.func DESC LIMIT ?`).bind(part, func, after.id, after.role, after.func, limit)
    }
    return db.prepare(`SELECT ${TILE_COLUMNS}, p.role AS part_role, p.func AS part_func
      FROM entry_part_roles p INDEXED BY entry_part_roles_by_bucket
      CROSS JOIN entries e ON e.id = p.entry_id
      WHERE p.part = ? AND p.bucket = ?
      ORDER BY p.entry_id DESC, p.role DESC, p.func DESC LIMIT ?`).bind(part, func, limit)
  }
  if (after) {
    return db.prepare(`SELECT ${TILE_COLUMNS}, p.role AS part_role, p.func AS part_func
      FROM entry_part_roles p
      CROSS JOIN entries e ON e.id = p.entry_id
      WHERE p.part = ? AND (p.entry_id, p.role, p.func) < (?, ?, ?)
      ORDER BY p.entry_id DESC, p.role DESC, p.func DESC LIMIT ?`).bind(part, after.id, after.role, after.func, limit)
  }
  return db.prepare(`SELECT ${TILE_COLUMNS}, p.role AS part_role, p.func AS part_func
    FROM entry_part_roles p
    CROSS JOIN entries e ON e.id = p.entry_id
    WHERE p.part = ?
    ORDER BY p.entry_id DESC, p.role DESC, p.func DESC LIMIT ?`).bind(part, limit)
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
  options: { func?: string | null; after?: PartCursor | null; limit?: number } = {},
): Promise<{ entries: PartEntry[]; more: string | null }> {
  const limit = options.limit ?? PART_PAGE_SIZE
  const { results } = await partEntriesStatement(db, part, options.func ?? null, options.after ?? null, limit + 1).all<PartEntryRow>()
  const page = results.slice(0, limit)
  let more: string | null = null
  if (results.length > limit && page.length > 0) {
    const last = page[page.length - 1]
    const next = results[limit]
    more = encodePartCursor({ id: last.id, role: last.part_role, func: last.part_func }, next.id === last.id)
  }
  const entries = page.map(({ part_role, part_func, ...row }) => ({
    tile: toTile(row),
    role: part_role,
    func: part_func,
  }))
  return { entries, more }
}
