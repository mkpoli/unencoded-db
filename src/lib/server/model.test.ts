import { describe, expect, test } from 'bun:test'
import { newClaim, readClaims, type Claim } from '$lib/claims'
import { addSighting, claimedBy, createEntry, editEntry, editSighting, exportPage, getEntry, getSighting, history, list, mediaVisible, mergeEntry, redactRevision, restoreSighting, revertEntry, setHidden, sourcePage, unmergeEntry, type EntryFields, type SightingFields, type StoredImage } from './entries'
import { sightingSnapshot } from './revisions'
import { openTestDb } from './testdb'

const who = { actor: 'p1', ip: null }
const fields = (claims: Claim[] = []): EntryFields => ({ script: 'han', script_other: null, description: null, radical: null, strokes: null, claims })
const seen = (extra: Partial<SightingFields> = {}): SightingFields => ({ place: 'a shop sign', url: null, title: null, author: null, publisher: null, report_date: null, via_url: null, via_title: null, via_author: null, via_publisher: null, via_report_date: null, original_date: null, page: null, context: null, style: null, types: null, note: null, ...extra })
const image = (name: string, box: string | null = null): StoredImage => ({ image_key: `${name}.jpg`, image_type: 'image/jpeg', image_w: 10, image_h: 10, thumb_key: `${name}-t.jpg`, box })
const claim = (kind: Claim['kind'], value: string, data: Claim['data'] = null, links: Partial<Pick<Claim, 'sightings' | 'under'>> = {}): Claim => newClaim(kind, value, data, links)
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
    const tung = claim('reading', 'tung')
    const id = await createEntry(db, fields([tung]), seen(), [], who)
    expect(await editEntry(db, id, 1, fields([claim('reading', 'dong'), claim('meaning', 'east hill')]), who, null)).toEqual({ ok: true, rev: 2 })
    expect((await getEntry(db, id))!.claims.map(item => item.value)).toEqual(['dong', 'east hill'])
    const first = await db.prepare("SELECT id FROM revisions WHERE entry_id = ? AND kind = 'create'").bind(id).first<{ id: number }>()
    expect(await revertEntry(db, id, first!.id, who)).toEqual({ ok: true, rev: 3 })
    expect((await getEntry(db, id))!.claims).toEqual([tung])
    expect((await list(db, { script: 'han', query: 'dong' }))!.tiles).toEqual([])
  })

  test('a claim rests only on a sighting of its own record', async () => {
    const { db } = open()
    const id = await createEntry(db, fields(), seen(), [], who)
    const other = await createEntry(db, fields(), seen(), [], who)
    const own = (await getEntry(db, id))!.sightings[0].id, foreign = (await getEntry(db, other))!.sightings[0].id
    const second = (await addSighting(db, id, seen({ place: 'a second sign' }), [], who))!
    await editEntry(db, id, 1, fields([claim('reading', 'a', null, { sightings: [own, second] }), claim('reading', 'b', null, { sightings: [foreign] }), claim('meaning', 'c', null, { sightings: [own, foreign, 999] })]), who, null)
    expect((await getEntry(db, id))!.claims.map(item => item.sightings)).toEqual([[own, second], [], [own]])
  })

  test('a record holds its claims with their keys, sightings and scopes, and gives them back as written', async () => {
    const { db, raw } = open()
    const id = await createEntry(db, fields(), seen(), [], who)
    const own = (await getEntry(db, id))!.sightings[0].id
    const second = (await addSighting(db, id, seen({ place: 'a second sign' }), [], who))!
    const sense = claim('meaning', 'a boastful person', null, { sightings: [own, second] }), east = claim('meaning', 'east')
    const reading = claim('reading', 'kua', { doculect: 'cmn' }, { sightings: [second], under: [sense.key] })
    const claims = [claim('ids', '⿰山東'), reading, sense, east, claim('relation', '侉', { relationship: 'usage' }, { sightings: [own], under: [sense.key, reading.key] }), claim('relation', '東', { relationship: 'usage' }, { under: [east.key] })]
    expect(await editEntry(db, id, 1, fields(claims), who, null)).toEqual({ ok: true, rev: 2 })
    expect((await getEntry(db, id))!.claims).toEqual(claims)
    expect(raw.query("SELECT key, sightings, under FROM claims WHERE kind = 'relation' ORDER BY position").all()).toEqual([
      { key: claims[4].key, sightings: `[${own}]`, under: JSON.stringify([sense.key, reading.key]) },
      { key: claims[5].key, sightings: '[]', under: JSON.stringify([east.key]) },
    ])
    expect(JSON.parse((await history(db, id))[0].snapshot).claims).toEqual(claims)
    expect((await exportPage(db, 0, 10)).entries[0].claims).toEqual(claims)
  })

  test('a version with links comes back whole, without the sightings the record no longer has', async () => {
    const { db } = open()
    const id = await createEntry(db, fields(), seen(), [], who)
    const other = await createEntry(db, fields(), seen(), [], who)
    const own = (await getEntry(db, id))!.sightings[0].id
    const moved = (await addSighting(db, id, seen({ place: 'a second sign' }), [], who))!
    const sense = claim('meaning', 'east', null, { sightings: [own, moved] })
    const linked = [claim('reading', 'tung', null, { sightings: [moved], under: [sense.key] }), sense, claim('relation', '東', { relationship: 'usage' }, { sightings: [own], under: [sense.key] })]
    await editEntry(db, id, 1, fields(linked), who, null)
    const version = (await history(db, id))[0].id
    await editEntry(db, id, 2, fields([claim('meaning', 'something else')]), who, null)
    expect(await revertEntry(db, id, version, who)).toEqual({ ok: true, rev: 4 })
    expect((await getEntry(db, id))!.claims).toEqual(linked)
    // The second sighting now belongs to another record, and the version is restored again.
    await db.prepare('UPDATE sightings SET entry_id = ? WHERE id = ?').bind(other, moved).run()
    await editEntry(db, id, 4, fields(), who, null)
    expect(await revertEntry(db, id, version, who)).toEqual({ ok: true, rev: 6 })
    const restored = (await getEntry(db, id))!.claims
    expect(restored.map(item => [item.key, item.under])).toEqual(linked.map(item => [item.key, item.under]))
    expect(restored.map(item => item.sightings)).toEqual([[], [own], [own]])
  })

  test('a new record names its sightings by place, and the claims and the first version take their ids', async () => {
    const { db } = open()
    await createEntry(db, fields(), seen(), [], who)
    const sense = claim('meaning', 'east', null, { sightings: [1, 3] })
    // A place is a whole number from 1: nothing else names a sighting of the form.
    const claims = [claim('ids', '⿰山東'), claim('reading', 'tung', null, { sightings: [0, 2, 2.5], under: [sense.key] }), sense, claim('relation', '東', { relationship: 'usage' }, { sightings: [3, 4], under: [sense.key] })]
    const id = await createEntry(db, fields(claims), seen({ place: 'one' }), [], who, [{ fields: seen({ place: 'two' }), media: [] }, { fields: seen({ place: 'three' }), media: [] }])
    const found = (await getEntry(db, id))!
    const [one, two, three] = found.sightings.map(sighting => sighting.id)
    expect(found.sightings.map(sighting => sighting.place)).toEqual(['one', 'two', 'three'])
    expect(one).toBeGreaterThan(1)
    // The fourth place names no sighting of the form.
    expect(found.claims.map(item => item.sightings)).toEqual([[], [two], [one, three], [three]])
    expect(found.claims.map(item => [item.key, item.under])).toEqual(claims.map(item => [item.key, item.under]))
    const created = (await history(db, id)).find(row => row.kind === 'create')!
    expect(JSON.parse(created.snapshot).claims).toEqual(found.claims)
    expect(await revertEntry(db, id, created.id, who)).toEqual({ ok: true, rev: 2 })
    expect((await getEntry(db, id))!.claims).toEqual(found.claims)
  })

  test('a form replaces only the groups it carries', () => {
    const base = [claim('ids', '⿰山東'), claim('genre', 'hakka'), claim('reading', 'tung')]
    const form = new FormData()
    form.set('ids', '⿰山东, ⿰山東')
    form.set('genres_present', '1')
    const read = readClaims(form, base)
    expect(read.claims.map(item => [item.kind, item.value])).toEqual([['ids', '⿰山东'], ['ids', '⿰山東'], ['reading', 'tung']])
    expect(read.claims.slice(1)).toEqual([base[0], base[2]])
  })
})

// What becomes of the sightings a claim names when one of them is hidden, edited or moved.
describe('the evidence a claim rests on', () => {
  async function cited() {
    const { db } = open()
    const sense = claim('meaning', 'east', null, { sightings: [1, 2] })
    const claims = [claim('reading', 'tung', null, { sightings: [2], under: [sense.key] }), sense, claim('relation', '東', { relationship: 'usage' }, { sightings: [1], under: [sense.key] })]
    const id = await createEntry(db, fields(claims), seen({ place: 'one' }), [], who, [{ fields: seen({ place: 'two', ...book }), media: [image('p')] }])
    const found = (await getEntry(db, id))!
    const [one, two] = found.sightings.map(sighting => sighting.id)
    expect(found.claims.map(item => item.sightings)).toEqual([[two], [one, two], [one]])
    return { db, id, one, two, claims: found.claims }
  }
  const sightingsOf = async (db: D1Database, id: number) => (await getEntry(db, id))!.claims.map(item => item.sightings)

  test('a hidden sighting stays named, through an edit of the record, and is there when it is shown again', async () => {
    const { db, id, one, two, claims } = await cited()
    expect(await setHidden(db, { entry: id, sighting: two }, true, who, null)).toBe(true)
    expect((await getEntry(db, id))!.claims).toEqual(claims)
    expect(await editEntry(db, id, 1, fields([...claims, claim('tag', 'IRG')]), who, null)).toEqual({ ok: true, rev: 2 })
    expect(await sightingsOf(db, id)).toEqual([[two], [one, two], [one], []])
    expect(await setHidden(db, { entry: id, sighting: two }, false, who, null)).toBe(true)
    expect(await sightingsOf(db, id)).toEqual([[two], [one, two], [one], []])
    expect((await getEntry(db, id))!.sightings.map(sighting => sighting.hidden_at)).toEqual([null, null])
  })

  test('an edited or restored sighting is the same evidence', async () => {
    const { db, id, two, claims } = await cited()
    expect(await editSighting(db, two, 1, seen({ place: 'two, corrected' }), [], who, null, id)).toEqual({ ok: true, rev: 2 })
    expect((await getEntry(db, id))!.claims).toEqual(claims)
    const first = sightingSnapshot((await history(db, id)).find(row => row.sighting_id === two && row.kind === 'sighting')!.snapshot)!
    expect(await restoreSighting(db, id, two, 2, first, who, 1)).toEqual({ ok: true, rev: 3 })
    expect((await getEntry(db, id))!.claims).toEqual(claims)
    expect((await getSighting(db, two))!.place).toBe('two')
  })

  test('a merge moves the sightings and leaves each record its claims, which name them again once it is undone', async () => {
    const { db, id, one, two, claims } = await cited()
    const kept = claim('reading', 'dong')
    const into = await createEntry(db, fields([kept]), seen({ place: 'three' }), [], who)
    const three = (await getEntry(db, into))!.sightings[0].id
    expect((await mergeEntry(db, id, into, who, null)).ok).toBe(true)
    expect((await getEntry(db, id))!.claims).toEqual(claims)
    expect((await getEntry(db, into))!.claims).toEqual([kept])
    expect((await getEntry(db, into))!.sightings.map(sighting => sighting.id)).toEqual([one, two, three])
    // The record the sightings moved to may rest its own claims on them.
    const resting = [{ ...kept, sightings: [two, three] }]
    expect(await editEntry(db, into, 1, fields(resting), who, null)).toEqual({ ok: true, rev: 2 })
    expect(await sightingsOf(db, into)).toEqual([[two, three]])
    expect(await unmergeEntry(db, id, who)).toBe(true)
    expect((await getEntry(db, id))!.claims).toEqual(claims)
    expect((await getEntry(db, id))!.sightings.map(sighting => sighting.id)).toEqual([one, two])
    // A sighting that went back is no longer the other record's; its next edit stops naming it.
    expect(await editEntry(db, into, 2, fields((await getEntry(db, into))!.claims), who, null)).toEqual({ ok: true, rev: 3 })
    expect(await sightingsOf(db, into)).toEqual([[three]])
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
    await addSighting(db, a, seen({ ...book, page: '12', note: 'second form' }), [image('p', '[1,2,3,4]')], who)
    const page = await sourcePage(db, sighting.source_id!)
    expect(page!.sightings.map(seen => [seen.tile.id, seen.page, seen.place])).toEqual([[a, '3', 'a shop sign'], [b, '9', 'a shop sign'], [a, '12', 'a shop sign']])
    expect(page!.sightings.map(seen => seen.media.map(picture => [picture.image_key, picture.box]))).toEqual([[], [], [['p.jpg', '[1,2,3,4]']]])
    expect(page!.sightings[2].note).toBe('second form')
    await editSighting(db, sighting.id, 1, seen({ ...book, title: '字書 二版', page: '3' }), null, who, null, a)
    expect(raw.query('SELECT COUNT(*) AS n FROM sources').get()).toEqual({ n: 2 })
    expect((await sourcePage(db, sighting.source_id!))!.sightings.map(seen => seen.tile.id)).toEqual([b, a])
    expect((await getSighting(db, sighting.id))!.title).toBe('字書 二版')
  })
})

const post = { via_url: 'https://example.test/post/1', via_title: 'A post', via_author: 'someone', via_publisher: null, via_report_date: '2026-05-01' }
const count = (raw: ReturnType<typeof open>['raw']) => (raw.query('SELECT COUNT(*) AS n FROM sources').get() as { n: number }).n

describe('found via', () => {
  test('a via is a source row, reused by hash, and joined into the sighting', async () => {
    const { db, raw } = open()
    const a = await createEntry(db, fields(), seen({ ...book, ...post }), [], who)
    expect(count(raw)).toBe(2)
    const sighting = (await getEntry(db, a))!.sightings[0]
    expect(sighting).toMatchObject({ title: '字書', ...post })
    expect(sighting.via_id).not.toBe(sighting.source_id)
    // The same post found through for another book is the same row; a work that was once a via is reused too.
    const b = await createEntry(db, fields(), seen({ ...post, title: 'Other book', url: null, author: null, publisher: null, report_date: null }), [], who)
    expect(count(raw)).toBe(3)
    expect((await getEntry(db, b))!.sightings[0].via_id).toBe(sighting.via_id)
    expect(await getSighting(db, sighting.id)).toMatchObject(post)
    // No via field filled means no via.
    const c = await createEntry(db, fields(), seen(book), [], who)
    expect((await getEntry(db, c))!.sightings[0]).toMatchObject({ via_id: null, via_url: null, via_title: null })
    expect(count(raw)).toBe(3)
  })

  test('an edit changes or removes the via and drops a source nothing cites', async () => {
    const { db, raw } = open()
    const id = await createEntry(db, fields(), seen({ ...book, ...post }), [], who)
    const sighting = (await getEntry(db, id))!.sightings[0]
    await editSighting(db, sighting.id, 1, seen({ ...book, ...post, via_title: 'A corrected post' }), null, who, null, id)
    expect(count(raw)).toBe(2)
    expect((await getSighting(db, sighting.id))!.via_title).toBe('A corrected post')
    await editSighting(db, sighting.id, 2, seen(book), null, who, null, id)
    expect(count(raw)).toBe(1)
    expect(await getSighting(db, sighting.id)).toMatchObject({ via_id: null, via_url: null, title: '字書' })
    // A source still cited through the other column stays: the book becomes the via of a sighting that no longer cites it.
    const other = await addSighting(db, id, seen({ ...book, ...post }), [], who)
    const swapped = { url: 'https://example.test/post/1', title: 'A post', author: 'someone', publisher: null, report_date: '2026-05-01', via_url: null, via_title: '字書', via_author: '某', via_publisher: '某社', via_report_date: '1900' }
    await editSighting(db, other!, 1, seen(swapped), null, who, null, id)
    expect(count(raw)).toBe(2)
    expect(await getSighting(db, other!)).toMatchObject({ title: 'A post', via_title: '字書' })
    expect((await getSighting(db, sighting.id))!.title).toBe('字書')
  })

  test('history, restore and redaction carry the via', async () => {
    const { db } = open()
    const id = await createEntry(db, fields(), seen({ ...book, ...post }), [], who)
    const sighting = (await getEntry(db, id))!.sightings[0]
    await editSighting(db, sighting.id, 1, seen(book), null, who, null, id)
    const rows = (await history(db, id)).filter(row => row.sighting_id === sighting.id)
    expect(JSON.parse(rows[1].snapshot)).toMatchObject(post)
    expect(JSON.parse(rows[0].snapshot)).toMatchObject({ via_url: null, via_title: null })
    const old = sightingSnapshot(rows[1].snapshot)!
    expect(old).toMatchObject(post)
    expect(await restoreSighting(db, id, sighting.id, 2, old, who, rows[1].rev)).toEqual({ ok: true, rev: 3 })
    expect(await getSighting(db, sighting.id)).toMatchObject(post)
    expect(JSON.parse((await history(db, id))[0].snapshot)).toMatchObject(post)
    expect(sightingSnapshot(JSON.stringify({ ...old, via_url: 'javascript:alert(1)' }))).toBeNull()
    expect(sightingSnapshot(JSON.stringify({ ...old, via_title: 5 }))).toBeNull()
    expect(await redactRevision(db, id, rows[1].id, who, 'private')).toBe(true)
  })

  test('the source page lists the sightings that cite it and those found through it', async () => {
    const { db } = open()
    const a = await createEntry(db, fields(), seen({ ...book, ...post }), [], who)
    const b = await createEntry(db, fields(), seen({ place: 'a post', ...post, title: 'A post', author: 'someone', url: 'https://example.test/post/1', report_date: '2026-05-01', via_url: null, via_title: null, via_author: null, via_report_date: null }), [image('q')], who)
    const [work, via] = [(await getEntry(db, a))!.sightings[0].source_id!, (await getEntry(db, a))!.sightings[0].via_id!]
    const viaPage = await sourcePage(db, via)
    expect(viaPage!.sightings.map(s => [s.tile.id, s.via])).toEqual([[b, false], [a, true]])
    expect(viaPage!.sightings[0].media.map(m => m.image_key)).toEqual(['q.jpg'])
    expect((await sourcePage(db, work))!.sightings.map(s => [s.tile.id, s.via])).toEqual([[a, false]])
    // A sighting that cites one source both ways is listed once.
    const c = await createEntry(db, fields(), seen({ ...book, via_url: null, via_title: '字書', via_author: '某', via_publisher: '某社', via_report_date: '1900' }), [], who)
    expect((await sourcePage(db, (await getEntry(db, c))!.sightings[0].source_id!))!.sightings.map(s => [s.tile.id, s.via])).toEqual([[a, false], [c, false]])
    await setHidden(db, { entry: a }, true, who, null)
    expect((await sourcePage(db, work))!.sightings.map(s => s.tile.id)).toEqual([c])
    expect((await sourcePage(db, via))!.sightings.map(s => s.tile.id)).toEqual([b])
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

  test('a page carries the via citation', async () => {
    const { db } = open()
    await createEntry(db, fields(), seen({ ...book, ...post }), [], who)
    const sighting = (await exportPage(db, 0, 10)).entries[0].evidence[0]
    expect(sighting).toMatchObject({ title: '字書', ...post })
    expect(sighting.via_id).toBe(2)
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

describe('search by an encoded character', () => {
  test('a record that states a Unicode code is found by the character', async () => {
    const { db } = open()
    const id = await createEntry(db, fields([claim('ids', '⿳吅工吅'), claim('encoding', 'U+5650', { charset: 'unicode' })]), seen(), [], who)
    await createEntry(db, fields([claim('ids', '⿰山東'), claim('encoding', 'A140', { charset: 'big5' })]), seen(), [], who)
    expect((await list(db, { script: 'han', query: '噐' }))!.tiles.map(tile => tile.id)).toEqual([id])
  })
})
