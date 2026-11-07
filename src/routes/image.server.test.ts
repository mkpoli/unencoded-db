import { describe, expect, test } from 'bun:test'
import { PNG_BYTES, createTestDatabase, d1Binding, fakeImages } from '../test-support'
import { load as detail } from './entry/[id]/+page.server'
import { GET } from './entry/[id]/image/+server'
import { load as list } from './+page.server'

const KEY = 'entries/11111111-1111-4111-8111-111111111111'

function insertRecord(db: ReturnType<typeof createTestDatabase>, image: { key: string | null; type: string | null; size: number | null; visible?: number } = { key: KEY, type: 'image/png', size: PNG_BYTES.byteLength }) {
  db.prepare('INSERT INTO entries (script, ids, place, image_key, image_type, image_size, visible, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run('Han', '⿰木木', 'Book', image.key, image.type, image.size, image.visible ?? 1, '2026-01-01T00:00:00.000Z')
  return d1Binding(db)
}

function requestEvent(DB: unknown, images: ReturnType<typeof fakeImages>, id = '1') {
  return { params: { id }, platform: { env: { DB, IMAGES: images.bucket } } } as any
}

describe('entry image route', () => {
  test('streams the stored object with the stored type and cache headers', async () => {
    const db = createTestDatabase()
    const images = fakeImages()
    try {
      const DB = insertRecord(db)
      await images.bucket.put(KEY, PNG_BYTES, { httpMetadata: { contentType: 'image/png' } })
      const response = await GET(requestEvent(DB, images))
      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toBe('image/png')
      expect(response.headers.get('x-content-type-options')).toBe('nosniff')
      expect(response.headers.get('cache-control')).toBe('no-store')
      expect(response.headers.get('content-length')).toBe(String(PNG_BYTES.byteLength))
      expect(new Uint8Array(await response.arrayBuffer())).toEqual(PNG_BYTES)
      expect(images.gets).toEqual([KEY])
    } finally { db.close() }
  })

  test('uses the stored content type instead of object metadata', async () => {
    const db = createTestDatabase()
    const images = fakeImages()
    try {
      const DB = insertRecord(db, { key: KEY, type: 'image/webp', size: PNG_BYTES.byteLength })
      await images.bucket.put(KEY, PNG_BYTES, { httpMetadata: { contentType: 'application/octet-stream' } })
      const response = await GET(requestEvent(DB, images))
      expect(response.headers.get('content-type')).toBe('image/webp')
    } finally { db.close() }
  })

  test('returns 404 for a hidden record without reading the object', async () => {
    const db = createTestDatabase()
    const images = fakeImages()
    try {
      const DB = insertRecord(db, { key: KEY, type: 'image/png', size: PNG_BYTES.byteLength, visible: 0 })
      await images.bucket.put(KEY, PNG_BYTES, { httpMetadata: { contentType: 'image/png' } })
      await expect(GET(requestEvent(DB, images))).rejects.toMatchObject({ status: 404 })
      expect(images.gets).toHaveLength(0)
    } finally { db.close() }
  })

  test('returns 404 when the record has no image', async () => {
    const db = createTestDatabase()
    const images = fakeImages()
    try {
      const DB = insertRecord(db, { key: null, type: null, size: null })
      await expect(GET(requestEvent(DB, images))).rejects.toMatchObject({ status: 404 })
      expect(images.gets).toHaveLength(0)
    } finally { db.close() }
  })

  test('returns 404 when the stored object is missing', async () => {
    const db = createTestDatabase()
    const images = fakeImages()
    try {
      const DB = insertRecord(db)
      await expect(GET(requestEvent(DB, images))).rejects.toMatchObject({ status: 404 })
      expect(images.gets).toEqual([KEY])
    } finally { db.close() }
  })

  test('returns 404 for a missing record or invalid id', async () => {
    const db = createTestDatabase()
    const images = fakeImages()
    try {
      const DB = d1Binding(db)
      await expect(GET(requestEvent(DB, images, '99'))).rejects.toMatchObject({ status: 404 })
      await expect(GET(requestEvent(DB, images, 'not-a-number'))).rejects.toMatchObject({ status: 404 })
    } finally { db.close() }
  })

  test('never exposes the object key in page data', async () => {
    const db = createTestDatabase()
    const images = fakeImages()
    try {
      const DB = insertRecord(db)
      await images.bucket.put(KEY, PNG_BYTES, { httpMetadata: { contentType: 'image/png' } })
      const entry = await detail(requestEvent(DB, images)) as any
      const entries = await list({ platform: { env: { DB } }, url: new URL('https://example.test/') } as any) as any
      expect(JSON.stringify(entry)).not.toContain(KEY)
      expect(JSON.stringify(entries)).not.toContain(KEY)
      expect(entry.entry.image_key).toBeUndefined()
      expect(entry.entry.image_type).toBeUndefined()
      expect(entry.entry.image_size).toBeUndefined()
    } finally { db.close() }
  })
})
