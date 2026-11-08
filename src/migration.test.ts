import { Database } from 'bun:sqlite'
import { describe, expect, test } from 'bun:test'
import { applyMigration } from './test-support'

const oldRow = {
  id: 42,
  script: 'Han',
  ids: '⿰木木',
  description: 'description',
  place: 'place',
  visible: 1,
  image_key: null,
  image_type: null,
  image_size: null,
  title: 'title',
  author: 'author',
  publisher: 'publisher',
  year: '1900',
  page: '12',
  note: 'note',
  comparisons: '[]',
  created_at: '2026-01-01T00:00:00.000Z',
}

describe('source image migration', () => {
  test('preserves rows, ids, visibility and comparisons while dropping the source URL', () => {
    const db = new Database(':memory:')
    try {
      applyMigration(db, '0001_init.sql')
      db.exec(`INSERT INTO entries (id, script, ids, description, place, url, title, author, publisher, year, page, note, created_at)
               VALUES (42, 'Han', '⿰木木', 'description', 'place', 'https://example.org/source', 'title', 'author', 'publisher', '1900', '12', 'note', '2026-01-01T00:00:00.000Z')`)
      db.exec(`INSERT INTO entries (id, script, place, url, created_at)
               VALUES (43, 'Hidden', 'Book', 'https://example.org/hidden', '2026-01-02T00:00:00.000Z')`)
      applyMigration(db, '0002_entry_visibility.sql')
      applyMigration(db, '0003_related_characters.sql')
      db.exec('UPDATE entries SET visible = 0 WHERE id = 43')
      db.exec(`UPDATE entries SET comparisons = '[{"character":"漢","relationship":"similar","differences":"","evidence":""}]' WHERE id = 43`)
      applyMigration(db, '0004_source_images.sql')

      const row = db.query('SELECT * FROM entries WHERE id = 42').get() as Record<string, unknown>
      expect(row).toEqual(oldRow)
      expect('url' in row).toBe(false)
      expect(db.query('SELECT visible FROM entries WHERE id = 43').get()).toEqual({ visible: 0 })
      expect(db.query('SELECT comparisons FROM entries WHERE id = 43').get()).toEqual({ comparisons: '[{"character":"漢","relationship":"similar","differences":"","evidence":""}]' })

      const columns = db.query('PRAGMA table_info(entries)').all() as { name: string; type: string; notnull: number; dflt_value: string | null }[]
      expect(columns.map(column => column.name)).not.toContain('url')
      expect(columns.find(column => column.name === 'image_key')).toMatchObject({ type: 'TEXT' })
      expect(columns.find(column => column.name === 'image_type')).toMatchObject({ type: 'TEXT' })
      expect(columns.find(column => column.name === 'image_size')).toMatchObject({ type: 'INTEGER' })
      expect(columns.find(column => column.name === 'visible')).toMatchObject({ type: 'INTEGER', notnull: 1, dflt_value: '1' })
      expect(columns.find(column => column.name === 'comparisons')).toMatchObject({ type: 'TEXT', notnull: 1, dflt_value: "'[]'" })

      const index = db.query("SELECT name, sql FROM sqlite_master WHERE type = 'index' AND name = 'entries_visible_id'").get() as { name: string; sql: string } | null
      expect(index?.sql).toContain('ON entries(id DESC) WHERE visible = 1')
      const imageIndex = db.query("SELECT sql FROM sqlite_master WHERE type = 'index' AND name = 'entries_image_key'").get() as { sql: string } | null
      expect(imageIndex?.sql).toContain('UNIQUE INDEX entries_image_key')
      expect(() => db.exec('UPDATE entries SET visible = 2 WHERE id = 42')).toThrow()

      db.exec("INSERT INTO entries (script, place, created_at) VALUES ('New', 'Book', '2026')")
      expect(db.query('SELECT id FROM entries ORDER BY id').all()).toEqual([{ id: 42 }, { id: 43 }, { id: 44 }])
      expect(db.query('SELECT visible FROM entries WHERE id = 44').get()).toEqual({ visible: 1 })
    } finally { db.close() }
  })

  test('does not reuse an id deleted before the migration', () => {
    const db = new Database(':memory:')
    try {
      applyMigration(db, '0001_init.sql')
      for (const id of [1, 2, 3]) db.exec(`INSERT INTO entries (id, script, place, url, created_at) VALUES (${id}, 'Han', 'Book', 'https://example.org', '2026')`)
      applyMigration(db, '0002_entry_visibility.sql')
      applyMigration(db, '0003_related_characters.sql')
      db.exec('DELETE FROM entries WHERE id = 3')
      expect(db.query('SELECT seq FROM sqlite_sequence WHERE name = ?').get('entries')).toEqual({ seq: 3 })
      applyMigration(db, '0004_source_images.sql')
      db.exec("INSERT INTO entries (script, place, created_at) VALUES ('New', 'Book', '2026')")
      expect(db.query('SELECT max(id) AS id FROM entries').get()).toEqual({ id: 4 })
    } finally { db.close() }
  })
})
