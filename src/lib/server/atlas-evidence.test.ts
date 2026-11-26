import { afterEach, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { newClaim } from '$lib/claims'
import { createEntry, editEntry, getEntry, mergeEntry, removeSighting, setHidden, type EntryFields, type SightingFields } from './entries'
import {
  ATLAS_ACTOR_ID,
  ATLAS_ACTOR_NAME,
  AtlasTransientError,
  bookKeyOf,
  computeBox,
  createAtlasClient,
  existingAtlasCropIds,
  isOpenImageLicence,
  lookupKeysOf,
  mapContexts,
  mapCropToSighting,
  mapStyle,
  nextEntriesToSync,
  queryKeyOf,
  RESERVATION_TTL_MS,
  scheduleAtlasSync,
  selectCandidates,
  syncAtlasBatch,
  syncEntryFromAtlas,
  toCodePointSlug,
  type AtlasClient,
  type AtlasCropDetail,
  type AtlasListingItem,
} from './atlas-evidence'
import { contributors, createPerson, PERSON_ID } from './people'
import { openTestDb } from './testdb'

const realFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = realFetch })

// Minimal valid PNG (IHDR + empty IDAT + IEND) that passes `sniff` and `stripMetadata`.
function tinyPng(width = 200, height = 160): Uint8Array {
  const crc = (data: Uint8Array) => {
    let c = 0xffffffff
    for (const byte of data) {
      c ^= byte
      for (let i = 0; i < 8; i++) c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0)
    }
    return (c ^ 0xffffffff) >>> 0
  }
  const chunk = (type: string, body: Uint8Array) => {
    const out = new Uint8Array(12 + body.length)
    const view = new DataView(out.buffer)
    view.setUint32(0, body.length)
    for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i)
    out.set(body, 8)
    view.setUint32(8 + body.length, crc(out.subarray(4, 8 + body.length)))
    return out
  }
  const ihdr = new Uint8Array(13)
  const view = new DataView(ihdr.buffer)
  view.setUint32(0, width)
  view.setUint32(4, height)
  ihdr[8] = 8
  ihdr[9] = 2
  const sig = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const parts = [sig, chunk('IHDR', ihdr), chunk('IDAT', new Uint8Array([0x78, 0x9c, 0x03, 0x00, 0x00, 0x00, 0x00, 0x01])), chunk('IEND', new Uint8Array())]
  const out = new Uint8Array(parts.reduce((sum, p) => sum + p.length, 0))
  let at = 0
  for (const part of parts) { out.set(part, at); at += part.length }
  return out
}

function fakeR2() {
  const stored = new Map<string, { body: Uint8Array; contentType?: string }>()
  const bucket = {
    async put(key: string, value: Uint8Array | ArrayBuffer | string, opts?: { httpMetadata?: { contentType?: string } }) {
      const body = value instanceof Uint8Array ? value : typeof value === 'string' ? new TextEncoder().encode(value) : new Uint8Array(value)
      stored.set(key, { body, contentType: opts?.httpMetadata?.contentType })
    },
    async get(key: string) {
      const hit = stored.get(key)
      return hit ? { arrayBuffer: async () => hit.body.buffer.slice(hit.body.byteOffset, hit.body.byteOffset + hit.body.byteLength), size: hit.body.byteLength } : null
    },
  } as unknown as R2Bucket
  return { bucket, stored }
}

const baseSighting: SightingFields = {
  place: 'Initial source', url: 'https://example.test/initial', title: 'Initial', author: null, publisher: null,
  report_date: null, container: null, source_kind: null, vias: [], original_date: null, page: null,
  contexts: null, style: null, types: null, note: null, quotes: null,
}

const entryOf = (claims: EntryFields['claims']): EntryFields => ({
  script: 'han', script_other: null, description: null, radical: null, strokes: null, claims,
})

test('lookupKeysOf extracts unique IDS and Unicode code point slugs in order', () => {
  expect(toCodePointSlug('⿰山東')).toBe('U+2FF0-U+5C71-U+6771')
  expect(toCodePointSlug('噐')).toBe('U+5650')
  const claims = [
    newClaim('ids', '⿰山東'),
    newClaim('ids', '⿰山東'),
    newClaim('ids', 'not-an-ids'),
    newClaim('encoding', 'U+5650', { charset: 'unicode' }),
    newClaim('encoding', 'MJ012345', { charset: 'mj' }),
  ]
  const keys = lookupKeysOf(claims)
  expect(keys).toEqual([
    { kind: 'ids', text: '⿰山東', codePoint: 'U+2FF0-U+5C71-U+6771' },
    { kind: 'unicode', text: '噐', codePoint: 'U+5650' },
  ])
  expect(queryKeyOf(keys)).toBe('U+2FF0-U+5C71-U+6771|U+5650')
  expect(PERSON_ID.test(ATLAS_ACTOR_ID)).toBe(true)
})

test('selectCandidates filters to checked non-withheld crops, deduplicates by book, orders earliest first, and caps', () => {
  const items: AtlasListingItem[] = [
    { id: 'c-unreviewed', state: 'pending', document: 'book-0', year: 1500, origin: 'local' },
    { id: 'c-withheld', state: 'checked', withheld: true, document: 'book-1', year: 1550, origin: 'local' },
    { id: 'c-existing', state: 'checked', document: 'book-existing', year: 1600, origin: 'local' },
    { id: 'c-late', state: 'checked', document: 'book-a', year: 1850, origin: 'local' },
    { id: 'c-early-corpus', state: 'checked', document: 'book-b', year: 1700, origin: 'corpus' },
    { id: 'c-early-local', state: 'checked', document: 'book-b', year: 1700, origin: 'local' },
    { id: 'c-earliest', state: 'checked', document: 'book-c', year: 1620, origin: 'local' },
    { id: 'c-undated', state: 'checked', document: 'book-d', year: null, origin: 'local' },
    { id: 'c-already-book', state: 'checked', document: 'book-seen', year: 1610, origin: 'local' },
  ]
  const chosen = selectCandidates(items, {
    existingCrops: new Set(['c-existing']),
    existingBooks: new Set(['doc:book-seen']),
    limit: 3,
  })
  expect(chosen.map(item => item.id)).toEqual(['c-earliest', 'c-early-local', 'c-late'])
  expect(bookKeyOf({ id: 'x', document: 'd1' })).toBe('doc:d1')
  expect(bookKeyOf({ id: 'x', source: { document_id: 'd2', title: 'T' } })).toBe('doc:d2')
  expect(bookKeyOf({ id: 'x', source: 'Book Title' })).toBe('title:Book Title')
})

test('isOpenImageLicence allows CC BY-SA-compatible licences and rejects NC, ND, RS-NOC-CR, restricted and unknown', () => {
  for (const ok of ['CC0-1.0', 'PD', 'PDM-1.0', 'CC-BY-4.0', 'CC-BY-SA-4.0', 'CC-BY-SA-2.1-JP', 'KOGL-1', 'MIT', 'Apache-2.0', 'bespoke-free', 'https://creativecommons.org/licenses/by-sa/4.0/deed.ja', 'https://creativecommons.org/publicdomain/mark/1.0/deed.ja']) {
    expect(isOpenImageLicence(ok)).toBe(true)
  }
  for (const bad of [null, undefined, '', 'unknown', 'none stated', 'restricted', 'RS-NOC-CR', 'CC-BY-NC-4.0', 'CC-BY-ND-4.0', 'CC-BY-NC-SA-4.0', 'https://creativecommons.org/licenses/by-nc/4.0/', 'https://da.library.ryukoku.ac.jp/support2.html']) {
    expect(isOpenImageLicence(bad)).toBe(false)
  }
})

test('mapStyle, mapContexts, computeBox and mapCropToSighting translate Glyph Atlas records accurately', () => {
  expect(mapStyle('regular')).toBe('regular')
  expect(mapStyle('ming')).toBe('regular')
  expect(mapStyle('running')).toBe('semi_cursive')
  expect(mapStyle('cursive')).toBe('semi_cursive')
  expect(mapStyle('seal')).toBe('seal')
  expect(mapStyle('clerical')).toBe('clerical')
  expect(mapStyle('mixed')).toBe('other')
  expect(mapStyle('unassessed')).toBeNull()

  expect(mapContexts({ production: 'manuscript' })).toBe('["handwriting"]')
  expect(mapContexts({ production: 'woodblock' })).toBe('["running_text"]')

  expect(computeBox({ context_box: { x: 100, y: 200, w: 200, h: 100 }, crop_box: { x: 150, y: 225, w: 50, h: 50 } }, 400, 200)).toBe('[[100,50,100,100]]')
  expect(computeBox({ context_box: { x: 0, y: 0, w: 0, h: 100 }, crop_box: { x: 0, y: 0, w: 10, h: 10 } }, 200, 200)).toBeNull()

  const crop: AtlasCropDetail = {
    id: 'k3x9a2',
    state: 'checked',
    label: '⿰山東',
    source: '和漢三才図会',
    holder: '国立国会図書館',
    shelfmark: '特1-123',
    page_number: 42,
    style: 'regular',
    production: 'woodblock',
    dating: { witness: { text: '正徳2年', start: 1712, end: 1712 } },
    record_url: 'https://dl.ndl.go.jp/pid/123456',
    honkoku_url: 'https://honkoku.org/app/#/transcription/abc/1/42',
    attribution: 'NDL Digital Collections',
    licence: 'PDM-1.0',
  }
  const mapped = mapCropToSighting(crop, 'https://glyphatlas.org')
  expect(mapped.title).toBe('和漢三才図会')
  expect(mapped.publisher).toBe('国立国会図書館')
  expect(mapped.original_date).toBe('正徳2年')
  expect(mapped.page).toBe('42')
  expect(mapped.url).toBe('https://dl.ndl.go.jp/pid/123456')
  expect(mapped.style).toBe('regular')
  expect(mapped.contexts).toBe('["running_text"]')
  expect(mapped.types).toBe('["attestation"]')
  expect(mapped.vias).toHaveLength(2)
  expect(mapped.vias[0]).toMatchObject({ url: 'https://honkoku.org/app/#/transcription/abc/1/42', container: 'みんなで翻刻' })
  expect(mapped.vias[1]).toMatchObject({ url: 'https://glyphatlas.org/crop/k3x9a2', container: 'Glyph Atlas', publisher: 'Glyph Atlas' })
  expect(mapped.note).toContain('Shelfmark: 特1-123')
  expect(mapped.note).toContain('Licence: PDM-1.0')

  expect(existingAtlasCropIds([
    { url: null, vias: [{ url: 'https://glyphatlas.org/ja/crop/k3x9a2?v=abc123', id: 1, title: null, author: null, publisher: null, report_date: null, container: null, source_kind: null, quote: null }] },
    { url: 'https://example.org/crop/other', vias: [] },
  ])).toEqual(new Set(['k3x9a2']))
})

test('syncEntryFromAtlas imports reviewed crops with R2 media, respects licences, stays idempotent, and never re-adds removed evidence', async () => {
  const { db } = openTestDb()
  const { bucket, stored } = fakeR2()
  const human = await createPerson(db, null, 'Recorder')
  const entryId = await createEntry(db, entryOf([newClaim('ids', '⿰山東'), newClaim('encoding', 'U+5650', { charset: 'unicode' })]), baseSighting, [], { actor: human.id, ip: null })

  const contextBytes = tinyPng(400, 300)
  const cropBytes = tinyPng(60, 60)

  const crops = new Map<string, AtlasCropDetail>([
    ['crop-1', {
      id: 'crop-1', origin: 'local', state: 'checked', document: 'book-1', year: 1680,
      label: '⿰山東', source: '古今集', holder: '国会図書館', page_number: 12,
      dating: { witness: { text: '1680', start: 1680, end: 1680 } },
      style: 'running', production: 'manuscript', licence: 'PDM-1.0',
      record_url: 'https://dl.ndl.go.jp/pid/1',
      context_image: '/atlas/media/' + 'a'.repeat(64) + '.webp',
      image: '/atlas/media/' + 'b'.repeat(64) + '.webp',
      context_box: { x: 100, y: 100, w: 200, h: 150 },
      crop_box: { x: 150, y: 130, w: 40, h: 45 },
    }],
    ['crop-2-same-book', {
      id: 'crop-2-same-book', origin: 'local', state: 'checked', document: 'book-1', year: 1680,
      label: '⿰山東', source: '古今集', licence: 'PDM-1.0',
    }],
    ['crop-3-restricted', {
      id: 'crop-3-restricted', origin: 'corpus', state: 'checked', document: 'book-2', year: 1750,
      label: '噐', source: { title: '太平記', document_id: 'book-2', holder: 'Private Archive', page: 5 },
      style: 'regular', licence: 'CC-BY-NC-4.0',
      image: '/atlas/media/' + 'c'.repeat(64) + '.webp',
    }],
  ])

  const client: AtlasClient = {
    origin: 'https://glyphatlas.org',
    async listCheckedCrops(codePoint) {
      if (codePoint === 'U+2FF0-U+5C71-U+6771') return [crops.get('crop-1')!, crops.get('crop-2-same-book')!]
      if (codePoint === 'U+5650') return [crops.get('crop-3-restricted')!]
      return []
    },
    async getCrop(id) { return crops.get(id) ?? null },
    async fetchImage(path) {
      if (path.includes('a'.repeat(64))) return contextBytes
      if (path.includes('b'.repeat(64))) return cropBytes
      if (path.includes('c'.repeat(64))) return cropBytes
      return null
    },
  }

  const first = await syncEntryFromAtlas({ DB: db, MEDIA: bucket }, entryId, { client, now: () => Date.parse('2026-11-26T10:00:00Z') })
  expect(first.status).toBe('synced')
  expect(first.added).toBe(2)
  expect(first.cropIds).toEqual(['crop-1', 'crop-3-restricted'])
  expect(stored.size).toBe(2)

  const loaded = (await getEntry(db, entryId))!
  expect(loaded.entry.sightings).toBe(3)
  expect(loaded.entry.first_year).toBe('1680')
  const openSighting = loaded.sightings.find(s => s.title === '古今集')!
  expect(openSighting.created_by).toBe(ATLAS_ACTOR_ID)
  expect(openSighting.by_name).toBe(ATLAS_ACTOR_NAME)
  expect(openSighting.media).toHaveLength(1)
  expect(openSighting.media[0].image_w).toBe(400)
  expect(openSighting.media[0].image_h).toBe(300)
  expect(openSighting.media[0].thumb_key).not.toBe(openSighting.media[0].image_key)
  expect(openSighting.media[0].box).toBe('[[100,60,80,90]]')
  expect(openSighting.vias.map(v => v.url)).toEqual(['https://glyphatlas.org/crop/crop-1'])

  const restrictedSighting = loaded.sightings.find(s => s.title === '太平記')!
  expect(restrictedSighting.media).toEqual([])
  expect(restrictedSighting.vias.map(v => v.url)).toEqual(['https://glyphatlas.org/crop/crop-3-restricted'])

  const board = await contributors(db, 1)
  expect(board.people.map(p => p.name)).toEqual(['Recorder'])

  const second = await syncEntryFromAtlas({ DB: db, MEDIA: bucket }, entryId, { client, now: () => Date.parse('2026-11-26T12:00:00Z') })
  expect(second.added).toBe(0)

  // If a human removes an auto-added sighting, a later sync does not put it back or add another from that book.
  const removed = await removeSighting(db, entryId, openSighting.id, openSighting.rev, { actor: human.id, ip: null }, 'wrong crop')
  expect(removed).toBe('done')
  const third = await syncEntryFromAtlas({ DB: db, MEDIA: bucket }, entryId, { client, now: () => Date.parse('2026-11-27T12:00:00Z') })
  expect(third.added).toBe(0)
})

test('concurrent runs respect maxPerEntry and per-book uniqueness, and expired reservations are reclaimed', async () => {
  const { db, raw } = openTestDb()
  const { bucket } = fakeR2()
  const human = await createPerson(db, null, 'Human')
  const entryId = await createEntry(db, entryOf([newClaim('ids', '⿰木木')]), baseSighting, [], { actor: human.id, ip: null })

  const items: AtlasListingItem[] = [
    { id: 'c-1', state: 'checked', document: 'b1', year: 1610, origin: 'local' },
    { id: 'c-2', state: 'checked', document: 'b2', year: 1620, origin: 'local' },
  ]
  const slowClient = (order: string[]): AtlasClient => ({
    origin: 'https://glyphatlas.org',
    async listCheckedCrops() {
      await Bun.sleep(10)
      return order.map(id => items.find(i => i.id === id)!)
    },
    async getCrop(id) {
      await Bun.sleep(10)
      const item = items.find(i => i.id === id)!
      return { id, state: 'checked', document: item.document, year: item.year, source: `Book ${id}` }
    },
    async fetchImage() { return null },
  })

  // Two overlapping syncs with maxPerEntry = 1 must still import at most 1 crop in total.
  const [a, b] = await Promise.all([
    syncEntryFromAtlas({ DB: db, MEDIA: bucket }, entryId, { client: slowClient(['c-1', 'c-2']), maxPerEntry: 1 }),
    syncEntryFromAtlas({ DB: db, MEDIA: bucket }, entryId, { client: slowClient(['c-2', 'c-1']), maxPerEntry: 1 }),
  ])
  expect(a.added + b.added).toBe(1)

  // A stale abandoned reservation (sighting_id IS NULL past TTL) is reclaimed on the next run.
  const t0 = Date.parse('2026-11-26T00:00:00Z')
  const entry2 = await createEntry(db, entryOf([newClaim('ids', '⿰火火')]), baseSighting, [], { actor: human.id, ip: null })
  raw.query("INSERT INTO atlas_sightings(entry_id, crop_id, book_key, sighting_id, synced_at) VALUES (?, 'c-1', 'doc:b1', NULL, ?)").run(entry2, new Date(t0).toISOString())
  const reclaimed = await syncEntryFromAtlas({ DB: db, MEDIA: bucket }, entry2, {
    client: slowClient(['c-1']),
    now: () => t0 + RESERVATION_TTL_MS + 1000,
  })
  expect(reclaimed.added).toBe(1)
  expect(reclaimed.cropIds).toEqual(['c-1'])
})

test('merged sightings carry book deduplication to the destination entry', async () => {
  const { db } = openTestDb()
  const { bucket } = fakeR2()
  const mod = await createPerson(db, null, 'Mod')
  const target = await createEntry(db, entryOf([newClaim('ids', '⿰山東')]), baseSighting, [], { actor: mod.id, ip: null })
  const dup = await createEntry(db, entryOf([newClaim('ids', '⿰山東')]), baseSighting, [], { actor: mod.id, ip: null })

  const client: AtlasClient = {
    origin: 'https://glyphatlas.org',
    async listCheckedCrops() {
      return [
        { id: 'c-dup', state: 'checked', document: 'book-shared', year: 1650, origin: 'local' },
        { id: 'c-other-in-same-book', state: 'checked', document: 'book-shared', year: 1650, origin: 'local' },
      ]
    },
    async getCrop(id) { return { id, state: 'checked', document: 'book-shared', source: 'Shared Book', year: 1650 } },
    async fetchImage() { return null },
  }

  expect((await syncEntryFromAtlas({ DB: db, MEDIA: bucket }, dup, { client })).cropIds).toEqual(['c-dup'])
  expect((await mergeEntry(db, dup, target, { actor: mod.id, ip: null }, null)).ok).toBe(true)

  // Target now owns dup's sighting from `book-shared`, so syncing target must NOT import a second crop from `book-shared`.
  const afterMerge = await syncEntryFromAtlas({ DB: db, MEDIA: bucket }, target, { client })
  expect(afterMerge.added).toBe(0)
})

test('transient image failures abort the sighting instead of committing media-less evidence, and succeed on retry', async () => {
  const { db } = openTestDb()
  const { bucket, stored } = fakeR2()
  const human = await createPerson(db, null, 'Human')
  const entryId = await createEntry(db, entryOf([newClaim('ids', '⿰山東')]), baseSighting, [], { actor: human.id, ip: null })

  let imageUp = false
  const client: AtlasClient = {
    origin: 'https://glyphatlas.org',
    async listCheckedCrops() { return [{ id: 'c-img', state: 'checked', document: 'b-img', year: 1700, origin: 'local' }] },
    async getCrop() { return { id: 'c-img', state: 'checked', document: 'b-img', source: 'Book', year: 1700, licence: 'PDM-1.0', image: '/atlas/media/' + 'd'.repeat(64) + '.webp' } },
    async fetchImage() {
      if (!imageUp) throw new AtlasTransientError('503 image busy', 503)
      return tinyPng(80, 80)
    },
  }

  await expect(syncEntryFromAtlas({ DB: db, MEDIA: bucket }, entryId, { client })).rejects.toBeInstanceOf(AtlasTransientError)
  expect((await getEntry(db, entryId))!.sightings).toHaveLength(1)

  imageUp = true
  const retried = await syncEntryFromAtlas({ DB: db, MEDIA: bucket }, entryId, { client })
  expect(retried.added).toBe(1)
  expect(stored.size).toBe(1)
  expect((await getEntry(db, entryId))!.sightings[1].media).toHaveLength(1)
})

test('revalidation removes previously imported sightings when a crop is withdrawn or unchecked upstream', async () => {
  const { db } = openTestDb()
  const { bucket } = fakeR2()
  const human = await createPerson(db, null, 'Human')
  const entryId = await createEntry(db, entryOf([newClaim('ids', '⿰山東')]), baseSighting, [], { actor: human.id, ip: null })

  let state: 'checked' | 'flagged' = 'checked'
  const client: AtlasClient = {
    origin: 'https://glyphatlas.org',
    async listCheckedCrops() { return state === 'checked' ? [{ id: 'c-rev', state: 'checked', document: 'b-rev', year: 1710, origin: 'local' }] : [] },
    async getCrop() { return { id: 'c-rev', state, document: 'b-rev', source: 'Rev Book', year: 1710 } },
    async fetchImage() { return null },
  }

  expect((await syncEntryFromAtlas({ DB: db, MEDIA: bucket }, entryId, { client })).added).toBe(1)
  expect((await getEntry(db, entryId))!.entry.sightings).toBe(2)

  state = 'flagged'
  const rechecked = await syncEntryFromAtlas({ DB: db, MEDIA: bucket }, entryId, { client })
  expect(rechecked.removed).toBe(1)
  expect((await getEntry(db, entryId))!.entry.sightings).toBe(1)
})

test('syncAtlasBatch uses covering due index with zero full scan and backs off failing entries without starvation', async () => {
  const { db, raw } = openTestDb()
  const { bucket } = fakeR2()
  const human = await createPerson(db, null, 'Human')
  const e1 = await createEntry(db, entryOf([newClaim('ids', '⿰山東')]), baseSighting, [], { actor: human.id, ip: null })
  const e2 = await createEntry(db, entryOf([newClaim('ids', '⿰木木')]), baseSighting, [], { actor: human.id, ip: null })
  const e3 = await createEntry(db, entryOf([newClaim('ids', '⿰火火')]), baseSighting, [], { actor: human.id, ip: null })
  const eHidden = await createEntry(db, entryOf([newClaim('ids', '⿰水水')]), baseSighting, [], { actor: human.id, ip: null })
  await setHidden(db, { entry: eHidden }, true, { actor: human.id, ip: null }, null)

  // Verify the scheduled queue query uses the covering index with no table scan or sort.
  const plan = (raw.query(
    'EXPLAIN QUERY PLAN SELECT entry_id AS id FROM atlas_sync_state WHERE next_sync_at <= ? ORDER BY next_sync_at ASC, entry_id ASC LIMIT ?',
  ).all('2026-11-26T00:00:00.000Z', 10) as { detail: string }[]).map(r => r.detail).join('\n')
  expect(plan).toContain('COVERING INDEX atlas_sync_state_by_due')
  expect(plan).not.toContain('TEMP B-TREE')

  const failing = new Set([toCodePointSlug('⿰山東'), toCodePointSlug('⿰木木')])
  const client: AtlasClient = {
    origin: 'https://glyphatlas.org',
    async listCheckedCrops(codePoint) {
      if (failing.has(codePoint)) throw new AtlasTransientError('busy', 503)
      return [{ id: `crop-${codePoint}`, state: 'checked', document: `doc-${codePoint}`, year: 1700, origin: 'local' }]
    },
    async getCrop(id) { return { id, state: 'checked', document: `doc-${id}`, source: 'Source', year: 1700 } },
    async fetchImage() { return null },
  }

  // Batch 1 (limit 2): visits e1 and e2, both fail and receive backoff (15m).
  const t0 = Date.parse('2026-11-26T00:00:00Z')
  const first = await syncAtlasBatch({ DB: db, MEDIA: bucket }, { client, limit: 2, now: () => t0 })
  expect(first.errors.map(e => e.entryId)).toEqual([e1, e2])

  // Batch 2 one minute later: e1 and e2 are in backoff, so e3 is NOT starved and succeeds immediately!
  const second = await syncAtlasBatch({ DB: db, MEDIA: bucket }, { client, limit: 2, now: () => t0 + 60_000 })
  expect(second.results.map(r => r.entryId)).toEqual([e3])
  expect(second.added).toBe(1)

  // After 20 minutes (past 15m backoff), e1 and e2 are due again; hidden entry never appears.
  const dueAfterBackoff = await nextEntriesToSync(db, { limit: 5, nowIso: new Date(t0 + 20 * 60_000).toISOString() })
  expect(dueAfterBackoff).toEqual([e1, e2])

  // WRITES_PAUSED skips writes cleanly.
  const paused = await syncAtlasBatch({ DB: db, MEDIA: bucket, WRITES_PAUSED: '1' }, { client, force: true })
  expect(paused.processed).toBe(0)
})

test('createAtlasClient follows pagination cursors, sends rate-limit pass, handles 404s, follows same-origin redirects, and rejects off-origin images', async () => {
  const seenHeaders: string[] = []
  const service = {
    async fetch(req: Request) {
      seenHeaders.push(req.headers.get('x-rate-limit-pass') ?? '')
      const url = new URL(req.url)
      if (url.pathname === '/layers/occurrences') {
        const after = url.searchParams.get('after')
        if (!after) return Response.json({ items: [{ id: 'old-id', state: 'checked', origin: 'local' }], next: 'cursor-2' })
        if (after === 'cursor-2') return Response.json({ items: [{ id: 'page2-id', state: 'checked', origin: 'local' }], next: null })
      }
      if (url.pathname === '/layers/candidates') return new Response('Not found', { status: 404 })
      if (url.pathname === '/atlas/characters/old-id') return new Response(null, { status: 302, headers: { location: '/atlas/characters/new-id' } })
      if (url.pathname === '/atlas/characters/new-id') return Response.json({ id: 'new-id', state: 'checked', source: 'Book' })
      if (url.pathname === '/atlas/media/busy.webp') return new Response('busy', { status: 503 })
      if (url.pathname.startsWith('/atlas/media/')) return new Response(tinyPng(10, 10) as BodyInit, { headers: { 'content-type': 'image/png' } })
      return new Response('nope', { status: 404 })
    },
  } as unknown as Fetcher

  const client = createAtlasClient({ origin: 'https://glyphatlas.org', service, pass: 'secret-pass' })
  const list = await client.listCheckedCrops('U+5650')
  expect(list.map(i => i.id)).toEqual(['old-id', 'page2-id'])
  const detail = await client.getCrop('old-id')
  expect(detail?.id).toBe('new-id')
  expect(seenHeaders.every(h => h === 'secret-pass')).toBe(true)

  expect(await client.fetchImage('https://evil.example/atlas/media/abc.webp', 1024)).toBeNull()
  expect(await client.fetchImage('/other/path.webp', 1024)).toBeNull()
  expect((await client.fetchImage('/atlas/media/ok.webp', 1024))?.byteLength).toBeGreaterThan(0)
  await expect(client.fetchImage('/atlas/media/busy.webp', 1024)).rejects.toBeInstanceOf(AtlasTransientError)
})

test('scheduleAtlasSync runs in waitUntil only when configured and skips unchanged edits', async () => {
  const { db } = openTestDb()
  const { bucket } = fakeR2()
  const human = await createPerson(db, null, 'Human')
  const entryId = await createEntry(db, entryOf([newClaim('ids', '⿰山東')]), baseSighting, [], { actor: human.id, ip: null })

  const idle: Promise<unknown>[] = []
  scheduleAtlasSync({ platform: { env: { DB: db, MEDIA: bucket } as any, ctx: { waitUntil: (p: Promise<unknown>) => idle.push(p) } as any } }, [entryId])
  expect(idle).toHaveLength(0)

  let listCalls = 0
  const service = {
    async fetch(req: Request) {
      const url = new URL(req.url)
      if (url.pathname === '/layers/occurrences') {
        listCalls++
        return Response.json({ items: [{ id: 'c1', state: 'checked', document: 'b1', year: 1650, origin: 'local' }] })
      }
      if (url.pathname === '/layers/candidates') return Response.json({ items: [] })
      if (url.pathname === '/atlas/characters/c1') return Response.json({ id: 'c1', state: 'checked', document: 'b1', source: 'Book 1', year: 1650 })
      return new Response(null, { status: 404 })
    },
  } as unknown as Fetcher

  const pending: Promise<unknown>[] = []
  const platform = { env: { DB: db, MEDIA: bucket, ATLAS: service, ATLAS_ORIGIN: 'https://glyphatlas.org' } as any, ctx: { waitUntil: (p: Promise<unknown>) => pending.push(p) } as any }
  scheduleAtlasSync({ platform }, [entryId])
  await Promise.all(pending)
  expect(listCalls).toBe(1)
  expect((await getEntry(db, entryId))!.sightings).toHaveLength(2)

  // Editing description without changing IDS or Unicode skips re-sync when onlyIfChanged is set.
  const current = (await getEntry(db, entryId))!
  await editEntry(db, entryId, current.entry.rev, { ...entryOf(current.claims), description: 'Updated note' }, { actor: human.id, ip: null }, null)
  const pending2: Promise<unknown>[] = []
  scheduleAtlasSync({ platform: { ...platform, ctx: { waitUntil: (p: Promise<unknown>) => pending2.push(p) } as any } }, [entryId], { onlyIfChanged: true })
  await Promise.all(pending2)
  expect(listCalls).toBe(1)

  // Adding a Unicode encoding changes the lookup key and triggers sync again.
  const edited = (await getEntry(db, entryId))!
  await editEntry(db, entryId, edited.entry.rev, entryOf([...edited.claims, newClaim('encoding', 'U+5650', { charset: 'unicode' })]), { actor: human.id, ip: null }, null)
  const pending3: Promise<unknown>[] = []
  scheduleAtlasSync({ platform: { ...platform, ctx: { waitUntil: (p: Promise<unknown>) => pending3.push(p) } as any } }, [entryId], { onlyIfChanged: true })
  await Promise.all(pending3)
  expect(listCalls).toBe(3)
})

test('worker.js wrapper exports both fetch and scheduled handlers', () => {
  const source = readFileSync(join(import.meta.dir, '../../../worker.js'), 'utf8')
  expect(source).toContain('./.svelte-kit/cloudflare/_worker.js')
  expect(source).toContain('async scheduled(')
})
