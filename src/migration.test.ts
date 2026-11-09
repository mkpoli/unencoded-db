import { Database } from 'bun:sqlite'
import { describe, expect, test } from 'bun:test'
import { parseDate } from './lib/server/evidence-links'
import { applyMigration, createTestDatabase } from './test-support'

const oldRow = {
  id: 42,
  script: 'Han',
  ids: '⿰木木',
  description: 'description',
  place: 'place',
  visible: 1,
  comparisons: '[]',
  image_key: null,
  image_type: null,
  image_size: null,
  title: 'title',
  author: 'author',
  publisher: 'publisher',
  year: '1900',
  page: '12',
  note: 'note',
  creator_id: 'person-1',
  created_at: '2026-01-01T00:00:00.000Z',
}

describe('source image migration', () => {
  test('preserves rows, ids, visibility, comparisons and attribution while dropping the source URL', () => {
    const db = new Database(':memory:')
    try {
      applyMigration(db, '0001_init.sql')
      db.exec(`INSERT INTO entries (id, script, ids, description, place, url, title, author, publisher, year, page, note, created_at)
               VALUES (42, 'Han', '⿰木木', 'description', 'place', 'https://example.org/source', 'title', 'author', 'publisher', '1900', '12', 'note', '2026-01-01T00:00:00.000Z')`)
      db.exec(`INSERT INTO entries (id, script, place, url, created_at)
               VALUES (43, 'Hidden', 'Book', 'https://example.org/hidden', '2026-01-02T00:00:00.000Z')`)
      applyMigration(db, '0002_entry_visibility.sql')
      applyMigration(db, '0003_related_characters.sql')
      applyMigration(db, '0004_attribution.sql')
      applyMigration(db, '0005_oidc.sql')
      db.exec("INSERT INTO persons (id, created_at) VALUES ('person-1', '2026-01-01T00:00:00.000Z')")
      db.exec("UPDATE entries SET creator_id = 'person-1' WHERE id = 42")
      db.exec('UPDATE entries SET visible = 0 WHERE id = 43')
      db.exec(`UPDATE entries SET comparisons = '[{"character":"漢","relationship":"similar","differences":"","evidence":""}]' WHERE id = 43`)
      applyMigration(db, '0006_source_images.sql')

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
      expect(columns.find(column => column.name === 'creator_id')).toMatchObject({ type: 'TEXT' })
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
      applyMigration(db, '0004_attribution.sql')
      applyMigration(db, '0005_oidc.sql')
      db.exec('DELETE FROM entries WHERE id = 3')
      expect(db.query('SELECT seq FROM sqlite_sequence WHERE name = ?').get('entries')).toEqual({ seq: 3 })
      applyMigration(db, '0006_source_images.sql')
      db.exec("INSERT INTO entries (script, place, created_at) VALUES ('New', 'Book', '2026')")
      expect(db.query('SELECT max(id) AS id FROM entries').get()).toEqual({ id: 4 })
    } finally { db.close() }
  })
})

describe('date precision migration', () => {
  test('backfills the same parts and precision as parseDate', () => {
    const db = createTestDatabase('0014_genres.sql')
    try {
      const entryId = db.query("INSERT INTO entries (script, place, created_at) VALUES ('Han', 'Book', '2026-01-01T00:00:00.000Z')").run().lastInsertRowid as number
      const insert = db.query('INSERT INTO evidence (entry_id, place, year, created_at) VALUES (?, ?, ?, ?)')
      const years: (string | null)[] = [
        '1998', ' 1998 ',
        '1998-5', '1998-05', '1998/5', '1998.05',
        '1998-5-2', '1998-05-02', '1998/5.2', '1998.05/02', '1998-05/12',
        '2000-02-29', '0400-02-29', '0000-02-29',
        '1900-02-29', '1998-02-29', '1998-02-30', '1998-04-31', '0100-02-29',
        '1998-13', '1998-00-10',
        '5', '05', '12', '13', '00',
        'ca. 1900', '1998-', '19980512', '',
        null,
      ]
      for (const year of years) insert.run(entryId, 'Book', year, '2026-01-01T00:00:00.000Z')
      applyMigration(db, '0015_date_precision.sql')
      const rows = db.query('SELECT year, date_year, date_month, date_day, date_precision FROM evidence ORDER BY id').all() as { year: string | null }[]
      expect(rows).toEqual(years.map(year => ({ year, ...parseDate(year) })))
    } finally { db.close() }
  })
})
