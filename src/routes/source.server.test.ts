import { describe, expect, test } from 'bun:test'
import { createTestDatabase, d1Binding } from '../test-support'
import { load } from './[locale]/source/[id]/+page.server'

function fixture() {
  const db = createTestDatabase()
  db.exec(`INSERT INTO entries (id, script, ids, description, place, created_at, visible) VALUES
    (1, 'Han', '⿰木木', 'A tree', 'Book', '2026-01-01', 1),
    (2, 'Han', '⿱日木', 'Hidden', 'Book', '2026-01-01', 0)`)
  db.exec(`INSERT INTO sources (id, kind, title, author, publisher, year, place, created_at) VALUES
    (1, 'other', 'Book title', 'Author', 'Publisher', '1900', 'Book', '2026-01-01')`)
  db.exec(`INSERT INTO evidence (id, entry_id, place, year, page, created_at) VALUES
    (1, 1, 'Book', '1900', '12', '2026-01-01'),
    (2, 2, 'Book', '1900', '13', '2026-01-01')`)
  db.exec('INSERT INTO evidence_sources (evidence_id, source_id) VALUES (1, 1), (2, 1)')
  return db
}

function call(db: ReturnType<typeof createTestDatabase>, id = '1', query = '') {
  return load({ params: { locale: 'en', id }, platform: { env: { DB: d1Binding(db) } }, url: new URL(`https://example.test/en/source/${id}${query}`) } as any) as any
}

describe('source page', () => {
  test('lists the visible evidence of one source', async () => {
    const db = fixture()
    try {
      const data = await call(db)
      expect(data.source).toMatchObject({ id: 1, title: 'Book title', author: 'Author' })
      expect(data.rows).toHaveLength(1)
      expect(data.rows[0]).toMatchObject({ entry_id: 1, evidence_id: 1, place: 'Book' })
      expect(data.next).toBeNull()
    } finally { db.close() }
  })

  test('answers 404 for a missing source and for hidden evidence only', async () => {
    const db = fixture()
    try {
      await expect(call(db, '2')).rejects.toMatchObject({ status: 404 })
      db.exec('UPDATE entries SET visible = 0 WHERE id = 1')
      await expect(call(db)).rejects.toMatchObject({ status: 404 })
    } finally { db.close() }
  })

  test('pages by evidence id', async () => {
    const db = fixture()
    try {
      const insert = db.query("INSERT INTO evidence (entry_id, place, created_at) VALUES (1, 'Book', '2026-01-01')")
      for (let i = 0; i < 101; i++) insert.run()
      db.exec('INSERT INTO evidence_sources (evidence_id, source_id) SELECT id, 1 FROM evidence WHERE id > 2')
      const first = await call(db)
      expect(first.rows).toHaveLength(100)
      expect(first.next).toBe(4)
      const second = await call(db, '1', `?before=${first.next}`)
      expect(second.rows.map((row: { evidence_id: number }) => row.evidence_id)).toEqual([3, 1])
      expect(second.next).toBeNull()
    } finally { db.close() }
  })
})
