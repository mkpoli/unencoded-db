import { describe, expect, test } from 'bun:test'
import { PNG_BYTES, createTestDatabase, d1Binding, fakeImages, imageFile } from '../test-support'
import { actions } from './[locale]/entry/[id]/edit/+page.server'

function setup() {
  const db = createTestDatabase()
  db.exec("INSERT INTO entries (id, script, ids, place, note, created_at, revision, edit_generation) VALUES (1, 'Han', '⿰木木', 'First place', 'First note', '2026-01-01T00:00:00.000Z', 1, 1)")
  db.exec("INSERT INTO evidence (id, entry_id, place, note, date_precision, created_at) VALUES (1, 1, 'First place', 'First note', 'text', '2026-01-01T00:00:00.000Z')")
  db.exec("INSERT INTO evidence (id, entry_id, place, note, date_precision, created_at) VALUES (2, 1, 'Second place', 'Second note', 'text', '2026-01-02T00:00:00.000Z')")
  return db
}

function event(db: ReturnType<typeof createTestDatabase>, images: ReturnType<typeof fakeImages>, values: Record<string, string>, image: File | null = null, types: string[] = []) {
  const form = new FormData()
  for (const [key, value] of Object.entries(values)) form.set(key, value)
  for (const type of types) form.append('types', type)
  if (image) form.set('image', image)
  return {
    params: { locale: 'en', id: '1' },
    cookies: { get: () => undefined },
    platform: { env: { DB: d1Binding(db), IMAGES: images.bucket } },
    request: new Request('https://example.test/en/entry/1/edit', { method: 'POST', body: form }),
    url: new URL('https://example.test/en/entry/1/edit'),
  } as any
}

const base = { evidence: '2', place: 'Second place', note: 'Second note', revision: '1', edit_generation: '1' }

describe('evidence editing', () => {
  test('changes one later evidence record without touching the entry mirror', async () => {
    const db = setup()
    const images = fakeImages()
    try {
      await expect(actions.evidence!(event(db, images, { ...base, place: 'Changed place', note: 'Changed note' }))).rejects.toMatchObject({ status: 303, location: '/en/entry/1/edit#evidence-2' })
      expect(db.query('SELECT place, note FROM evidence WHERE id = 2').get()).toEqual({ place: 'Changed place', note: 'Changed note' })
      expect(db.query('SELECT place, note FROM evidence WHERE id = 1').get()).toEqual({ place: 'First place', note: 'First note' })
      expect(db.query('SELECT place, note, revision FROM entries').get()).toEqual({ place: 'First place', note: 'First note', revision: 1 })
      db.exec('UPDATE entries SET revision = revision + 1')
      const stale = await actions.evidence!(event(db, images, { ...base, note: 'Stale' })) as any
      expect(stale.status).toBe(409)
      expect(db.query('SELECT note FROM evidence WHERE id = 2').get()).toEqual({ note: 'Changed note' })
    } finally { db.close() }
  })

  test('mirrors the first evidence and advances the entry revision', async () => {
    const db = setup()
    const images = fakeImages()
    try {
      await expect(actions.evidence!(event(db, images, { ...base, evidence: '1', place: 'New source', note: 'New note' }))).rejects.toMatchObject({ status: 303 })
      expect(db.query('SELECT place, note, revision FROM entries').get()).toEqual({ place: 'New source', note: 'New note', revision: 2 })
      expect(db.query('SELECT place, note FROM evidence WHERE id = 1').get()).toEqual({ place: 'New source', note: 'New note' })
      expect(db.query('SELECT revision, place, note FROM entry_revisions ORDER BY revision DESC LIMIT 1').get()).toEqual({ revision: 2, place: 'New source', note: 'New note' })
    } finally { db.close() }
  })

  test('stores the source types of an evidence record', async () => {
    const db = setup()
    const images = fakeImages()
    try {
      await expect(actions.evidence!(event(db, images, base, null, ['reading', 'attestation']))).rejects.toMatchObject({ status: 303 })
      expect(db.query('SELECT types FROM evidence WHERE id = 2').get()).toEqual({ types: '["attestation","reading"]' })
      expect(db.query('SELECT types FROM evidence WHERE id = 1').get()).toEqual({ types: '[]' })
    } finally { db.close() }
  })

  test('adds evidence with source types', async () => {
    const db = setup()
    const images = fakeImages()
    try {
      await expect(actions.addEvidence!(event(db, images, { place: 'Third place' }, null, ['mention', 'relation']))).rejects.toMatchObject({ status: 303 })
      expect(db.query("SELECT types FROM evidence WHERE place = 'Third place'").get()).toEqual({ types: '["mention","relation"]' })
    } finally { db.close() }
  })

  test('replaces an image, discards the old object and drops stale crops', async () => {
    const db = setup()
    const images = fakeImages()
    try {
      db.exec("UPDATE evidence SET image_key = 'entries/old', image_type = 'image/png', image_size = 1 WHERE id = 2")
      db.exec("INSERT INTO crops (evidence_id, x, y, w, h, created_at) VALUES (2, 0, 0, 50, 50, '2026')")
      await expect(actions.evidence!(event(db, images, { ...base, place: 'Changed place' }, imageFile(PNG_BYTES)))).rejects.toMatchObject({ status: 303 })
      expect(images.puts).toHaveLength(1)
      expect(images.deletes).toContain('entries/old')
      expect(db.query('SELECT image_key FROM evidence WHERE id = 2').get()).toEqual({ image_key: images.puts[0]!.key })
      expect(db.query('SELECT count(*) AS n FROM crops WHERE evidence_id = 2').get()).toEqual({ n: 0 })
    } finally { db.close() }
  })

  test('promotes the first remaining picture after removing the cover', async () => {
    const db = setup()
    const images = fakeImages()
    try {
      db.exec("INSERT INTO media (id, key, type, size, created_at) VALUES (10, 'entries/a', 'image/png', 1, '2026'), (11, 'entries/b', 'image/png', 1, '2026'), (12, 'entries/c', 'image/png', 1, '2026')")
      db.exec("INSERT INTO evidence_media (evidence_id, media_id) VALUES (2, 10), (2, 11), (2, 12)")
      db.exec("UPDATE evidence SET image_key = 'entries/a', image_type = 'image/png', image_size = 1 WHERE id = 2")
      const form = new FormData()
      form.set('evidence', '2'); form.set('revision', '1'); form.set('edit_generation', '1')
      form.append('remove_media', '10')
      await expect(actions.gallery!({
        params: { locale: 'en', id: '1' },
        platform: { env: { DB: d1Binding(db), IMAGES: images.bucket } },
        request: new Request('https://example.test/en/entry/1/edit', { method: 'POST', body: form }),
        url: new URL('https://example.test/en/entry/1/edit'),
      } as any)).rejects.toMatchObject({ status: 303, location: '/en/entry/1/edit#evidence-2' })
      expect(db.query('SELECT image_key FROM evidence WHERE id = 2').get()).toEqual({ image_key: 'entries/b' })
      expect(db.query('SELECT media_id FROM evidence_media WHERE evidence_id = 2 ORDER BY media_id').all()).toEqual([{ media_id: 11 }, { media_id: 12 }])
      expect(db.query('SELECT revision FROM entries').get()).toEqual({ revision: 2 })
    } finally { db.close() }
  })

  test('rejects evidence edits for hidden entries', async () => {
    const db = setup()
    const images = fakeImages()
    try {
      db.exec('UPDATE entries SET visible = 0')
      await expect(actions.evidence!(event(db, images, base))).rejects.toMatchObject({ status: 404 })
      expect(db.query('SELECT place FROM evidence WHERE id = 2').get()).toEqual({ place: 'Second place' })
    } finally { db.close() }
  })
})
