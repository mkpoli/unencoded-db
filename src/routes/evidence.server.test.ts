import { describe, expect, test } from 'bun:test'
import { PNG_BYTES, createTestDatabase, d1Binding, fakeImages, imageFile } from '../test-support'
import { MAX_IMAGE_BYTES } from '../lib/server/images'
import { actions, load as newForm } from './[locale]/new/+page.server'
import { actions as batchActions } from './[locale]/batch/+page.server'
import { load as list } from './[locale]/+page.server'
import { actions as entryActions } from './[locale]/entry/[id]/+page.server'
import { load as detail } from './[locale]/entry/[id]/+page.server'

function testCookies() {
  const jar = new Map<string, string>()
  return { jar, cookies: { get: (name: string) => jar.get(name), set: (name: string, value: string) => { jar.set(name, value) } } }
}

function event(values: Record<string, string>, DB: unknown, images: ReturnType<typeof fakeImages>, image: File | null = imageFile(PNG_BYTES), locale = 'en', requestUrl = `https://example.test/${locale}/new`) {
  const form = new FormData()
  for (const [key, value] of Object.entries(values)) form.set(key, value)
  if (image !== null) form.set('image', image)
  const { jar, cookies } = testCookies()
  return {
    request: new Request(requestUrl, { method: 'POST', body: form }),
    url: new URL(requestUrl),
    cookies,
    jar,
    platform: { env: { DB, IMAGES: images.bucket } },
    params: { locale },
  } as any
}

const record = {
  script: 'Han',
  ids: '⿰木木',
  place: 'Book',
  title: 'Source',
  author: 'Author',
  publisher: 'Publisher',
  year: '1900',
  page: '12',
  note: 'Notes',
}

function comparisonEvent(rows: Record<string, string>[], DB: unknown, images: ReturnType<typeof fakeImages>, locale = 'en', requestUrl = `https://example.test/${locale}/new`) {
  const form = new FormData()
  for (const [key, value] of Object.entries(record)) form.set(key, value)
  form.set('image', imageFile(PNG_BYTES))
  for (const row of rows) for (const [key, value] of Object.entries(row)) form.append(`comparison_${key}`, value)
  const { jar, cookies } = testCookies()
  return {
    request: new Request(requestUrl, { method: 'POST', body: form }),
    url: new URL(requestUrl),
    cookies,
    jar,
    platform: { env: { DB, IMAGES: images.bucket } },
    params: { locale },
  } as any
}

const comparison = { character: '漢', relationship: 'not_variant', differences: 'Different component', evidence: 'Source page 4' }

describe('evidence routes', () => {
  test('batch creates one character per row from one source', async () => {
    const db = createTestDatabase()
    const images = fakeImages()
    try {
      const form = new FormData()
      form.set('place', 'Book')
      form.set('image', imageFile(PNG_BYTES))
      form.append('script', 'Han')
      form.append('script', 'Tangut')
      form.append('ids', '⿰木木')
      form.append('ids', '⿱日木')
      const { jar, cookies } = testCookies()
      const event = {
        request: new Request('https://example.test/en/batch', { method: 'POST', body: form }),
        url: new URL('https://example.test/en/batch'),
        cookies,
        platform: { env: { DB: d1Binding(db), IMAGES: images.bucket } },
        params: { locale: 'en' },
      } as any
      await expect(batchActions.default!(event)).rejects.toMatchObject({ status: 303, location: '/en/entry/1' })
      expect((db.query('SELECT count(*) AS n FROM entries').get() as { n: number }).n).toBe(2)
      expect((db.query('SELECT count(*) AS n FROM evidence').get() as { n: number }).n).toBe(2)
      expect(jar.size).toBe(1)
    } finally { db.close() }
  })

  test('persists multiple comparisons and displays their explanations', async () => {
    const db = createTestDatabase()
    const images = fakeImages()
    try {
      const DB = d1Binding(db)
      const rows = [comparison, { ...comparison, character: '字', relationship: 'uncertain' }]
      await expect(actions.default!(comparisonEvent(rows, DB, images))).rejects.toMatchObject({ status: 303, location: '/en/entry/1' })
      const result = await detail({ platform: { env: { DB } }, params: { locale: 'en', id: '1' } } as any) as any
      expect(result.comparisons).toEqual(rows)
      await expect(actions.default!(comparisonEvent(rows, DB, images))).rejects.toMatchObject({ status: 303, location: '/en/entry/2' })
      const second = await detail({ platform: { env: { DB } }, params: { locale: 'en', id: '2' } } as any) as any
      expect(second.comparisons).toEqual(rows)
    } finally { db.close() }
  })

  test('adds a relation with evidence and the reverse edge', async () => {
    const db = createTestDatabase()
    try {
      db.exec("INSERT INTO entries (script, place, created_at, visible) VALUES ('Han', 'Book', '2026', 1)")
      db.exec("INSERT INTO entries (script, place, created_at, visible) VALUES ('Tangut', 'Book', '2026', 1)")
      db.exec("INSERT INTO evidence (entry_id, place, created_at) VALUES (1, 'Book', '2026')")
      const form = new FormData()
      form.set('target', 'Tangut'); form.set('kind', 'sound'); form.set('evidence', '1'); form.set('difference', 'Reading')
      const event = {
        request: new Request('https://example.test/en/entry/1', { method: 'POST', body: form }),
        url: new URL('https://example.test/en/entry/1'), cookies: testCookies().cookies,
        platform: { env: { DB: d1Binding(db) } }, params: { locale: 'en', id: '1' },
      } as any
      await expect(entryActions.relation!(event)).rejects.toMatchObject({ status: 303 })
      expect(db.query('SELECT from_entry, to_entry, to_character, kind FROM relations ORDER BY id').all()).toEqual([
        { from_entry: 1, to_entry: 2, to_character: 'Tangut', kind: 'sound' },
        { from_entry: 2, to_entry: 1, to_character: 'Han', kind: 'sound' },
      ])
    } finally { db.close() }
  })

  test('stores a crop on an evidence image', async () => {
    const db = createTestDatabase()
    try {
      db.exec("INSERT INTO entries (script, place, created_at, visible) VALUES ('Han', 'Book', '2026', 1)")
      db.exec("INSERT INTO evidence (entry_id, place, created_at) VALUES (1, 'Book', '2026')")
      const form = new FormData()
      form.set('evidence', '1'); form.set('x', '10'); form.set('y', '20'); form.set('w', '30'); form.set('h', '40')
      const event = {
        request: new Request('https://example.test/en/entry/1', { method: 'POST', body: form }),
        url: new URL('https://example.test/en/entry/1'), cookies: testCookies().cookies,
        platform: { env: { DB: d1Binding(db) } }, params: { locale: 'en', id: '1' },
      } as any
      await expect(entryActions.crop!(event)).rejects.toMatchObject({ status: 303, location: '/en/entry/1' })
      expect(db.query('SELECT x, y, w, h FROM crops').get()).toEqual({ x: 10, y: 20, w: 30, h: 40 })
    } finally { db.close() }
  })

  test('suggests visible records that share an IDS', async () => {
    const db = createTestDatabase()
    try {
      db.exec("INSERT INTO entries (script, ids, place, created_at) VALUES ('Han', '⿰木木', 'Book', '2026')")
      db.exec("INSERT INTO entries (script, ids, place, created_at, visible) VALUES ('Han', '⿱日木', 'Hidden', '2026', 0)")
      const data = await newForm({ platform: { env: { DB: d1Binding(db) } } } as any) as any
      expect(data.suggestions).toEqual([{ ids: '⿰木木', script: 'Han' }])
    } finally { db.close() }
  })

  test('rejects excess and invalid comparisons without saving', async () => {
    const db = createTestDatabase()
    const images = fakeImages()
    try {
      const rows = Array.from({ length: 11 }, () => ({ ...comparison }))
      rows[10].relationship = 'wrong'
      const result = await actions.default!(comparisonEvent(rows, d1Binding(db), images)) as any
      expect(result.status).toBe(400)
      expect(result.data.comparisons.tooMany).toBe(true)
      expect(result.data.comparisons.errors[10]).toBe(true)
      expect(result.data.comparisons.rows).toEqual(rows)
      expect(db.query('SELECT COUNT(*) AS count FROM entries').get()).toEqual({ count: 0 })
      expect(images.puts).toHaveLength(0)
    } finally { db.close() }
  })

  test('rejects incomplete, overlong and misaligned rows', async () => {
    const db = createTestDatabase()
    const images = fakeImages()
    try {
      for (const row of [
        { ...comparison, character: ' ' },
        { ...comparison, evidence: 'x'.repeat(2001) },
        { character: '漢', relationship: 'variant', differences: '' },
      ]) {
        const result = await actions.default!(comparisonEvent([row], d1Binding(db), images)) as any
        expect(result.status).toBe(400)
        expect(result.data.comparisons.errors[0]).toBe(true)
      }
      expect(db.query('SELECT COUNT(*) AS count FROM entries').get()).toEqual({ count: 0 })
      expect(images.puts).toHaveLength(0)
    } finally { db.close() }
  })

  test('keeps no entry when the insert rejects comparisons', async () => {
    const db = createTestDatabase()
    const images = fakeImages()
    try {
      db.exec("CREATE TRIGGER reject_comparisons BEFORE INSERT ON entries WHEN json_array_length(NEW.comparisons) > 0 BEGIN SELECT RAISE(ABORT, 'rejected'); END")
      const result = await actions.default!(comparisonEvent([comparison], d1Binding(db), images)) as any
      expect(result.status).toBe(500)
      expect(db.query('SELECT COUNT(*) AS count FROM entries').get()).toEqual({ count: 0 })
    } finally { db.close() }
  })

  test('creates an image-backed record with bibliographic details', async () => {
    const db = createTestDatabase()
    const images = fakeImages()
    try {
      const DB = d1Binding(db)
      await expect(actions.default!(event(record, DB, images))).rejects.toMatchObject({ status: 303, location: '/en/entry/1' })

      expect(images.puts).toHaveLength(1)
      const put = images.puts[0]
      expect(put.key).toMatch(/^entries\/[0-9a-f-]{36}$/)
      expect(put.bytes).toEqual(PNG_BYTES)
      expect(put.contentType).toBe('image/png')

      const row = db.query('SELECT * FROM entries WHERE id = 1').get() as any
      expect(row).toMatchObject({ ...record, visible: 1, image_key: put.key, image_type: 'image/png', image_size: PNG_BYTES.byteLength })
      expect(row.creator_id).toMatch(/^[0-9a-f-]{36}$/)
      expect('url' in row).toBe(false)

      const listing = await list({ platform: { env: { DB } }, url: new URL('https://example.test/en') } as any) as any
      expect(listing.entries[0]).toMatchObject({ id: 1, ids: record.ids, place: record.place })

      const result = await detail({ platform: { env: { DB } }, params: { locale: 'en', id: '1' } } as any) as any
      expect(result.entry).toMatchObject({ ...record, id: 1, has_image: 1 })
      expect(result.entry.image_key).toBeUndefined()
      expect(result.entry.url).toBeUndefined()
      expect(JSON.stringify(result)).not.toContain(put.key)
    } finally { db.close() }
  })

  test('lists and renders a historical record without an image', async () => {
    const db = createTestDatabase()
    try {
      db.exec("INSERT INTO entries (script, ids, place, title, created_at) VALUES ('Han', '⿰木木', 'Book', 'Old source', '2026-01-01T00:00:00.000Z')")
      const DB = d1Binding(db)
      const listing = await list({ platform: { env: { DB } }, url: new URL('https://example.test/en') } as any) as any
      expect(listing.entries).toHaveLength(1)
      expect(listing.entries[0]).toMatchObject({ id: 1, place: 'Book' })
      const result = await detail({ platform: { env: { DB } }, params: { locale: 'en', id: '1' } } as any) as any
      expect(result.entry).toMatchObject({ id: 1, title: 'Old source', has_image: 0 })
      expect(result.entry.url).toBeUndefined()
    } finally { db.close() }
  })

  test('hides entries from listing, pagination and detail', async () => {
    const db = createTestDatabase()
    try {
      db.exec("INSERT INTO entries (script, place, created_at) VALUES ('old', 'book', '2026')")
      db.exec("INSERT INTO entries (script, place, created_at) VALUES ('hidden', 'book', '2026')")
      db.exec('UPDATE entries SET visible = 0 WHERE id = 2')
      const insert = db.query("INSERT INTO entries (script, place, created_at, visible) VALUES ('new', 'book', '2026', ?)")
      for (let i = 0; i < 45; i++) insert.run(i % 2)
      db.exec('UPDATE entries SET visible = 0 WHERE id = 1')
      const DB = d1Binding(db)
      const ids: number[] = []
      let before: number | null = null
      do {
        const url = new URL('https://example.test/en')
        if (before) url.searchParams.set('before', String(before))
        const page = await list({ platform: { env: { DB } }, url } as any) as any
        ids.push(...page.entries.map((entry: { id: number }) => entry.id))
        before = page.next
      } while (before)
      expect(ids).toEqual((db.query('SELECT id FROM entries WHERE visible = 1 ORDER BY id DESC').all() as { id: number }[]).map(row => row.id))
      expect(ids.length).toBe(22)
      for (const id of [1, 2]) {
        await expect(detail({ platform: { env: { DB } }, params: { locale: 'en', id: String(id) } } as any)).rejects.toMatchObject({ status: 404 })
      }
      expect((await detail({ platform: { env: { DB } }, params: { locale: 'en', id: '4' } } as any) as any).entry.id).toBe(4)
    } finally { db.close() }
  })

  test('pagination handles empty, all-hidden, 20 and 21 visible entries', async () => {
    const db = createTestDatabase()
    try {
      const DB = d1Binding(db)
      const page = async (before?: number) => {
        const url = new URL('https://example.test/en')
        if (before !== undefined) url.searchParams.set('before', String(before))
        return await list({ platform: { env: { DB } }, url } as any) as any
      }
      expect(await page()).toMatchObject({ entries: [], next: null, script: null, total: 0, scripts: [] })
      const insert = db.query("INSERT INTO entries (script, place, created_at, visible) VALUES ('Han', 'book', '2026', ?)")
      for (let i = 0; i < 21; i++) insert.run(0)
      expect(await page()).toMatchObject({ entries: [], next: null, script: null, total: 0, scripts: [] })
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

  test('filters by script and reports one count per script', async () => {
    const db = createTestDatabase()
    try {
      const insert = db.query("INSERT INTO entries (script, place, created_at, visible) VALUES (?, 'book', '2026', ?)")
      insert.run('Han', 1); insert.run('Han', 1); insert.run('Tangut', 1); insert.run('Kana', 0)
      const DB = d1Binding(db)
      const listAt = (query: string) => list({ platform: { env: { DB } }, url: new URL(`https://example.test/en${query}`) } as any) as any

      const filtered = await listAt('?script=Tangut')
      expect(filtered.entries.map((entry: { id: number; script: string }) => [entry.id, entry.script])).toEqual([[3, 'Tangut']])
      expect(filtered).toMatchObject({ script: 'Tangut', total: 3, scripts: [{ script: 'Han', n: 2 }, { script: 'Tangut', n: 1 }] })

      const empty = await listAt('?script=Kana')
      expect(empty.entries).toEqual([])
      expect(empty.scripts.at(-1)).toEqual({ script: 'Kana', n: 0 })

      await expect(listAt(`?script=${'x'.repeat(81)}`)).rejects.toMatchObject({ status: 404 })
      await expect(listAt('?script=%20')).rejects.toMatchObject({ status: 404 })
    } finally { db.close() }
  })

  test('accepts a citation without an image', async () => {
    const db = createTestDatabase()
    const images = fakeImages()
    try {
      await expect(actions.default!(event(record, d1Binding(db), images, null))).rejects.toMatchObject({ status: 303, location: '/en/entry/1' })
      expect(images.puts).toHaveLength(0)
      expect(db.query('SELECT COUNT(*) AS count FROM entries').get()).toEqual({ count: 1 })
    } finally { db.close() }
  })

  test('rejects SVG and HTML masquerading as images', async () => {
    const db = createTestDatabase()
    const images = fakeImages()
    try {
      const DB = d1Binding(db)
      for (const file of [
        imageFile(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>'), 'source.svg', 'image/svg+xml'),
        imageFile(new TextEncoder().encode('<!doctype html><html></html>'), 'source.png', 'image/png'),
      ]) {
        const result = await actions.default!(event(record, DB, images, file)) as any
        expect(result.status).toBe(400)
        expect(result.data.errors.image).toContain('JPEG, PNG or WebP')
      }
      expect(images.puts).toHaveLength(0)
    } finally { db.close() }
  })

  test('keeps place required', async () => {
    const db = createTestDatabase()
    const images = fakeImages()
    try {
      const withoutPlace: Record<string, string> = { ...record }
      delete withoutPlace.place
      for (const values of [{ ...record, place: '' }, withoutPlace]) {
        const result = await actions.default!(event(values, d1Binding(db), images)) as any
        expect(result.status).toBe(400)
        expect(result.data.errors.place).toContain('where the character was seen')
      }
      expect(images.puts).toHaveLength(0)
    } finally { db.close() }
  })

  test('reports field errors and preserves text', async () => {
    const db = createTestDatabase()
    const images = fakeImages()
    try {
      const result = await actions.default!(event({ script: '', place: '', title: 'x'.repeat(301), note: 'notes' }, d1Binding(db), images, null)) as any
      expect(result.status).toBe(400)
      expect(result.data.errors.script).toContain('script')
      expect(result.data.errors.place).toContain('where')
      expect(result.data.errors.title).toContain('length')
      expect(result.data.values.note).toBe('notes')
    } finally { db.close() }
  })

  test('localizes validation messages and the redirect', async () => {
    const db = createTestDatabase()
    const images = fakeImages()
    try {
      const DB = d1Binding(db)
      await expect(actions.default!(event(record, DB, images, null, 'ja'))).rejects.toMatchObject({ status: 303, location: '/ja/entry/1' })
      const unsupported = await actions.default!(event(record, DB, images, imageFile(new TextEncoder().encode('<svg/>'), 'x.svg', 'image/svg+xml'), 'zh-Hant')) as any
      expect(unsupported.data.errors.image).toBe('圖片必須是有效的JPEG、PNG或WebP檔案。')
      const empty = await actions.default!(event(record, DB, images, imageFile(new Uint8Array(), 'empty.png'), 'zh-Hans')) as any
      expect(empty.data.errors.image).toBe('图片文件为空。')
      const oversize = await actions.default!(event(record, DB, images, imageFile(new Uint8Array(MAX_IMAGE_BYTES + 1)), 'ko')) as any
      expect(oversize.data.errors.image).toBe('이미지가 8 MiB를 초과합니다.')
      const place = await actions.default!(event({ ...record, place: '' }, DB, images, imageFile(PNG_BYTES), 'vi')) as any
      expect(place.data.errors.place).toBe('Nhập nơi tìm thấy chữ (tối đa 500 ký tự).')
      expect(images.puts).toHaveLength(0)
      await expect(actions.default!(event({ ...record, ids: '⿱日木' }, DB, images, imageFile(PNG_BYTES), 'ko'))).rejects.toMatchObject({ status: 303, location: '/ko/entry/2' })
    } finally { db.close() }
  })

  test('localizes the save error', async () => {
    const images = fakeImages()
    const failing = {
      prepare: () => ({ bind: () => ({ first: async () => { throw new Error('D1 down') } }) }),
      batch: async () => { throw new Error('D1 down') },
    }
    const result = await actions.default!(event(record, failing, images, imageFile(PNG_BYTES), 'ja')) as any
    expect(result.status).toBe(500)
    expect(result.data.errors.form).toBe('記録を保存できませんでした。もう一度お試しください。')
    expect(images.puts).toHaveLength(1)
  })

  test('keeps the object when a D1 failure is ambiguous', async () => {
    const images = fakeImages()
    const failing = {
      prepare: () => ({ bind: () => ({ first: async () => { throw new Error('D1 down') } }) }),
      batch: async () => { throw new Error('D1 down') },
    }
    const result = await actions.default!(event(record, failing, images)) as any
    expect(result.status).toBe(500)
    expect(result.data.errors.form).toBe('Could not save the record. Try again.')
    expect(images.puts).toHaveLength(1)
    expect(images.deletes).toHaveLength(0)
    expect(images.objects.size).toBe(1)
    expect(JSON.stringify(result)).not.toContain('D1 down')
  })

  test('deletes the object when the insert definitely failed', async () => {
    const images = fakeImages()
    const failing = {
      prepare: () => ({ bind: () => ({ first: async () => null }) }),
      batch: async () => [{ results: [] }, { results: [] }, { results: [] }],
    }
    const result = await actions.default!(event(record, failing, images)) as any
    expect(result.status).toBe(500)
    expect(images.puts).toHaveLength(1)
    expect(images.deletes).toEqual([images.puts[0].key])
    expect(images.objects.size).toBe(0)
  })

  test('recovers the row when the insert committed before the error', async () => {
    const db = createTestDatabase()
    const images = fakeImages()
    try {
      const base = d1Binding(db)
      const failing = {
        ...base,
        prepare(sql: string) {
          if (sql.includes('INSERT INTO entries')) {
            return { bind: (...values: (string | number | null)[]) => ({ execute: () => { db.query(sql).run(...values); throw new Error('D1 network error after commit') } }) }
          }
          return base.prepare(sql)
        },
        batch: async (statements: { execute: () => unknown[] }[]) => statements.map(statement => ({ results: statement.execute() })),
      }
      await expect(actions.default!(event(record, failing, images))).rejects.toMatchObject({ status: 303, location: '/en/entry/1' })
      expect(images.deletes).toHaveLength(0)
      expect(images.objects.size).toBe(1)
      const row = db.query('SELECT image_key FROM entries WHERE id = 1').get() as { image_key: string }
      expect(images.objects.has(row.image_key)).toBe(true)
    } finally { db.close() }
  })

  test('keeps the object when a thrown insert commits later', async () => {
    const db = createTestDatabase()
    const images = fakeImages()
    try {
      const base = d1Binding(db)
      const failing = {
        ...base,
        prepare(sql: string) {
          if (sql.includes('INSERT INTO entries')) {
            return { bind: (..._values: (string | number | null)[]) => ({ execute: () => { throw new Error('network') } }) }
          }
          return base.prepare(sql)
        },
        batch: async (statements: { execute: () => unknown[] }[]) => statements.map(statement => ({ results: statement.execute() })),
      }
      const result = await actions.default!(event(record, failing, images)) as any
      expect(result.status).toBe(500)
      expect(images.deletes).toHaveLength(0)
      expect(images.objects.size).toBe(1)
      const key = images.puts[0]!.key
      db.query("INSERT INTO entries (script, place, image_key, image_type, image_size, created_at) VALUES ('Han', 'Book', ?, 'image/png', 1, '2026')").run(key)
      expect(images.objects.has(key)).toBe(true)
    } finally { db.close() }
  })

  test('stores radical and encoded-as while creating a character', async () => {
    const db = createTestDatabase()
    const images = fakeImages()
    try {
      const e = event({ ...record, radical: '木', encoded_as: 'U+2A6D6' }, d1Binding(db), images)
      await expect(actions.default!(e)).rejects.toMatchObject({ status: 303 })
      expect(db.query('SELECT radical, encoded_as FROM entries WHERE id = 1').get()).toEqual({ radical: '木', encoded_as: 'U+2A6D6' })
    } finally { db.close() }
  })

  test('stores free-form character tags', async () => {
    const db = createTestDatabase()
    const images = fakeImages()
    try {
      const e = event({ ...record, tags: '客話, 木' }, d1Binding(db), images)
      await expect(actions.default!(e)).rejects.toMatchObject({ status: 303 })
      expect(db.query('SELECT tag FROM character_tags ORDER BY tag').all()).toEqual([{ tag: '客話' }, { tag: '木' }])
    } finally { db.close() }
  })

  test('stores multiple senses for one character', async () => {
    const db = createTestDatabase()
    const images = fakeImages()
    try {
      const e = event({ ...record, sense_gloss: 'river', sense_reading: 'he' }, d1Binding(db), images)
      await expect(actions.default!(e)).rejects.toMatchObject({ status: 303 })
      expect(db.query('SELECT gloss, reading FROM senses ORDER BY id').all()).toEqual([{ gloss: 'river', reading: 'he' }])
    } finally { db.close() }
  })

  test('sets the bearer only after a successful atomic creation', async () => {
    const db = createTestDatabase()
    const images = fakeImages()
    try {
      const e = event(record, d1Binding(db), images)
      const set: any[] = []
      e.cookies.set = (...args: any[]) => set.push(args)
      await expect(actions.default!(e)).rejects.toMatchObject({ status: 303, location: '/en/entry/1' })
      expect(set).toHaveLength(1)
      expect(set[0][0]).toBe('__Host-contributor')
      expect(set[0][2]).toEqual({ path: '/', httpOnly: true, sameSite: 'lax', secure: true, maxAge: 31536000 })
      expect(db.query('SELECT count(*) AS n FROM persons').get()).toEqual({ n: 1 })
      expect(db.query('SELECT count(*) AS n FROM contributor_sessions').get()).toEqual({ n: 1 })
      expect((db.query('SELECT creator_id FROM entries WHERE id = 1').get() as any).creator_id).toBeTruthy()

      db.exec("CREATE TRIGGER fail_entry BEFORE INSERT ON entries BEGIN SELECT RAISE(ABORT, 'failure'); END")
      set.length = 0
      const failed = await actions.default!(event(record, d1Binding(db), images)) as any
      expect(failed.status).toBe(500)
      expect(set).toHaveLength(0)
      expect(db.query('SELECT count(*) AS n FROM persons').get()).toEqual({ n: 1 })
    } finally { db.close() }
  })

  test('concurrent first submissions each receive their own bearer', async () => {
    const db = createTestDatabase()
    const images = fakeImages()
    try {
      const issued: string[] = []
      const submit = () => {
        const e = event(record, d1Binding(db), images)
        e.cookies.set = (_name: string, value: string) => issued.push(value)
        return actions.default!(e)
      }
      const results = await Promise.allSettled([submit(), submit()])
      expect(results.every(result => result.status === 'rejected' && (result.reason as { status?: number }).status === 303)).toBe(true)
      expect(issued).toHaveLength(2)
      expect(new Set(issued).size).toBe(2)
      expect((db.query('SELECT count(DISTINCT creator_id) AS n FROM entries').get() as any).n).toBe(2)
    } finally { db.close() }
  })

  test('rejects non-loopback HTTP without writing an image or setting a cookie', async () => {
    const images = fakeImages()
    const e = event(record, {}, images, imageFile(PNG_BYTES), 'en', 'http://example.test/en/new')
    await expect(actions.default!(e)).rejects.toMatchObject({ status: 403 })
    expect(images.puts).toHaveLength(0)
    expect(e.jar.size).toBe(0)
  })

  test('stores a source URL on the evidence', async () => {
    const db = createTestDatabase()
    const images = fakeImages()
    try {
      const DB = d1Binding(db)
      await expect(actions.default!(event({ ...record, url: 'https://example.org/source' }, DB, images))).rejects.toMatchObject({ status: 303 })
      const result = await detail({ platform: { env: { DB } }, params: { locale: 'en', id: '1' } } as any) as any
      expect(result.evidence[0].url).toBe('https://example.org/source')
    } finally { db.close() }
  })
})
