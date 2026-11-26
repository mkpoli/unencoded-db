// Named bulk imports and the awaiting-review workflow for records added through them.
import {
  adjustImportCounts,
  checkChanged,
  checkMark,
  claimRows,
  getEntryRow,
  recountImport,
  reindex,
  revisionMark,
  sightingRows,
  TILE_COLUMNS,
  toTile,
  type Tile,
  type TileRow,
  type Who,
} from './entries'

export const IMPORT_NAME_MAX = 200
export const IMPORTS_PAGE = 50
export const IMPORT_ENTRIES_PAGE = 60

export type ImportSummary = {
  id: number
  name: string
  total: number
  pending: number
  created_by: string | null
  created_at: string
  by_id: string | null
  by_name: string | null
}

export type ImportEntry = Tile & {
  script: string
  script_other: string | null
  reviewed_at: string | null
}

export type ReviewResult = { ok: true; importId: number } | { ok: false; code: 'missing' | 'merged' | 'notImported' }

export { adjustImportCounts, recountImport }

const WHO_IMPORT = 'LEFT JOIN people p ON p.id = i.created_by LEFT JOIN people m ON m.id = p.merged_into'
const WHO_IMPORT_COLUMNS = 'COALESCE(m.id, p.id) AS by_id, COALESCE(m.name, p.name) AS by_name'

/** Normalizes and trims an import name, returning null when blank. */
export function cleanImportName(raw: unknown): string | null {
  const value = String(raw ?? '').normalize('NFC').trim()
  return value ? value.slice(0, IMPORT_NAME_MAX).trim() || null : null
}

/** Creates a named import or returns the existing one with the same normalized name. */
export async function findOrCreateImport(db: D1Database, rawName: string, who: Pick<Who, 'actor'>): Promise<{ id: number; name: string }> {
  const name = cleanImportName(rawName)
  if (!name) throw new Error('Import name must be 1 to 200 characters.')
  const at = new Date().toISOString()
  await db.prepare('INSERT INTO imports(name, created_by, created_at) VALUES(?, ?, ?) ON CONFLICT(name) DO NOTHING')
    .bind(name, who.actor, at)
    .run()
  const row = await db.prepare('SELECT id, name FROM imports WHERE name = ?').bind(name).first<{ id: number; name: string }>()
  return row!
}

export const listImportsStatement = (db: D1Database, after?: number | null) =>
  db.prepare(`SELECT i.id, i.name, i.total, i.pending, i.created_by, i.created_at, ${WHO_IMPORT_COLUMNS}
    FROM imports i ${WHO_IMPORT}
    WHERE i.id < ?
    ORDER BY i.id DESC
    LIMIT ?`)
    .bind(after ?? Number.MAX_SAFE_INTEGER, IMPORTS_PAGE + 1)

export const getImportStatement = (db: D1Database, id: number) =>
  db.prepare(`SELECT i.id, i.name, i.total, i.pending, i.created_by, i.created_at, ${WHO_IMPORT_COLUMNS}
    FROM imports i ${WHO_IMPORT}
    WHERE i.id = ?`)
    .bind(id)

export function importEntriesStatement(db: D1Database, id: number, { pendingOnly = true, after = null }: { pendingOnly?: boolean; after?: number | null } = {}) {
  const index = pendingOnly ? 'entries_import_pending' : 'entries_by_import'
  const pending = pendingOnly ? ' AND e.reviewed_at IS NULL' : ''
  return db.prepare(`SELECT ${TILE_COLUMNS}, e.script, e.script_other
    FROM entries e INDEXED BY ${index}
    WHERE e.import_id = ? AND e.import_id IS NOT NULL${pending} AND e.merged_into IS NULL AND e.hidden_at IS NULL AND e.id < ?
    ORDER BY e.id DESC
    LIMIT ?`)
    .bind(id, after ?? Number.MAX_SAFE_INTEGER, IMPORT_ENTRIES_PAGE + 1)
}

export async function listImports(db: D1Database, after?: number | null) {
  const { results } = await listImportsStatement(db, after).all<ImportSummary>()
  const imports = results.slice(0, IMPORTS_PAGE)
  return { imports, next: results.length > IMPORTS_PAGE ? imports.at(-1)!.id : null }
}

export const getImport = (db: D1Database, id: number) => getImportStatement(db, id).first<ImportSummary>()

export async function importEntries(db: D1Database, id: number, options: { pendingOnly?: boolean; after?: number | null } = {}) {
  type Row = TileRow & { script: string; script_other: string | null }
  const { results } = await importEntriesStatement(db, id, options).all<Row>()
  const page = results.slice(0, IMPORT_ENTRIES_PAGE)
  const entries: ImportEntry[] = page.map(({ script, script_other, ...tile }) => ({
    ...toTile(tile),
    script,
    script_other,
    reviewed_at: tile.reviewed_at,
  }))
  return { entries, next: results.length > IMPORT_ENTRIES_PAGE ? entries.at(-1)!.id : null }
}

/** Marks an imported live entry as reviewed or awaiting review, updating browse tags and import counts atomically. */
export async function setEntryReviewed(
  db: D1Database,
  entryId: number,
  reviewed: boolean,
  who: Who,
  expectedImportId?: number,
): Promise<ReviewResult> {
  for (let attempt = 0; ; attempt++) {
    const mark = await revisionMark(db, entryId)
    const entry = await getEntryRow(db, entryId)
    if (!entry || entry.hidden_at) return { ok: false, code: 'missing' }
    if (entry.merged_into) return { ok: false, code: 'merged' }
    if (entry.import_id === null) return { ok: false, code: 'notImported' }
    if (expectedImportId !== undefined && entry.import_id !== expectedImportId) return { ok: false, code: 'missing' }
    if (Boolean(entry.reviewed_at) === reviewed) return { ok: true, importId: entry.import_id }
    const at = reviewed ? new Date().toISOString() : null
    const by = reviewed ? who.actor : null
    const index = await reindex(db, entryId, { ...entry, reviewed_at: at, reviewed_by: by }, await claimRows(db, entryId), await sightingRows(db, entryId))
    try {
      await db.batch([
        checkMark(db, entryId, mark, who),
        db.prepare(`UPDATE entries SET reviewed_at = ?, reviewed_by = ?, review_rev = review_rev + 1 WHERE id = ? AND import_id = ? AND merged_into IS NULL AND hidden_at IS NULL AND reviewed_at IS ${reviewed ? 'NULL' : 'NOT NULL'}`)
          .bind(at, by, entryId, entry.import_id),
        checkChanged(db, entryId, who),
        ...index,
        adjustImportCounts(db, entry.import_id, 0, reviewed ? -1 : 1),
      ])
      return { ok: true, importId: entry.import_id }
    } catch (error) {
      const latest = await getEntryRow(db, entryId)
      if (!latest || latest.hidden_at) return { ok: false, code: 'missing' }
      if (latest.merged_into) return { ok: false, code: 'merged' }
      if (latest.import_id === null) return { ok: false, code: 'notImported' }
      if (expectedImportId !== undefined && latest.import_id !== expectedImportId) return { ok: false, code: 'missing' }
      if (Boolean(latest.reviewed_at) === reviewed) return { ok: true, importId: latest.import_id }
      if (attempt < 4) continue
      throw error
    }
  }
}
