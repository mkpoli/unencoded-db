import type { Database } from 'bun:sqlite'
import { describe, expect, test } from 'bun:test'
import { createTestDatabase, d1Binding } from '../test-support'
import { GET } from './export.json/+server'

function database() {
  return createTestDatabase()
}

function insert(db: Database, script: string, visible = 1, note: string | null = null) {
  return db.query('INSERT INTO entries (script, ids, description, place, title, author, publisher, year, page, note, created_at, visible) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(script, null, `Description ${script}`, 'Example collection', 'Title', 'Author', 'Publisher', '1900', '12', note, '2026-01-01T00:00:00.000Z', visible).lastInsertRowid as number
}

async function exportJson(db: Database, query = '') {
  const response = await GET({ platform: { env: { DB: d1Binding(db) } }, url: new URL(`https://example.test/export.json${query}`) } as any)
  return { response, body: await response.json() as { version?: number; records: Record<string, unknown>[]; next: number | null; error?: string } }
}

describe('JSON export', () => {
  test('returns visible records in id order with public fields only', async () => {
    const db = database()
    try {
      const first = insert(db, 'Han', 1, 'First')
      insert(db, 'Hidden', 0, 'Secret')
      const third = insert(db, 'Tangut', 1)
      const { response, body } = await exportJson(db)
      expect(response.status).toBe(200)
      expect(response.headers.get('cache-control')).toBe('no-store')
      expect(response.headers.get('content-type')).toContain('application/json')
      expect(body.version).toBe(2)
      expect(body.next).toBeNull()
      expect(body.records.map(record => record.id)).toEqual([first, third])
      expect(body.records[0]).toEqual({
        id: first,
        script: 'Han',
        ids: null,
        description: 'Description Han',
        place: 'Example collection',
        title: 'Title',
        author: 'Author',
        publisher: 'Publisher',
        year: '1900',
        page: '12',
        note: 'First',
        created_at: '2026-01-01T00:00:00.000Z',
        date_precision: 'year',
        comparisons: [],
        evidence: [{ id: 0, place: 'Example collection', title: 'Title', author: 'Author', publisher: 'Publisher', year: '1900', page: '12', note: 'First', date_precision: 'year', has_image: 0 }],
      })
      expect(JSON.stringify(body)).not.toContain('Secret')
    } finally { db.close() }
  })

  test('exports every evidence row with the character description', async () => {
    const db = database()
    try {
      const id = insert(db, 'Han', 1, 'First')
      db.query(`INSERT INTO evidence (entry_id, place, title, author, publisher, year, page, note, date_precision, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(id, 'Second place', 'Second title', null, null, '1901-04', null, null, 'month', '2026-01-02T00:00:00.000Z')
      db.query(`INSERT INTO evidence (entry_id, place, created_at) VALUES (?, ?, ?)`).run(id, 'Third place', '2026-01-03T00:00:00.000Z')
      const { body } = await exportJson(db)
      expect(body.records[0].description).toBe('Description Han')
      expect(body.records[0].evidence).toHaveLength(2)
      expect(body.records[0].evidence.find((row: { place: string }) => row.place === 'Second place')).toMatchObject({ title: 'Second title', date_precision: 'month' })
    } finally { db.close() }
  })

  test('paginates with an ascending cursor and excludes hidden records', async () => {
    const db = database()
    try {
      const ids = [insert(db, 'A'), insert(db, 'B', 0), insert(db, 'C'), insert(db, 'D')]
      const first = await exportJson(db, '?limit=2')
      expect(first.body.records.map(record => record.id)).toEqual([ids[0], ids[2]])
      expect(first.body.next).toBe(ids[2])
      const second = await exportJson(db, `?limit=2&after=${first.body.next}`)
      expect(second.body.records.map(record => record.id)).toEqual([ids[3]])
      expect(second.body.next).toBeNull()
      const end = await exportJson(db, `?after=${ids[3]}`)
      expect(end.body.records).toEqual([])
      expect(end.body.next).toBeNull()
    } finally { db.close() }
  })

  test('caps pages at 200 and defaults to 100', async () => {
    const db = database()
    try {
      for (let index = 0; index < 201; index++) insert(db, `S${index}`)
      const defaults = await exportJson(db)
      expect(defaults.body.records).toHaveLength(100)
      expect(defaults.body.next).toBe(100)
      const maximum = await exportJson(db, '?limit=200&after=100')
      expect(maximum.body.records).toHaveLength(101)
      expect(maximum.body.next).toBeNull()
    } finally { db.close() }
  })

  test('rejects invalid cursors and limits', async () => {
    const db = database()
    try {
      for (const query of ['?limit=0', '?limit=201', '?limit=x', '?after=-1', '?after=x', '?after=1.5', '?after=9007199254740992']) {
        const { response, body } = await exportJson(db, query)
        expect(response.status).toBe(400)
        expect(response.headers.get('cache-control')).toBe('no-store')
        expect(body.error).toBe('Invalid after or limit parameter')
      }
    } finally { db.close() }
  })
})
