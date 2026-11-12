import { describe, expect, test } from 'bun:test'
import { readClaims, type Claim } from '$lib/claims'
import { addSighting, claimedBy, createEntry, editEntry, editSighting, exportPage, getEntry, getSighting, list, mediaVisible, redactRevision, revertEntry, setHidden, sourcePage, type EntryFields, type SightingFields, type StoredImage } from './entries'
import { openTestDb } from './testdb'

const who = { actor: 'p1', ip: null }
const fields = (claims: Claim[] = []): EntryFields => ({ script: 'han', script_other: null, description: null, status: 'unchecked', radical: null, strokes: null, claims })
const seen = (extra: Partial<SightingFields> = {}): SightingFields => ({ place: 'a shop sign', url: null, title: null, author: null, publisher: null, report_date: null, original_date: null, page: null, context: null, style: null, types: null, note: null, ...extra })
const image = (name: string, box: string | null = null): StoredImage => ({ image_key: `${name}.jpg`, image_type: 'image/jpeg', image_w: 10, image_h: 10, thumb_key: `${name}-t.jpg`, box })
const claim = (kind: Claim['kind'], value: string, data: Claim['data'] = null): Claim => ({ kind, value, data, sighting_id: null })
const book = { title: '字書', author: '某', publisher: '某社', report_date: '1900', url: null }

function open() {
  const opened = openTestDb()
  opened.raw.exec("INSERT INTO people(id, name, created_at) VALUES('p1', 'anon-1', '2026-01-01')")
  return opened
}

describe('claims', () => {
  test('a record keeps several descriptions, codes and categories, and is found by each', async () => {
    const { db } = open()
    const claims = [claim('ids', '⿰山東'), claim('ids', '⿰山东'), claim('encoding', 'U+5D20', { charset: 'unicode' }), claim('genre', 'hakka'), claim('tag', 'IRG')]
    const id = await createEntry(db, fields(claims), seen(), [], who)
    const found = await getEntry(db, id)
    expect(found!.entry.ids).toBe('⿰山東')
    expect(found!.claims).toEqual(claims)
    expect((await claimedBy(db, 'ids', '⿰山东')).map(row => row.id)).toEqual([id])
    expect((await claimedBy(db, 'encoding', 'U+5D20')).map(row => row.id)).toEqual([id])
    for (const facet of ['g:hakka', 'g:dialect', 't:IRG']) expect((await list(db, { script: 'han', facet }))!.tiles.map(tile => tile.id)).toEqual([id])
    expect((await list(db, { script: 'han', facet: 'g:music' }))!.tiles).toEqual([])
    expect((await list(db, { script: 'han', query: '⿰山东' }))!.tiles.map(tile => tile.id)).toEqual([id])
  })

  test('an edit replaces the claims, a revert brings them back, and the journal holds both', async () => {
    const { db } = open()
    const id = await createEntry(db, fields([claim('reading', 'tung')]), seen(), [], who)
    expect(await editEntry(db, id, 1, fields([claim('reading', 'dong'), claim('meaning', 'east hill')]), who, null)).toEqual({ ok: true, rev: 2 })
    expect((await getEntry(db, id))!.claims.map(item => item.value)).toEqual(['dong', 'east hill'])
    const first = await db.prepare("SELECT id FROM revisions WHERE entry_id = ? AND kind = 'create'").bind(id).first<{ id: number }>()
    expect(await revertEntry(db, id, first!.id, who)).toEqual({ ok: true, rev: 3 })
    expect((await getEntry(db, id))!.claims).toEqual([claim('reading', 'tung')])
    expect((await list(db, { script: 'han', query: 'dong' }))!.tiles).toEqual([])
  })

  test('a claim rests only on a sighting of its own record', async () => {
    const { db } = open()
    const id = await createEntry(db, fields(), seen(), [], who)
    const other = await createEntry(db, fields(), seen(), [], who)
    const own = (await getEntry(db, id))!.sightings[0].id, foreign = (await getEntry(db, other))!.sightings[0].id
    await editEntry(db, id, 1, fields([{ ...claim('reading', 'a'), sighting_id: own }, { ...claim('reading', 'b'), sighting_id: foreign }]), who, null)
    expect((await getEntry(db, id))!.claims.map(item => item.sighting_id)).toEqual([own, null])
  })

  test('a form replaces only the groups it carries', () => {
    const base = [claim('ids', '⿰山東'), claim('genre', 'hakka'), claim('reading', 'tung')]
    const form = new FormData()
    form.set('ids', '⿰山东, ⿰山東')
    form.set('genres_present', '1')
    const read = readClaims(form, base)
    expect(read.claims).toEqual([claim('ids', '⿰山东'), claim('ids', '⿰山東'), claim('reading', 'tung')])
  })
})

describe('sources', () => {
  test('the same citation is one source, and an edited citation moves the sighting to another', async () => {
    const { db, raw } = open()
    const a = await createEntry(db, fields([claim('ids', '⿰山東')]), seen({ ...book, page: '3' }), [], who)
    const b = await createEntry(db, fields(), seen({ ...book, page: '9' }), [], who)
    expect(raw.query('SELECT COUNT(*) AS n FROM sources').get()).toEqual({ n: 1 })
    const sighting = (await getEntry(db, a))!.sightings[0]
    expect(sighting.title).toBe('字書')
    const page = await sourcePage(db, sighting.source_id!)
    expect(page!.tiles.map(tile => [tile.id, tile.pages])).toEqual([[a, ['3']], [b, ['9']]])
    await editSighting(db, sighting.id, 1, seen({ ...book, title: '字書 二版', page: '3' }), null, who, null, a)
    expect(raw.query('SELECT COUNT(*) AS n FROM sources').get()).toEqual({ n: 2 })
    expect((await sourcePage(db, sighting.source_id!))!.tiles.map(tile => tile.id)).toEqual([b])
    expect((await getSighting(db, sighting.id))!.title).toBe('字書 二版')
  })
})

describe('pictures', () => {
  test('a sighting holds several pictures in order and the first is the cover', async () => {
    const { db } = open()
    const id = await createEntry(db, fields(), seen(), [image('a', '[1,1,5,5]'), image('b')], who)
    const found = await getEntry(db, id)
    expect(found!.sightings[0].media.map(item => item.image_key)).toEqual(['a.jpg', 'b.jpg'])
    expect(found!.entry.cover_key).toBe('a-t.jpg')
    const sighting = found!.sightings[0]
    await editSighting(db, sighting.id, 1, seen(), [image('b'), image('c')], who, null, id)
    expect((await getSighting(db, sighting.id))!.media.map(item => item.image_key)).toEqual(['b.jpg', 'c.jpg'])
    expect((await getEntry(db, id))!.entry.cover_key).toBe('b-t.jpg')
  })

  test('one picture shared by two sightings is served while either is visible', async () => {
    const { db } = open()
    const a = await createEntry(db, fields(), seen(), [image('page')], who)
    const b = await createEntry(db, fields(), seen(), [image('page')], who)
    expect(await mediaVisible(db, 'page.jpg')).toBe(true)
    await setHidden(db, { entry: a }, true, who, null)
    expect(await mediaVisible(db, 'page-t.jpg')).toBe(true)
    await setHidden(db, { entry: b }, true, who, null)
    expect(await mediaVisible(db, 'page.jpg')).toBe(false)
  })

  test('the tile summary follows the sightings', async () => {
    const { db } = open()
    const id = await createEntry(db, fields(), seen({ report_date: '2026-11-07', original_date: '1850', types: '["mention"]' }), [], who)
    await addSighting(db, id, seen({ report_date: '1700', types: '["reading"]' }), [], who)
    const tile = (await list(db, { script: 'han' }))!.tiles[0]
    expect([tile.sightings, tile.types, tile.firstYear, tile.firstYearKind]).toEqual([2, ['mention', 'reading'], '1700', 'report'])
  })
})

describe('journal', () => {
  test('a past version can be redacted and the current one cannot', async () => {
    const { db } = open()
    const id = await createEntry(db, fields([claim('reading', 'private')]), seen(), [], who)
    await editEntry(db, id, 1, fields(), who, null)
    const rows = (await db.prepare("SELECT id, kind FROM revisions WHERE entry_id = ? AND sighting_id IS NULL ORDER BY id").bind(id).all<{ id: number; kind: string }>()).results
    expect(await redactRevision(db, id, rows[1].id, who, null)).toBe(false)
    expect(await redactRevision(db, id, rows[0].id, who, 'personal data')).toBe(true)
    const redacted = await db.prepare('SELECT snapshot, redacted_at FROM revisions WHERE id = ?').bind(rows[0].id).first<{ snapshot: string; redacted_at: string | null }>()
    expect(redacted!.snapshot).toBe('{}')
    expect(redacted!.redacted_at).not.toBeNull()
    expect((await revertEntry(db, id, rows[0].id, who)).ok).toBe(false)
  })
})

describe('export', () => {
  test('a page carries each record with its claims, citation and pictures', async () => {
    const { db } = open()
    const id = await createEntry(db, fields([claim('ids', '⿰山東'), claim('relation', '崬', { relationship: 'variant' })]), seen({ ...book, page: '3' }), [image('a')], who)
    const page = await exportPage(db, 0, 10)
    expect(page.entries.map(entry => entry.id)).toEqual([id])
    expect(page.entries[0].claims.map(item => item.kind)).toEqual(['ids', 'relation'])
    expect(page.entries[0].evidence[0].title).toBe('字書')
    expect(page.entries[0].evidence[0].media.map(item => item.image_key)).toEqual(['a.jpg'])
  })
})

describe('review findings', () => {
  test('a source is not shown once no visible sighting gives it', async () => {
    const { db } = open()
    const id = await createEntry(db, fields(), seen({ ...book, page: '3' }), [], who)
    const source = (await getEntry(db, id))!.sightings[0].source_id!
    await setHidden(db, { entry: id }, true, who, null)
    expect(await sourcePage(db, source)).toBeNull()
  })

  test('a restore of a revision redacted meanwhile is refused', async () => {
    const { db } = open()
    const id = await createEntry(db, fields([claim('reading', 'private')]), seen(), [], who)
    await editEntry(db, id, 1, fields(), who, null)
    const first = await db.prepare("SELECT id, snapshot FROM revisions WHERE entry_id = ? AND kind = 'create'").bind(id).first<{ id: number; snapshot: string }>()
    await redactRevision(db, id, first!.id, who, null)
    expect(await editEntry(db, id, 2, fields([claim('reading', 'private')]), who, 'r1', 'revert', first!.id)).toEqual({ ok: false, code: 'missing' })
  })

  test('claims over the text limit are refused', () => {
    const form = new FormData()
    form.set('related_characters_present', '1')
    for (let i = 0; i < 10; i++) { form.append('related_character', `字${i}`); form.append('related_relationship', 'variant'); form.append('related_difference', 'x'.repeat(5000)); form.append('related_evidence', 'y'.repeat(5000)) }
    expect(readClaims(form).error).toBe('relatedCharacters')
  })
})
