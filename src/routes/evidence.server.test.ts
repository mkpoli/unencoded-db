import { describe, expect, test } from 'bun:test'
import { actions } from './new/+page.server'
import { GET } from './media/[key]/+server'

function event(values: Record<string, string | File>, db: unknown, media: unknown) {
  const form = new FormData()
  for (const [key, value] of Object.entries(values)) form.set(key, value)
  return { request: new Request('https://example.test/new', { method: 'POST', body: form }), platform: { env: { DB: db, MEDIA: media } } } as any
}

describe('evidence routes', () => {
  test('creates an anonymous record with a source and redirects', async () => {
    let statement = '', bound: unknown[] = []
    const db = { prepare(sql: string) { statement = sql; return { bind(...values: unknown[]) { bound = values; return { first: async () => ({ id: 7 }) } } } } }
    const result = actions.default!(event({ script: 'Han', url: 'https://example.org/book', title: 'Source' }, db, {}))
    await expect(result).rejects.toMatchObject({ status: 303, location: '/entry/7' })
    expect(statement).toContain('INSERT INTO entries')
    expect(bound).toContain('https://example.org/book')
    expect(bound).toContain('Source')
  })
  test('rejects records without an image or URL', async () => {
    const result = await actions.default!(event({ script: 'Han', place: 'book' }, {}, {})) as any
    expect(result.status).toBe(400)
  })
  test('reports missing source fields and preserves all text', async () => {
    const result = await actions.default!(event({ script: 'Han', title: '  My title  ', note: 'notes' }, {}, {})) as any
    expect(result.status).toBe(400)
    expect(result.data.errors.place).toContain('place or source URL')
    expect(result.data.errors.image).toContain('image or source URL')
    expect(result.data.values.title).toBe('  My title  ')
    expect(result.data.values.note).toBe('notes')
  })
  test('reports specific field errors together', async () => {
    const result = await actions.default!(event({ script: '', url: 'ftp://example.org/', title: 'x'.repeat(301) }, {}, {})) as any
    expect(result.data.errors.script).toContain('script')
    expect(result.data.errors.url).toContain('HTTP or HTTPS')
    expect(result.data.errors.title).toContain('length')
    expect(result.data.values.url).toBe('ftp://example.org/')
  })
  test('rejects EXIF images with guidance and asks for reselection', async () => {
    const exif = new TextEncoder().encode('Exif\0\0GPSDATA')
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0, exif.length + 2, ...exif, 0xff, 0xc0, 0, 11, 8, 1, 0xe0, 2, 0x80, 1, 1, 0x11, 0, 0xff, 0xda, 0, 2, 9, 9, 9, 0xff, 0xd9])
    const result = await actions.default!(event({ script: 'Han', place: 'Book', title: 'Source', image: new File([jpeg], 'photo.jpg', { type: 'image/jpeg' }) }, {}, {})) as any
    expect(result.status).toBe(400)
    expect(result.data.errors.image).toContain('without EXIF')
    expect(result.data.reselectImage).toBe(true)
    expect(result.data.values.title).toBe('Source')
  })
  test('asks for image reselection when another field fails', async () => {
    const png = await Bun.file(new URL('../lib/server/fixtures/sample.png', import.meta.url)).arrayBuffer()
    const result = await actions.default!(event({ script: '', place: 'Book', image: new File([png], 'photo.png') }, {}, {})) as any
    expect(result.data.errors.script).toBeDefined()
    expect(result.data.errors.image).toBeUndefined()
    expect(result.data.reselectImage).toBe(true)
  })
  test('requires a place even with a valid image', async () => {
    const png = await Bun.file(new URL('../lib/server/fixtures/sample.png', import.meta.url)).arrayBuffer()
    const result = await actions.default!(event({ script: 'Han', image: new File([png], 'photo.png') }, {}, {})) as any
    expect(result.data.errors.place).toContain('place or source URL')
    expect(result.data.errors.image).toBeUndefined()
    expect(result.data.reselectImage).toBe(true)
  })
  test('does not serve an unreferenced object', async () => {
    let fetched = false
    const platform = { env: { DB: { prepare: () => ({ bind: () => ({ first: async () => null }) }) }, MEDIA: { get: async () => { fetched = true } } } }
    const response = await GET({ params: { key: `${'a'.repeat(64)}.png` }, platform } as any)
    expect(response.status).toBe(404)
    expect(fetched).toBe(false)
  })
})
