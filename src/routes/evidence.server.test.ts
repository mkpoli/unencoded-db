import { Database } from 'bun:sqlite'
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { actions } from './new/+page.server'
import { load as list } from './+page.server'
import { load as detail } from './entry/[id]/+page.server'

function event(values: Record<string, string>, db: unknown) {
  const form = new FormData()
  for (const [key, value] of Object.entries(values)) form.set(key, value)
  return { request: new Request('https://example.test/new', { method: 'POST', body: form }), platform: { env: { DB: db } } } as any
}

function binding(db: Database) {
  return { prepare(sql: string) { return { bind(...values: (string | number | null)[]) {
    return {
      run: () => ({ results: db.query(sql).all(...values) }),
      first: async () => db.query(sql).get(...values),
      all: async () => ({ results: db.query(sql).all(...values) }),
    }
  } } }, async batch(statements: { run: () => unknown }[]) {
    return db.transaction(() => statements.map(statement => statement.run()))()
  } }
}

function comparisonEvent(rows: Record<string, string>[], db: unknown) {
  const form = new FormData()
  form.set('script', 'Han'); form.set('url', 'https://example.org/')
  for (const row of rows) for (const [key, value] of Object.entries(row)) form.append(`comparison_${key}`, value)
  return { request: new Request('https://example.test/new', { method: 'POST', body: form }), platform: { env: { DB: db } } } as any
}

const comparison = { character: '漢', relationship: 'not_variant', differences: 'Different component', evidence: 'Source page 4' }

describe('evidence routes', () => {
  test('persists multiple comparisons and displays their explanations', async () => {
    const db = new Database(':memory:')
    try {
      for (const migration of ['0001_init.sql', '0002_related_characters.sql']) db.exec(readFileSync(new URL(`../../migrations/${migration}`, import.meta.url), 'utf8'))
      const DB = binding(db)
      const rows = [comparison, { ...comparison, character: '字', relationship: 'uncertain' }]
      await expect(actions.default!(comparisonEvent(rows, DB))).rejects.toMatchObject({ status: 303, location: '/entry/1' })
      const result = await detail({ platform: { env: { DB } }, params: { id: '1' } } as any) as any
      expect(result.comparisons).toEqual(rows)
      await expect(actions.default!(comparisonEvent(rows, DB))).rejects.toMatchObject({ status: 303, location: '/entry/2' })
      const second = await detail({ platform: { env: { DB } }, params: { id: '2' } } as any) as any
      expect(second.comparisons).toEqual(rows)
    } finally { db.close() }
  })
  test('rejects excess and invalid comparisons without saving', async () => {
    const rows = Array.from({ length: 11 }, () => ({ ...comparison }))
    rows[10].relationship = 'wrong'
    const result = await actions.default!(comparisonEvent(rows, {})) as any
    expect(result.status).toBe(400)
    expect(result.data.comparisons.tooMany).toBe(true)
    expect(result.data.comparisons.errors[10]).toBeTruthy()
    expect(result.data.comparisons.rows).toEqual(rows)
  })
  test('rejects incomplete, overlong and misaligned rows', async () => {
    for (const row of [
      { ...comparison, character: ' ' },
      { ...comparison, evidence: 'x'.repeat(2001) },
      { character: '漢', relationship: 'variant', differences: '' },
    ]) {
      const result = await actions.default!(comparisonEvent([row], {})) as any
      expect(result.status).toBe(400)
      expect(result.data.comparisons.errors[0]).toBeTruthy()
    }
  })
  test('rolls back the entry if comparisons fail', async () => {
    const db = new Database(':memory:')
    try {
      for (const migration of ['0001_init.sql', '0002_related_characters.sql']) db.exec(readFileSync(new URL(`../../migrations/${migration}`, import.meta.url), 'utf8'))
      db.exec("CREATE TRIGGER reject_comparisons BEFORE INSERT ON entries WHEN json_array_length(NEW.comparisons) > 0 BEGIN SELECT RAISE(ABORT, 'rejected'); END")
      await expect(actions.default!(comparisonEvent([comparison], binding(db)))).rejects.toThrow()
      expect(db.query('SELECT count(*) AS count FROM entries').get()).toEqual({ count: 0 })
    } finally { db.close() }
  })
  test('creates and displays source-linked evidence with bibliographic details', async () => {
    const db = new Database(':memory:')
    try {
      db.exec(readFileSync(new URL('../../migrations/0001_init.sql', import.meta.url), 'utf8'))
      db.exec(readFileSync(new URL('../../migrations/0002_related_characters.sql', import.meta.url), 'utf8'))
      expect(() => db.exec("INSERT INTO entries (script, place, created_at) VALUES ('Han', 'Book', '2026')")).toThrow()
      const DB = binding(db)
      const values = { script: 'Han', url: 'https://example.org/book', ids: '⿰木木', title: 'Source', author: 'Author', publisher: 'Publisher', year: '1900', page: '12', note: 'Notes' }
      await expect(actions.default!(event(values, DB))).rejects.toMatchObject({ status: 303, location: '/entry/1' })
      const listing = await list({ platform: { env: { DB } }, url: new URL('https://example.test/') } as any) as any
      expect(listing.entries[0]).toMatchObject({ id: 1, ids: values.ids, place: values.url })
      const result = await detail({ platform: { env: { DB } }, params: { id: '1' } } as any) as any
      expect(result.entry).toMatchObject(values)
      expect(result.entry.place).toBe(values.url)
    } finally { db.close() }
  })
  test('requires a source URL even when a place is provided', async () => {
    const result = await actions.default!(event({ script: 'Han', place: 'book' }, {})) as any
    expect(result.status).toBe(400)
    expect(result.data.errors.url).toContain('HTTP or HTTPS')
  })
  test('preserves text on validation failure', async () => {
    const result = await actions.default!(event({ script: 'Han', title: '  My title  ', note: 'notes' }, {})) as any
    expect(result.status).toBe(400)
    expect(result.data.errors.url).toBeDefined()
    expect(result.data.values.title).toBe('  My title  ')
    expect(result.data.values.note).toBe('notes')
  })
  test('reports specific field errors together', async () => {
    const result = await actions.default!(event({ script: '', url: 'ftp://example.org/', title: 'x'.repeat(301) }, {})) as any
    expect(result.data.errors.script).toContain('script')
    expect(result.data.errors.url).toContain('HTTP or HTTPS')
    expect(result.data.errors.title).toContain('length')
    expect(result.data.values.url).toBe('ftp://example.org/')
  })
})
