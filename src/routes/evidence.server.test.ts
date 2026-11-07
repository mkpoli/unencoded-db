import { describe, expect, test } from 'bun:test'
import { PNG_BYTES, createTestDatabase, d1Binding, fakeImages, imageFile } from '../test-support'
import { MAX_IMAGE_BYTES } from '../lib/server/images'
import { actions } from './[locale]/new/+page.server'
import { load as list } from './[locale]/+page.server'
import { load as detail } from './[locale]/entry/[id]/+page.server'

function event(values: Record<string, string>, DB: unknown, images: ReturnType<typeof fakeImages>, image: File | null = imageFile(PNG_BYTES), locale = 'en') {
  const form = new FormData()
  for (const [key, value] of Object.entries(values)) form.set(key, value)
  if (image !== null) form.set('image', image)
  return {
    request: new Request(`https://example.test/${locale}/new`, { method: 'POST', body: form }),
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

describe('evidence routes', () => {
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
      expect(await page()).toEqual({ entries: [], next: null })
      const insert = db.query("INSERT INTO entries (script, place, created_at, visible) VALUES ('Han', 'book', '2026', ?)")
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

  test('requires an image for a new record', async () => {
    const db = createTestDatabase()
    const images = fakeImages()
    try {
      const result = await actions.default!(event(record, d1Binding(db), images, null)) as any
      expect(result.status).toBe(400)
      expect(result.data.errors.image).toContain('source image')
      expect(images.puts).toHaveLength(0)
      expect(db.query('SELECT COUNT(*) AS count FROM entries').get()).toEqual({ count: 0 })
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
      expect(result.data.errors.image).toBeDefined()
      expect(result.data.values.note).toBe('notes')
    } finally { db.close() }
  })

  test('localizes validation messages and the redirect', async () => {
    const db = createTestDatabase()
    const images = fakeImages()
    try {
      const DB = d1Binding(db)
      const missing = await actions.default!(event(record, DB, images, null, 'ja')) as any
      expect(missing.data.errors.image).toBe('出典画像を選択してください。JPEG、PNG、WebPのいずれか、8 MiBまでです。')
      const unsupported = await actions.default!(event(record, DB, images, imageFile(new TextEncoder().encode('<svg/>'), 'x.svg', 'image/svg+xml'), 'zh-Hant')) as any
      expect(unsupported.data.errors.image).toBe('圖片必須是JPEG、PNG或WebP檔案。')
      const empty = await actions.default!(event(record, DB, images, imageFile(new Uint8Array(), 'empty.png'), 'zh-Hans')) as any
      expect(empty.data.errors.image).toBe('图片文件为空。')
      const oversize = await actions.default!(event(record, DB, images, imageFile(new Uint8Array(MAX_IMAGE_BYTES + 1)), 'ko')) as any
      expect(oversize.data.errors.image).toBe('이미지가 8 MiB를 초과합니다.')
      const place = await actions.default!(event({ ...record, place: '' }, DB, images, imageFile(PNG_BYTES), 'vi')) as any
      expect(place.data.errors.place).toBe('Nhập nơi tìm thấy chữ (tối đa 500 ký tự).')
      expect(images.puts).toHaveLength(0)
      await expect(actions.default!(event(record, DB, images, imageFile(PNG_BYTES), 'ko'))).rejects.toMatchObject({ status: 303, location: '/ko/entry/1' })
    } finally { db.close() }
  })

  test('localizes the save error', async () => {
    const images = fakeImages()
    const failing = { prepare: () => ({ bind: () => ({ first: async () => { throw new Error('D1 down') } }) }) }
    const result = await actions.default!(event(record, failing, images, imageFile(PNG_BYTES), 'ja')) as any
    expect(result.status).toBe(500)
    expect(result.data.errors.form).toBe('記録を保存できませんでした。もう一度お試しください。')
    expect(images.puts).toHaveLength(1)
  })

  test('keeps the object when a D1 failure is ambiguous', async () => {
    const images = fakeImages()
    const failing = { prepare: () => ({ bind: () => ({ first: async () => { throw new Error('D1 down') } }) }) }
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
    const failing = { prepare: () => ({ bind: () => ({ first: async () => null }) }) }
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
        prepare(sql: string) {
          if (sql.includes('INSERT INTO entries')) {
            return { bind: (...values: (string | number | null)[]) => ({ first: async () => { db.query(sql).run(...values); throw new Error('D1 network error after commit') } }) }
          }
          return base.prepare(sql)
        },
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
      let key = ''
      const failing = {
        prepare(sql: string) {
          if (sql.includes('INSERT INTO entries')) {
            return { bind: (...values: (string | number | null)[]) => ({ first: async () => { key = String(values[10]); throw new Error('network') } }) }
          }
          return base.prepare(sql)
        },
      }
      const result = await actions.default!(event(record, failing, images)) as any
      expect(result.status).toBe(500)
      expect(images.deletes).toHaveLength(0)
      expect(images.objects.size).toBe(1)
      db.query("INSERT INTO entries (script, place, image_key, image_type, image_size, created_at) VALUES ('Han', 'Book', ?, 'image/png', 1, '2026')").run(key)
      expect(images.objects.has(key)).toBe(true)
    } finally { db.close() }
  })

  test('ignores a submitted source URL', async () => {
    const db = createTestDatabase()
    const images = fakeImages()
    try {
      const DB = d1Binding(db)
      await expect(actions.default!(event({ ...record, url: 'https://example.org/source' }, DB, images))).rejects.toMatchObject({ status: 303 })
      const row = db.query('SELECT * FROM entries WHERE id = 1').get() as any
      expect('url' in row).toBe(false)
      const result = await detail({ platform: { env: { DB } }, params: { locale: 'en', id: '1' } } as any) as any
      expect(JSON.stringify(result)).not.toContain('example.org')
    } finally { db.close() }
  })
})
