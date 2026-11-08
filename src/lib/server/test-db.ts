import { Database } from 'bun:sqlite'
import { readFileSync } from 'node:fs'

export const migrationFiles = ['0001_init.sql', '0002_entry_visibility.sql', '0003_related_characters.sql', '0004_moderation.sql', '0005_reports.sql'] as const

export function migrationSql(name: typeof migrationFiles[number]): string {
  return readFileSync(new URL(`../../../migrations/${name}`, import.meta.url), 'utf8')
}

export function applyMigration(db: Database, name: typeof migrationFiles[number]): void {
  db.exec(migrationSql(name))
}

export function testDatabase(): Database {
  const db = new Database(':memory:')
  for (const name of migrationFiles) applyMigration(db, name)
  return db
}

export function insertEntry(db: Database, visible: 0 | 1 = 1, script = 'Han'): number {
  const result = db
    .query("INSERT INTO entries (script, place, url, created_at, visible) VALUES (?, 'book', 'https://example.org/source', '2026-01-01T00:00:00.000Z', ?)")
    .run(script, visible)
  return Number(result.lastInsertRowid)
}

export function d1Binding(db: Database): D1Database {
  return {
    prepare(sql: string) {
      return {
        bind(...values: unknown[]) {
          return {
            run: async () => db.query(sql).run(...(values as never[])),
            first: async () => db.query(sql).get(...(values as never[])) ?? null,
            all: async () => ({ results: db.query(sql).all(...(values as never[])) }),
          }
        },
      }
    },
  } as unknown as D1Database
}

export function auditRows(db: Database): { id: number; entry_id: number; action: string; moderator: string; created_at: string }[] {
  return db.query('SELECT id, entry_id, action, moderator, created_at FROM moderation_audit ORDER BY id').all() as never
}

export function insertReport(db: Database, entryId: number, reason = 'spam', note = '', createdAt = '2026-01-05T00:00:00.000Z'): number {
  const result = db
    .query('INSERT INTO entry_reports (entry_id, reason, note, created_at) VALUES (?, ?, ?, ?)')
    .run(entryId, reason, note, createdAt)
  return Number(result.lastInsertRowid)
}

export function reportRows(db: Database): { id: number; entry_id: number; reason: string; note: string; created_at: string; resolved_at: string | null }[] {
  return db.query('SELECT id, entry_id, reason, note, created_at, resolved_at FROM entry_reports ORDER BY id').all() as never
}

export function entryVisible(db: Database, id: number): number {
  return (db.query('SELECT visible FROM entries WHERE id = ?').get(id) as { visible: number }).visible
}
