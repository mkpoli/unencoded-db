import { describe, expect, test } from 'bun:test'
import type { Database } from 'bun:sqlite'
import { applyMigration, createTestDatabase } from '../../test-support'

const counts = (db: Database) => Object.fromEntries(
  (db.query('SELECT script, n FROM script_counts ORDER BY script').all() as { script: string; n: number }[]).map(row => [row.script, row.n]))

const insert = (db: Database) => db.query("INSERT INTO entries (script, place, created_at, visible) VALUES (?, 'book', '2026', ?)")

describe('script counts', () => {
  test('backfills each visible script when the migration runs', () => {
    const db = createTestDatabase('0018_shared_image.sql')
    try {
      const add = insert(db)
      add.run('Han', 1); add.run('Han', 1); add.run('Tangut', 1); add.run('Kana', 0)
      applyMigration(db, '0020_script_counts.sql')
      expect(counts(db)).toEqual({ Han: 2, Tangut: 1 })
      const index = db.query("SELECT sql FROM sqlite_master WHERE type = 'index' AND name = 'entries_visible_script'").get() as { sql: string } | null
      expect(index?.sql).toContain('ON entries(script, id DESC) WHERE visible = 1')
    } finally { db.close() }
  })

  test('follows inserts, script edits, hiding, restoring and deletes', () => {
    const db = createTestDatabase()
    try {
      const add = insert(db)
      add.run('Han', 1); add.run('Tangut', 1); add.run('Kana', 0)
      expect(counts(db)).toEqual({ Han: 1, Tangut: 1 })

      db.exec("UPDATE entries SET script = 'Kana', revision = revision + 1 WHERE id = 1")
      expect(counts(db)).toEqual({ Kana: 1, Tangut: 1 })

      db.exec('UPDATE entries SET visible = 0 WHERE id = 2')
      expect(counts(db)).toEqual({ Kana: 1 })

      db.exec('UPDATE entries SET visible = 1 WHERE id = 2')
      expect(counts(db)).toEqual({ Kana: 1, Tangut: 1 })

      db.exec('DELETE FROM entries WHERE id = 2')
      expect(counts(db)).toEqual({ Kana: 1 })

      add.run('Kana', 1)
      add.run('Kana', 0)
      expect(counts(db)).toEqual({ Kana: 2 })
    } finally { db.close() }
  })
})
