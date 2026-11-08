import { Database } from 'bun:sqlite'
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { actions } from './new/+page.server'
import { load as list } from './+page.server'
import { load as detail } from './entry/[id]/+page.server'

function event(values: Record<string, string>, db: unknown) {
  const form = new FormData()
  for (const [key, value] of Object.entries(values)) form.set(key, value)
  return { request: new Request('https://example.test/new', { method: 'POST', body: form }), url: new URL('https://example.test/new'), cookies: { get: () => undefined, set: () => {} }, platform: { env: { DB: db } } } as any
}

function binding(db: Database) {
  return { prepare(sql: string) { return { bind(...values: (string | number | null)[]) {
    return {
      run: () => ({ results: db.query(sql).all(...values) }),
      first: async () => db.query(sql).get(...values),
      all: async () => ({ results: db.query(sql).all(...values) }),
      execute: () => db.query(sql).all(...values),
    }
  } } }, batch: async (statements: { execute: () => unknown[] }[]) => db.transaction(() => statements.map(statement => ({ results: statement.execute() })))() }
}

function comparisonEvent(rows: Record<string, string>[], db: unknown) {
  const form = new FormData()
  form.set('script', 'Han'); form.set('url', 'https://example.org/')
  for (const row of rows) for (const [key, value] of Object.entries(row)) form.append(`comparison_${key}`, value)
  return { request: new Request('https://example.test/new', { method: 'POST', body: form }), url: new URL('https://example.test/new'), cookies: { get: () => undefined, set: () => {} }, platform: { env: { DB: db } } } as any
}

const comparison = { character: '漢', relationship: 'not_variant', differences: 'Different component', evidence: 'Source page 4' }

describe('evidence routes', () => {
  test('persists multiple comparisons and displays their explanations', async () => {
    const db = new Database(':memory:')
    try {
      for (const migration of ['0001_init.sql', '0002_entry_visibility.sql', '0003_related_characters.sql', '0004_attribution.sql']) db.exec(readFileSync(new URL(`../../migrations/${migration}`, import.meta.url), 'utf8'))
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
      for (const migration of ['0001_init.sql', '0002_entry_visibility.sql', '0003_related_characters.sql', '0004_attribution.sql']) db.exec(readFileSync(new URL(`../../migrations/${migration}`, import.meta.url), 'utf8'))
      db.exec("CREATE TRIGGER reject_comparisons BEFORE INSERT ON entries WHEN json_array_length(NEW.comparisons) > 0 BEGIN SELECT RAISE(ABORT, 'rejected'); END")
      await expect(actions.default!(comparisonEvent([comparison], binding(db)))).rejects.toThrow()
      expect(db.query('SELECT count(*) AS count FROM entries').get()).toEqual({ count: 0 })
    } finally { db.close() }
  })
  test('creates and displays source-linked evidence with bibliographic details', async () => {
    const db = new Database(':memory:')
    try {
      db.exec(readFileSync(new URL('../../migrations/0001_init.sql', import.meta.url), 'utf8'))
      db.exec(readFileSync(new URL('../../migrations/0002_entry_visibility.sql', import.meta.url), 'utf8'))
db.exec(readFileSync(new URL('../../migrations/0003_related_characters.sql', import.meta.url), 'utf8'))
db.exec(readFileSync(new URL('../../migrations/0004_attribution.sql', import.meta.url), 'utf8'))
      expect(() => db.exec("INSERT INTO entries (script, place, created_at) VALUES ('Han', 'Book', '2026')")).toThrow()
      const DB = binding(db)
      const values = { script: 'Han', url: 'https://example.org/book', ids: '⿰木木', title: 'Source', author: 'Author', publisher: 'Publisher', year: '1900', page: '12', note: 'Notes' }
      await expect(actions.default!(event(values, DB))).rejects.toMatchObject({ status: 303, location: '/entry/1' })
      const listing = await list({ platform: { env: { DB } }, url: new URL('https://example.test/') } as any) as any
      expect(listing.entries[0]).toMatchObject({ id: 1, ids: values.ids, place: values.url })
      const result = await detail({ platform: { env: { DB } }, params: { id: '1' } } as any) as any
      expect(result.entry).toMatchObject(values)
      expect(result.entry.place).toBe(values.url)
      // Server load results are serialized into the public page payload.
      expect(JSON.stringify(result)).not.toContain('creator_id')
      expect(JSON.stringify(listing)).not.toContain('creator_id')
      const creator = (db.query('SELECT creator_id FROM entries WHERE id = 1').get() as { creator_id: string }).creator_id
      expect(JSON.stringify(result)).not.toContain(creator)
      expect(JSON.stringify(listing)).not.toContain(creator)
      expect(Object.keys(result.entry)).toEqual(['id', 'script', 'ids', 'description', 'place', 'url', 'title', 'author', 'publisher', 'year', 'page', 'note', 'created_at'])
    } finally { db.close() }
  })

  test('sets the bearer only after a successful atomic creation', async () => {
    const db = new Database(':memory:')
    try {
      db.exec(readFileSync(new URL('../../migrations/0001_init.sql', import.meta.url), 'utf8'))
      db.exec(readFileSync(new URL('../../migrations/0002_entry_visibility.sql', import.meta.url), 'utf8'))
      db.exec(readFileSync(new URL('../../migrations/0003_related_characters.sql', import.meta.url), 'utf8'))
      db.exec(readFileSync(new URL('../../migrations/0004_attribution.sql', import.meta.url), 'utf8'))
      const e = event({ script: 'Han', url: 'https://example.org/' }, binding(db))
      const set: any[] = []
      e.cookies.set = (...args: any[]) => set.push(args)
      await expect(actions.default!(e)).rejects.toMatchObject({ status: 303 })
      expect(set).toHaveLength(1)
      expect(set[0][0]).toBe('__Host-contributor')
      expect(set[0][2]).toEqual({ path: '/', httpOnly: true, sameSite: 'lax', secure: true, maxAge: 31536000 })
      db.exec("CREATE TRIGGER fail_entry BEFORE INSERT ON entries BEGIN SELECT RAISE(ABORT, 'failure'); END")
      set.length = 0
      await expect(actions.default!(e)).rejects.toThrow()
      expect(set).toHaveLength(0)
      expect((db.query('SELECT count(*) AS n FROM persons').get() as any).n).toBe(1)
    } finally { db.close() }
  })
  test('concurrent first submissions each receive their own bearer', async () => {
    const db = new Database(':memory:')
    try {
      db.exec(readFileSync(new URL('../../migrations/0001_init.sql', import.meta.url), 'utf8'))
      db.exec(readFileSync(new URL('../../migrations/0002_entry_visibility.sql', import.meta.url), 'utf8'))
      db.exec(readFileSync(new URL('../../migrations/0003_related_characters.sql', import.meta.url), 'utf8'))
      db.exec(readFileSync(new URL('../../migrations/0004_attribution.sql', import.meta.url), 'utf8'))
      const issued: string[] = []
      const makeEvent = () => {
        const e = event({ script: 'Han', url: 'https://example.org/' }, binding(db))
        e.cookies.set = (_name: string, value: string) => issued.push(value)
        return e
      }
      const results = await Promise.allSettled([actions.default!(makeEvent()), actions.default!(makeEvent())])
      expect(results.every(result => result.status === 'rejected' && result.reason.status === 303)).toBe(true)
      expect(issued).toHaveLength(2)
      expect(new Set(issued).size).toBe(2)
      expect((db.query('SELECT count(DISTINCT creator_id) AS n FROM entries').get() as any).n).toBe(2)
    } finally { db.close() }
  })
  test('rejects non-loopback HTTP without writing or setting a cookie', async () => {
    const e = event({ script: 'Han', url: 'https://example.org/' }, {})
    e.url = new URL('http://example.test/new')
    await expect(actions.default!(e)).rejects.toMatchObject({ status: 403 })
  })
  test('migration preserves existing entries and visibility applies to every public read', async () => {
    const db = new Database(':memory:')
    try {
      db.exec(readFileSync(new URL('../../migrations/0001_init.sql', import.meta.url), 'utf8'))
      db.exec("INSERT INTO entries (script, place, url, created_at) VALUES ('old', 'book', 'https://example.org', '2026')")
      db.exec(readFileSync(new URL('../../migrations/0002_entry_visibility.sql', import.meta.url), 'utf8'))
db.exec(readFileSync(new URL('../../migrations/0003_related_characters.sql', import.meta.url), 'utf8'))
db.exec(readFileSync(new URL('../../migrations/0004_attribution.sql', import.meta.url), 'utf8'))
      expect(db.query('SELECT visible FROM entries WHERE id = 1').get()).toEqual({ visible: 1 })
      expect(() => db.exec('UPDATE entries SET visible = 2 WHERE id = 1')).toThrow()
      const DB = binding(db)
      const oldEntry = await detail({ platform: { env: { DB } }, params: { id: '1' } } as any) as any
      expect(oldEntry.entry.script).toBe('old')
      await expect(actions.default!(event({ script: 'created', url: 'https://example.org' }, DB))).rejects.toMatchObject({ status: 303, location: '/entry/2' })
      expect((await detail({ platform: { env: { DB } }, params: { id: '2' } } as any) as any).entry.script).toBe('created')
      db.exec('UPDATE entries SET visible = 0 WHERE id = 2')
      for (let i = 0; i < 45; i++) {
        db.query('INSERT INTO entries (script, place, url, created_at, visible) VALUES (?, ?, ?, ?, ?)').run('new', 'book', 'https://example.org', '2026', i % 2)
      }
      db.exec('UPDATE entries SET visible = 0 WHERE id = 1')
      const ids: number[] = []
      let before: number | null = null
      do {
        const url = new URL('https://example.test/')
        if (before) url.searchParams.set('before', String(before))
        const page = await list({ platform: { env: { DB } }, url } as any) as any
        ids.push(...page.entries.map((entry: { id: number }) => entry.id))
        before = page.next
      } while (before)
      expect(ids).toEqual((db.query('SELECT id FROM entries WHERE visible = 1 ORDER BY id DESC').all() as { id: number }[]).map(row => row.id))
      expect(ids.length).toBe(22)
      for (const id of [1, 2]) {
        await expect(detail({ platform: { env: { DB } }, params: { id: String(id) } } as any)).rejects.toMatchObject({ status: 404 })
      }
      expect((await detail({ platform: { env: { DB } }, params: { id: '4' } } as any) as any).entry.id).toBe(4)
    } finally { db.close() }
  })
  test('pagination handles empty, all-hidden, 20 and 21 visible entries', async () => {
    const db = new Database(':memory:')
    try {
      db.exec(readFileSync(new URL('../../migrations/0001_init.sql', import.meta.url), 'utf8'))
      db.exec(readFileSync(new URL('../../migrations/0002_entry_visibility.sql', import.meta.url), 'utf8'))
      const DB = binding(db)
      const page = async (before?: number) => {
        const url = new URL('https://example.test/')
        if (before !== undefined) url.searchParams.set('before', String(before))
        return await list({ platform: { env: { DB } }, url } as any) as any
      }
      expect(await page()).toEqual({ entries: [], next: null })
      const insert = db.query("INSERT INTO entries (script, place, url, created_at, visible) VALUES ('Han', 'book', 'https://example.org', '2026', ?)")
      for (let i = 0; i < 21; i++) insert.run(0)
      expect(await page()).toEqual({ entries: [], next: null })
      db.exec('UPDATE entries SET visible = 1 WHERE id <= 20')
      const twenty = await page()
      expect(twenty.entries).toHaveLength(20)
      expect(twenty.next).toBeNull()
      db.exec('UPDATE entries SET visible = 1 WHERE id = 21')
      const first = await page()
      expect(first.entries).toHaveLength(20)
      expect(first.next).toBe(2)
      const last = await page(first.next)
      expect(last.entries.map((entry: { id: number }) => entry.id)).toEqual([1])
      expect(last.next).toBeNull()
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
