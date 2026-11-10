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

type ExportedEvidence = {
  id: number
  place: string
  url: string | null
  provider: string | null
  provider_url: string | null
  title: string | null
  author: string | null
  publisher: string | null
  year: string | null
  page: string | null
  note: string | null
  date_precision: string
  has_image: number
  types: string[]
}

type ExportedRecord = {
  id: number
  script: string
  ids: string | null
  ids_all: string[]
  description: string
  place: string
  title: string | null
  author: string | null
  publisher: string | null
  year: string | null
  page: string | null
  note: string | null
  created_at: string
  date_precision: string
  comparisons: { relationship: string; script: string; character: string }[]
  evidence: ExportedEvidence[]
  ivd_status: 'registered' | 'none' | null
  ivd_sequence: string | null
}

async function exportJson(db: Database, query = '') {
  const response = await GET({ platform: { env: { DB: d1Binding(db) } }, url: new URL(`https://example.test/export.json${query}`) } as any)
  return { response, body: await response.json() as { version?: number; records: ExportedRecord[]; next: number | null; error?: string } }
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
        ids_all: [],
        description: 'Description Han',
        place: 'Example collection',
        title: 'Title',
        author: 'Author',
        publisher: 'Publisher',
        year: '1900',
        page: '12',
        note: 'First',
        created_at: '2026-01-01T00:00:00.000Z',
        ivd_status: null,
        ivd_sequence: null,
        date_precision: 'year',
        comparisons: [],
        evidence: [{ id: 0, place: 'Example collection', title: 'Title', author: 'Author', publisher: 'Publisher', year: '1900', page: '12', note: 'First', date_precision: 'year', has_image: 0, url: null, provider: null, provider_url: null, types: [] }],
      })
      expect(JSON.stringify(body)).not.toContain('Secret')
    } finally { db.close() }
  })

  test('exports the first description as ids and every description as ids_all', async () => {
    const db = database()
    try {
      const id = insert(db, 'Han')
      db.query('UPDATE entries SET ids = ?, revision = revision + 1 WHERE id = ?').run('⿰木木 ⿱木木', id)
      const { body } = await exportJson(db)
      expect(body.records[0]!.ids).toBe('⿰木木')
      expect(body.records[0]!.ids_all).toEqual(['⿰木木', '⿱木木'])
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
      const evidence = body.records[0]!.evidence as { place: string }[]
      expect(evidence).toHaveLength(2)
      expect(evidence.find(row => row.place === 'Second place')).toMatchObject({ title: 'Second title', date_precision: 'month' })
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

  test('exports IVD membership apart from Unicode encoding', async () => {
    const db = database()
    try {
      const registered = insert(db, 'Han')
      const absent = insert(db, 'Tangut')
      db.query("UPDATE entries SET encoded_as = 'U+4E00', ivd_status = 'registered', ivd_sequence = 'U+4E00 U+E0100' WHERE id = ?").run(registered)
      db.query("UPDATE entries SET encoded_as = 'U+4E01', ivd_status = 'none' WHERE id = ?").run(absent)
      const { body } = await exportJson(db)
      const first = body.records.find(record => record.id === registered)
      const second = body.records.find(record => record.id === absent)
      expect(first).toMatchObject({ ivd_status: 'registered', ivd_sequence: 'U+4E00 U+E0100' })
      expect(second).toMatchObject({ ivd_status: 'none', ivd_sequence: null })
      expect(first).not.toHaveProperty('encoded_as')
      expect(JSON.stringify(body)).not.toContain('U+4E01')
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

  test('exports source types as a list', async () => {
    const db = database()
    try {
      const id = insert(db, 'Han')
      db.query(`INSERT INTO evidence (entry_id, place, types, date_precision, created_at) VALUES (?, ?, ?, ?, ?)`)
        .run(id, 'Typed source', JSON.stringify(['attestation', 'reading']), 'text', '2026-01-02T00:00:00.000Z')
      const { body } = await exportJson(db)
      expect(body.records[0]!.evidence[0]!.types).toEqual(['attestation', 'reading'])
    } finally { db.close() }
  })

  test('exports provider attribution in JSON', async () => {
    const db = database()
    try {
      const id = insert(db, 'Han', 1, 'With provider')
      db.query(`INSERT INTO evidence (entry_id, place, provider, provider_url, date_precision, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
        .run(id, '', '難読漢字図書館', 'https://example.org/nandoku', 'text', '2026-01-02T00:00:00.000Z')

      const { body: jsonBody } = await exportJson(db)
      expect(jsonBody.records[0]!.evidence[0]).toMatchObject({
        place: '',
        provider: '難読漢字図書館',
        provider_url: 'https://example.org/nandoku',
      })
    } finally { db.close() }
  })
})
