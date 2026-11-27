import { describe, expect, test } from 'bun:test'
import { newClaim, readClaims, type Claim } from '$lib/claims'
import { addSighting, claimedBy, createEntry, editEntry, editSighting, exportPage, getEntry, getSighting, history, list, mediaVisible, mergeEntry, readSightingFields, redactRevision, restoreSighting, revertEntry, setHidden, sourcePage, unmergeEntry, type EntryFields, type SightingFields, type StoredImage, type Via } from './entries'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { mediaBatches } from './export'
import { revisionFields, sightingSnapshot } from './revisions'
import { openTestDb } from './testdb'

const migration = (name: string) => readFileSync(join(import.meta.dir, '../../../migrations', name), 'utf8')
const who = { actor: 'p1', ip: null }
const fields = (claims: Claim[] = []): EntryFields => ({ description: null, radical: null, strokes: null, claims })
const seen = (extra: Partial<SightingFields> = {}): SightingFields => ({ place: 'a shop sign', url: null, title: null, author: null, publisher: null, report_date: null, container: null, source_kind: null, vias: [], original_date: null, page: null, contexts: null, style: null, types: null, quotes: null, note: null, ...extra })
const image = (name: string, box: string | null = null): StoredImage => ({ image_key: `${name}.jpg`, image_type: 'image/jpeg', image_w: 10, image_h: 10, thumb_key: `${name}-t.jpg`, box })
const claim = (kind: Claim['kind'], value: string, data: Claim['data'] = null, links: Partial<Pick<Claim, 'sightings' | 'under'>> = {}): Claim => newClaim(kind, value, data, links)
const book = { title: '字書', author: '某', publisher: '某社', report_date: '1900', url: null }

function open() {
  const opened = openTestDb()
  opened.raw.exec("INSERT INTO people(id, name, created_at) VALUES('p1', 'anon-1', '2026-01-01')")
  return opened
}

describe('claims', () => {
  test('a record keeps several descriptions, codes and tags, and is found by each', async () => {
    const { db } = open()
    const claims = [claim('ids', '⿰山東'), claim('ids', '⿰山东'), claim('encoding', 'U+5D20', { charset: 'unicode' }), claim('tag', 'hakka'), claim('tag', 'IRG')]
    const id = await createEntry(db, fields(claims), seen(), [], who)
    const found = await getEntry(db, id)
    expect(found!.entry.ids).toBe('⿰山東')
    expect(found!.claims).toEqual(claims)
    expect((await claimedBy(db, 'ids', '⿰山东')).map(row => row.id)).toEqual([id])
    expect((await claimedBy(db, 'encoding', 'U+5D20')).map(row => row.id)).toEqual([id])
    for (const facet of ['t:hakka', 't:dialect', 't:IRG']) expect((await list(db, { facet }))!.tiles.map(tile => tile.id)).toEqual([id])
    expect((await list(db, { facet: 't:music' }))!.tiles).toEqual([])
    expect((await list(db, { query: '⿰山东' }))!.tiles.map(tile => tile.id)).toEqual([id])
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
    expect((await list(db, { query: 'dong' }))!.tiles).toEqual([])
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
    const base = [claim('ids', '⿰山東'), claim('tag', 'hakka'), claim('reading', 'tung')]
    const form = new FormData()
    form.set('ids', '⿰山东, ⿰山東')
    form.set('tags_present', '1')
    const read = readClaims(form, [], base)
    expect(read.claims.map(item => [item.kind, item.value])).toEqual([['ids', '⿰山东'], ['ids', '⿰山東'], ['reading', 'tung']])
    expect(read.claims.slice(1)).toEqual([base[0], base[2]])
  })
})

// What becomes of the sightings a claim names when one of them is hidden, edited or moved.
describe('the evidence a claim rests on', () => {
  async function cited(existing?: D1Database) {
    const db = existing ?? open().db
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

  test('hiding a sighting, merging and unmerging each move the time of change of every record they alter', async () => {
    const { db } = open()
    const into = await createEntry(db, fields([claim('reading', 'dong')]), seen({ place: 'three' }), [], who)
    const { id, two } = await cited(db)
    const changed = async (record: number) => (await getEntry(db, record))!.entry.updated_at
    const age = () => db.prepare("UPDATE entries SET updated_at = '2000-01-01T00:00:00.000Z'").run()
    await age()
    expect(await setHidden(db, { entry: id, sighting: two }, true, who, null)).toBe(true)
    expect(await changed(id)).not.toBe('2000-01-01T00:00:00.000Z')
    await age()
    expect((await mergeEntry(db, id, into, who, null)).ok).toBe(true)
    expect(await changed(into)).not.toBe('2000-01-01T00:00:00.000Z')
    await age()
    expect(await unmergeEntry(db, id, who)).toBe(true)
    expect(await changed(into)).not.toBe('2000-01-01T00:00:00.000Z')
    expect(await changed(id)).not.toBe('2000-01-01T00:00:00.000Z')
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

  test('a merge moves the sightings and joins the claims, and undoing it gives each record its own again', async () => {
    const { db } = open()
    const kept = claim('reading', 'dong')
    const into = await createEntry(db, fields([kept]), seen({ place: 'three' }), [], who)
    const three = (await getEntry(db, into))!.sightings[0].id
    const { id, one, two, claims } = await cited(db)
    expect((await mergeEntry(db, id, into, who, null)).ok).toBe(true)
    expect((await getEntry(db, id))!.claims).toEqual(claims)
    expect((await getEntry(db, into))!.claims).toEqual([kept, ...claims])
    expect((await getEntry(db, into))!.sightings.map(sighting => sighting.id)).toEqual([three, one, two])
    // The record the sightings moved to may rest its own claims on them.
    const resting = [{ ...kept, sightings: [two, three] }, ...claims]
    expect(await editEntry(db, into, 2, fields(resting), who, null)).toEqual({ ok: true, rev: 3 })
    expect(await sightingsOf(db, into)).toEqual([[three, two], [two], [one, two], [one]])
    expect(await unmergeEntry(db, id, who)).toBe(true)
    expect((await getEntry(db, id))!.claims).toEqual(claims)
    expect((await getEntry(db, id))!.sightings.map(sighting => sighting.id)).toEqual([one, two])
    // A sighting that went back is no longer the other record's, and what it alone supported went with it.
    expect((await getEntry(db, into))!.claims).toEqual([{ ...kept, sightings: [three] }])
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

const post = { url: 'https://example.test/post/1', title: 'A post', author: 'someone', publisher: null, report_date: '2026-05-01', container: null, source_kind: null, quote: null }
const thread = { url: null, title: 'A thread', author: null, publisher: 'A forum', report_date: null, container: null, source_kind: null, quote: null }
const count = (raw: ReturnType<typeof open>['raw']) => (raw.query('SELECT COUNT(*) AS n FROM sources').get() as { n: number }).n
const chain = (sighting: { vias: object[] }) => sighting.vias.map(via => (({ id: _, ...rest }: any) => rest)(via))

describe('found via', () => {
  test('a via is a source row, reused by hash, and joined into the sighting', async () => {
    const { db, raw } = open()
    const a = await createEntry(db, fields(), seen({ ...book, vias: [post] }), [], who)
    expect(count(raw)).toBe(2)
    const sighting = (await getEntry(db, a))!.sightings[0]
    expect(sighting).toMatchObject({ title: '字書' })
    expect(chain(sighting)).toEqual([post])
    expect(sighting.vias[0].id).not.toBe(sighting.source_id)
    // The same post found through for another book is the same row; a work that was once a via is reused too.
    const b = await createEntry(db, fields(), seen({ vias: [post], title: 'Other book', url: null, author: null, publisher: null, report_date: null }), [], who)
    expect(count(raw)).toBe(3)
    expect((await getEntry(db, b))!.sightings[0].vias[0].id).toBe(sighting.vias[0].id)
    expect(chain((await getSighting(db, sighting.id))!)).toEqual([post])
    // No via means an empty chain.
    const c = await createEntry(db, fields(), seen(book), [], who)
    expect((await getEntry(db, c))!.sightings[0].vias).toEqual([])
    expect(count(raw)).toBe(3)
  })

  test('a chain keeps its order, and the same post twice is one link', async () => {
    const { db, raw } = open()
    const id = await createEntry(db, fields(), seen({ ...book, vias: [post, thread] }), [], who)
    const sighting = (await getEntry(db, id))!.sightings[0]
    expect(chain(sighting)).toEqual([post, thread])
    expect(raw.query('SELECT position FROM sighting_vias WHERE sighting_id = ? ORDER BY position').all(sighting.id)).toEqual([{ position: 0 }, { position: 1 }])
    expect(chain((await getSighting(db, sighting.id))!)).toEqual([post, thread])
    const form = new FormData()
    const quoted = { ...thread, quote: 'A quoted line' }
    for (const via of [post, quoted, post, { url: null, title: null, author: null, publisher: null, report_date: null, container: null, source_kind: null, quote: null }]) {
      form.append('via_url', via.url ?? ''); form.append('via_title', via.title ?? ''); form.append('via_author', via.author ?? ''); form.append('via_publisher', via.publisher ?? ''); form.append('via_report_date', via.report_date ?? ''); form.append('via_quote', via.quote ?? '')
    }
    expect(readSightingFields(form).vias).toEqual([post, quoted])
  })

  test('passages retain separate locators across search, source pages and revisions', async () => {
    const { db, raw } = open()
    const form = new FormData()
    form.append('quote_text', 'First line\nsecond line')
    form.append('quote_locator', 'Caption')
    form.append('quote_text', '冬酒夏醋')
    form.append('quote_locator', 'Sign')
    const { quotes } = readSightingFields(form)
    expect(JSON.parse(quotes!)).toEqual([{ text: 'First line\nsecond line', locator: 'Caption' }, { text: '冬酒夏醋', locator: 'Sign' }])
    const id = await createEntry(db, fields(), seen({ ...book, quotes }), [], who)
    const sighting = (await getEntry(db, id))!.sightings[0]
    expect((await sourcePage(db, sighting.source_id!))!.sightings[0].quotes).toBe(quotes)
    expect(raw.query("SELECT entry_id FROM entry_tags WHERE tag='w:冬'").all()).toEqual([{ entry_id: id }])
    const snapshot = (await history(db, id)).find(r => r.sighting_id === sighting.id)!.snapshot
    expect(sightingSnapshot(snapshot)?.quotes).toBe(quotes)
    const legacy = JSON.parse(snapshot)
    delete legacy.quotes
    expect(sightingSnapshot(JSON.stringify(legacy))?.quotes).toBeNull()
    expect(sightingSnapshot(JSON.stringify({ ...legacy, quotes: '{}' }))).toBeNull()
  })

  test('a quote stays with the sighting and does not split the source', async () => {
    const { db, raw } = open()
    const quoted = { ...post, quote: '《字書》頁三：「東」' }
    const a = await createEntry(db, fields(), seen({ ...book, vias: [quoted] }), [], who)
    expect(count(raw)).toBe(2)
    const b = await createEntry(db, fields(), seen({ ...book, vias: [{ ...post, quote: 'another passage' }] }), [], who)
    // The same post is one source row; the quote is this sighting's link to it.
    expect(count(raw)).toBe(2)
    const sighting = (await getEntry(db, a))!.sightings[0]
    expect(sighting.vias.map(via => [via.title, via.quote])).toEqual([['A post', '《字書》頁三：「東」']])
    expect((await getEntry(db, b))!.sightings[0].vias[0].id).toBe(sighting.vias[0].id)
    // An edit replaces the words, and a restore brings them back.
    await editSighting(db, sighting.id, 1, seen({ ...book, vias: [{ ...post, quote: 'New words' }] }), null, who, null, a)
    expect(chain((await getSighting(db, sighting.id))!)).toEqual([{ ...post, quote: 'New words' }])
    const old = sightingSnapshot((await history(db, a)).find(row => row.sighting_id === sighting.id && row.rev === 1)!.snapshot)!
    expect(old.vias).toEqual([quoted])
    expect(await restoreSighting(db, a, sighting.id, 2, old, who, 1)).toEqual({ ok: true, rev: 3 })
    expect(chain((await getSighting(db, sighting.id))!)).toEqual([quoted])
  })

  test('a form chain is aligned by position, capped at four and checked as one link', () => {
    const form = new FormData()
    for (let i = 0; i < 6; i++) { form.append('via_url', i === 1 ? 'javascript:alert(1)' : `https://example.test/${i}`); form.append('via_title', `T${i}`) }
    const { vias } = readSightingFields(form)
    expect(vias.map(via => via.title)).toEqual(['T0', 'T1', 'T2', 'T3'])
    expect(vias.map(via => via.url)).toEqual(['https://example.test/0', null, 'https://example.test/2', 'https://example.test/3'])
    expect(readSightingFields(new FormData()).vias).toEqual([])
  })

  test('an edit changes, reorders or removes vias and drops a source nothing cites', async () => {
    const { db, raw } = open()
    const id = await createEntry(db, fields(), seen({ ...book, vias: [post, thread] }), [], who)
    expect(count(raw)).toBe(3)
    const sighting = (await getEntry(db, id))!.sightings[0]
    await editSighting(db, sighting.id, 1, seen({ ...book, vias: [thread, post] }), null, who, null, id)
    expect(chain((await getSighting(db, sighting.id))!)).toEqual([thread, post])
    expect(count(raw)).toBe(3)
    await editSighting(db, sighting.id, 2, seen({ ...book, vias: [{ ...thread, title: 'A corrected thread' }] }), null, who, null, id)
    expect(count(raw)).toBe(2)
    expect((await getSighting(db, sighting.id))!.vias.map(via => via.title)).toEqual(['A corrected thread'])
    await editSighting(db, sighting.id, 3, seen(book), null, who, null, id)
    expect(count(raw)).toBe(1)
    expect(await getSighting(db, sighting.id)).toMatchObject({ vias: [], title: '字書' })
    // A source still cited as a via stays: the book becomes the via of a sighting that no longer cites it.
    const other = await addSighting(db, id, seen({ ...book, vias: [post] }), [], who)
    const swapped = { ...post, vias: [{ url: null, title: '字書', author: '某', publisher: '某社', report_date: '1900', container: null, source_kind: null, quote: null }] }
    await editSighting(db, other!, 1, seen(swapped), null, who, null, id)
    expect(count(raw)).toBe(2)
    expect(await getSighting(db, other!)).toMatchObject({ title: 'A post' })
    expect((await getSighting(db, other!))!.vias.map(via => via.title)).toEqual(['字書'])
    expect((await getSighting(db, sighting.id))!.title).toBe('字書')
  })

  test('a two-link chain survives create, read, edit and restore', async () => {
    const { db, raw } = open()
    const id = await createEntry(db, fields(), seen({ ...book, vias: [post, thread] }), [], who)
    const sighting = (await getEntry(db, id))!.sightings[0]
    await editSighting(db, sighting.id, 1, seen({ ...book, vias: [thread, post] }), null, who, null, id)
    await editSighting(db, sighting.id, 2, seen({ ...book, vias: [thread] }), null, who, null, id)
    const rows = (await history(db, id)).filter(row => row.sighting_id === sighting.id)
    // Newest first: after the removal, after the reorder, as created.
    expect(rows.map(row => JSON.parse(row.snapshot).vias.map((via: { title: string }) => via.title))).toEqual([['A thread'], ['A thread', 'A post'], ['A post', 'A thread']])
    const created = sightingSnapshot(rows[2].snapshot)!
    expect(created.vias).toEqual([post, thread])
    expect(await restoreSighting(db, id, sighting.id, 3, created, who, rows[2].rev)).toEqual({ ok: true, rev: 4 })
    expect(chain((await getSighting(db, sighting.id))!)).toEqual([post, thread])
    expect(chain((await getEntry(db, id))!.sightings[0])).toEqual([post, thread])
    expect(raw.query('SELECT count(*) AS n FROM sighting_vias').get()).toEqual({ n: 2 })
  })

  test('history, restore and redaction carry the chain', async () => {
    const { db } = open()
    const id = await createEntry(db, fields(), seen({ ...book, vias: [post] }), [], who)
    const sighting = (await getEntry(db, id))!.sightings[0]
    await editSighting(db, sighting.id, 1, seen(book), null, who, null, id)
    const rows = (await history(db, id)).filter(row => row.sighting_id === sighting.id)
    expect(JSON.parse(rows[1].snapshot)).toMatchObject({ vias: [post] })
    expect(JSON.parse(rows[0].snapshot)).toMatchObject({ vias: [] })
    const old = sightingSnapshot(rows[1].snapshot)!
    expect(old.vias).toEqual([post])
    expect(await restoreSighting(db, id, sighting.id, 2, old, who, rows[1].rev)).toEqual({ ok: true, rev: 3 })
    expect(chain((await getSighting(db, sighting.id))!)).toEqual([post])
    expect(JSON.parse((await history(db, id))[0].snapshot)).toMatchObject({ vias: [post] })
    expect(sightingSnapshot(JSON.stringify({ ...old, vias: [{ ...post, url: 'javascript:alert(1)' }] }))).toBeNull()
    expect(sightingSnapshot(JSON.stringify({ ...old, vias: [{ ...post, title: 5 }] }))).toBeNull()
    expect(sightingSnapshot(JSON.stringify({ ...old, vias: [post, thread, post, thread, { ...post, title: 'x' }] }))).toBeNull()
    expect(sightingSnapshot(JSON.stringify({ ...old, via_url: null }))).toBeNull()
    expect(await redactRevision(db, id, rows[1].id, who, 'private')).toBe(true)
  })

  test('a source used only as a via is counted, and counted again when its sighting goes', async () => {
    const { db, raw } = open()
    const records = () => raw.query('SELECT title, records FROM sources ORDER BY id').all()
    const a = await createEntry(db, fields(), seen({ ...book, vias: [post, thread] }), [], who)
    await createEntry(db, fields(), seen({ title: 'Other', vias: [post] }), [], who)
    expect(records()).toEqual([{ title: '字書', records: 1 }, { title: 'A post', records: 2 }, { title: 'A thread', records: 1 }, { title: 'Other', records: 1 }])
    await setHidden(db, { entry: a }, true, who, null)
    expect(records()).toEqual([{ title: '字書', records: 0 }, { title: 'A post', records: 1 }, { title: 'A thread', records: 0 }, { title: 'Other', records: 1 }])
  })

  test('the source page lists the sightings that cite it and those found through it', async () => {
    const { db } = open()
    const a = await createEntry(db, fields(), seen({ ...book, vias: [thread, post] }), [], who)
    const b = await createEntry(db, fields(), seen({ place: 'a post', ...post, vias: [], }), [image('q')], who)
    const [work, via] = [(await getEntry(db, a))!.sightings[0].source_id!, (await getEntry(db, a))!.sightings[0].vias[1].id]
    const viaPage = await sourcePage(db, via)
    expect(viaPage!.sightings.map(s => [s.tile.id, s.via])).toEqual([[b, false], [a, true]])
    expect(viaPage!.sightings.map(s => s.vias.map(link => link.title))).toEqual([[], ['A thread', 'A post']])
    expect(viaPage!.sightings[0].media.map(m => m.image_key)).toEqual(['q.jpg'])
    expect((await sourcePage(db, work))!.sightings.map(s => [s.tile.id, s.via])).toEqual([[a, false]])
    // A sighting that cites one source both ways is listed once.
    const c = await createEntry(db, fields(), seen({ ...book, vias: [{ url: null, title: '字書', author: '某', publisher: '某社', report_date: '1900', container: null, source_kind: null, quote: null }] }), [], who)
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
    const tile = (await list(db, {}))!.tiles[0]
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
    await createEntry(db, fields(), seen({ ...book, vias: [post] }), [], who)
    const sighting = (await exportPage(db, 0, 10)).entries[0].evidence[0]
    expect(sighting).toMatchObject({ title: '字書', vias: [{ id: 2, ...post }] })
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
    expect(readClaims(form, []).error).toBe('relatedCharacters')
  })
})

describe('search by an encoded character', () => {
  test('a record that states a Unicode code is found by the character', async () => {
    const { db } = open()
    const id = await createEntry(db, fields([claim('ids', '⿳吅工吅'), claim('encoding', 'U+5650', { charset: 'unicode' })]), seen(), [], who)
    await createEntry(db, fields([claim('ids', '⿰山東'), claim('encoding', 'A140', { charset: 'big5' })]), seen(), [], who)
    expect((await list(db, { query: '噐' }))!.tiles.map(tile => tile.id)).toEqual([id])
  })
})

describe('part rows', () => {
  const parts = (raw: ReturnType<typeof openTestDb>['raw']) => (raw.query("SELECT entry_id, tag, sightings, year FROM entry_tags WHERE tag GLOB 'p:*' ORDER BY entry_id, tag").all() as { entry_id: number; tag: string; sightings: number; year: number | null }[])

  test('a record has one part row per distinct part of each of its descriptions, kept current on every write', async () => {
    const { db, raw } = open()
    const id = await createEntry(db, fields([claim('ids', '⿰⺅⿱木木'), claim('ids', '⿰⼈水')]), seen({ report_date: '1930' }), [], who)
    expect(parts(raw)).toEqual(['人', '亻', '木', '水'].sort().map(part => ({ entry_id: id, tag: `p:${part}`, sightings: 0, year: null })))
    await editEntry(db, id, 1, fields([claim('ids', '⿰火土')]), who, null)
    expect(parts(raw).map(row => row.tag)).toEqual(['p:土', 'p:火'])
    await setHidden(db, { entry: id }, true, who, null)
    expect(parts(raw)).toEqual([])
    expect((raw.query("SELECT tag FROM tag_counts WHERE tag GLOB 'p:*'").all())).toEqual([])
  })

  test('0020 gives existing records the rows a write gives them, and skips hidden and merged records', async () => {
    const { db, raw } = open()
    const a = await createEntry(db, fields([claim('ids', '⿰⺅⿱木木'), claim('ids', '⿰⼈水')]), seen(), [], who)
    const b = await createEntry(db, fields([claim('ids', '⿺辶⿱山⿰𠀀日')]), seen(), [], who)
    const hidden = await createEntry(db, fields([claim('ids', '⿰金金')]), seen(), [], who)
    await setHidden(db, { entry: hidden }, true, who, null)
    const merged = await createEntry(db, fields([claim('ids', '⿰火火')]), seen(), [], who)
    await mergeEntry(db, merged, a, who, null)
    await createEntry(db, fields(), seen(), [], who)
    const written = parts(raw)
    expect(written).toHaveLength(9)
    raw.exec("DELETE FROM entry_tags WHERE tag GLOB 'p:*'")
    raw.exec(migration('0020_part_tags.sql').slice(migration('0020_part_tags.sql').indexOf('WITH RECURSIVE')))
    expect(parts(raw)).toEqual(written)
    expect(written.every(row => row.entry_id === a || row.entry_id === b)).toBe(true)
  })

  test('0020 leaves the order indexes to the rows they list', () => {
    const { raw } = open()
    const plan = (raw.query("EXPLAIN QUERY PLAN SELECT entry_id FROM entry_tags t WHERE t.tag = ? AND (t.sightings, t.entry_id) < (?, ?) AND t.tag NOT GLOB '[wp]:*' ORDER BY t.sightings DESC, t.entry_id DESC LIMIT 5").all('all', 9, 9) as { detail: string }[]).map(row => row.detail).join('\n')
    expect(plan).toContain('entry_tags_by_sightings')
  })
})

describe('the pictures of a go-between', () => {
  const shot = (name: string) => { const { box: _, ...picture } = image(name); return picture }
  const message = (author: string, quote: string | null = null, pictures?: ReturnType<typeof shot>[]): Via => ({ url: null, title: null, author, publisher: 'QQ', report_date: '2026-11-14', container: '某討論羣', source_kind: null, quote, ...(pictures ? { pictures } : {}) })
  const held = async (db: D1Database, id: number) => (await getSighting(db, id))!.vias.map(via => [via.author, (via.pictures ?? []).map(picture => picture.image_key)])
  const add = async (vias: Via[]) => {
    const { db, raw } = open()
    raw.exec('PRAGMA foreign_keys = ON')
    const id = await createEntry(db, fields(), seen({ vias }), [image('page')], who)
    return { db, raw, id, sighting: (await getEntry(db, id))!.sightings[0].id }
  }

  test('follow the go-between through an edit and a reorder, and go with it', async () => {
    const { db, raw, id, sighting } = await add([message('甲', null, [shot('a'), shot('b')]), message('乙', '文', [shot('c')])])
    expect(await held(db, sighting)).toEqual([['甲', ['a.jpg', 'b.jpg']], ['乙', ['c.jpg']]])
    const { vias } = (await getSighting(db, sighting))!
    await editSighting(db, sighting, 1, seen({ vias: [message('丙'), vias[1], vias[0]] }), null, who, null, id)
    expect(await held(db, sighting)).toEqual([['丙', []], ['乙', ['c.jpg']], ['甲', ['a.jpg', 'b.jpg']]])
    // The cover and the pictures of the sighting are its own.
    expect((await getEntry(db, id))!.entry.cover_key).toBe('page-t.jpg')
    expect((await getSighting(db, sighting))!.media.map(picture => picture.image_key)).toEqual(['page.jpg'])
    await editSighting(db, sighting, 2, seen({ vias: [vias[0]] }), null, who, null, id)
    expect(await held(db, sighting)).toEqual([['甲', ['a.jpg', 'b.jpg']]])
    expect((raw.query('SELECT count(*) AS n FROM sighting_via_media').get() as { n: number }).n).toBe(2)
  })

  test('are seen while the sighting is, and no longer once they are gone', async () => {
    const { db, id, sighting } = await add([message('甲', null, [shot('a')])])
    for (const key of ['a.jpg', 'a-t.jpg']) expect(await mediaVisible(db, key)).toBe(true)
    await setHidden(db, { entry: id, sighting }, true, who, null)
    for (const key of ['a.jpg', 'a-t.jpg']) expect(await mediaVisible(db, key)).toBe(false)
    await setHidden(db, { entry: id, sighting }, false, who, null)
    expect(await mediaVisible(db, 'a.jpg')).toBe(true)
    await editSighting(db, sighting, (await getSighting(db, sighting))!.rev, seen({ vias: [message('甲')] }), null, who, null, id)
    expect(await mediaVisible(db, 'a.jpg')).toBe(false)
  })

  test('of rows that repeat one message are kept together', async () => {
    const { db, sighting } = await add([message('甲', '文', [shot('a'), shot('b')]), message('甲', '文', [shot('b'), shot('c'), shot('d'), shot('e')]), message('甲', '別文')])
    expect(await held(db, sighting)).toEqual([['甲', ['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg', 'e.jpg']], ['甲', []]])
  })

  test('stay as they are through a restore: none comes back, none is lost, and each goes where the version had it', async () => {
    const { db, id, sighting } = await add([message('甲', '文', [shot('a')]), message('乙', null, [shot('b')])])
    const version = async (rev: number) => sightingSnapshot((await history(db, id)).find(row => row.sighting_id === sighting && row.rev === rev)!.snapshot)!
    const rev = async () => (await getSighting(db, sighting))!.rev
    const edit = async (vias: Via[]) => editSighting(db, sighting, await rev(), seen({ vias }), null, who, null, id)
    const restore = async (to: number) => restoreSighting(db, id, sighting, await rev(), await version(to), who, to)
    const words = async () => (await getSighting(db, sighting))!.vias.map(item => [item.author, item.quote, (item.pictures ?? []).map(picture => picture.image_key)])
    // Undoing a change to the words of a link brings its pictures back to it.
    await edit([message('甲', '誤', [shot('a')]), message('乙', null, [shot('b')])])
    await restore(1)
    expect(await words()).toEqual([['甲', '文', ['a.jpg']], ['乙', null, ['b.jpg']]])
    // The history shows the text of a version alone.
    expect((await history(db, id)).map(row => revisionFields(row).sightingFields).filter(Boolean).every(fields => fields!.vias.every(item => !('pictures' in item)))).toBe(true)
    // A picture taken away does not come back with the words, even when the citation was corrected since.
    await edit([{ ...message('甲', '文'), report_date: '2026-11-15' }, message('乙', null, [shot('b')])])
    await restore(3)
    expect(await words()).toEqual([['甲', '文', []], ['乙', null, ['b.jpg']]])
    // A picture given to a corrected link stays with that link, beside the one the version names.
    await edit([message('甲', '改', [shot('c')])])
    await restore(3)
    expect(await words()).toEqual([['甲', '文', []], ['乙', null, []], ['甲', '改', ['c.jpg']]])
    // In a full chain the links with pictures stay.
    await edit([message('丙', null, [shot('c')]), message('丁', null, [shot('d')]), message('戊', null, [shot('e')])])
    await restore(3)
    expect(await words()).toEqual([['甲', '文', []], ['丙', null, ['c.jpg']], ['丁', null, ['d.jpg']], ['戊', null, ['e.jpg']]])
  })

  test('are in the export, each with the go-between it shows', async () => {
    const { db, id, sighting } = await add([message('甲'), message('乙', null, [shot('a'), shot('b')])])
    expect((await exportPage(db, 0, 10)).entries[0].evidence[0].vias.map(via => via.pictures?.map(picture => picture.image_key))).toEqual([undefined, ['a.jpg', 'b.jpg']])
    const rows = []
    for await (const batch of mediaBatches(db, 1)) rows.push(...batch)
    expect(rows.map(row => [row.sighting_id, row.image_key, row.via_position, row.source_author])).toEqual([[sighting, 'page.jpg', null, null], [sighting, 'a.jpg', 1, '乙'], [sighting, 'b.jpg', 1, '乙']])
    await setHidden(db, { entry: id, sighting }, true, who, null)
    for await (const batch of mediaBatches(db, 1)) expect(batch).toEqual([])
  })
})
