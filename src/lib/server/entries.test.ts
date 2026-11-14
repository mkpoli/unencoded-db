import { beforeEach, describe, expect, test } from 'bun:test'
import { newClaim, readClaims, type Claim } from '$lib/claims'
import { addSighting, claimedBy, counts, createEntry, customScripts, customScriptsStatement, editEntry, editSighting, entryFieldsOf, exportPage, getEntry, history, list, listStatement, mediaVisible, mergeEntry, readBoxes, readEntryFields, readSightingFields, restoreSighting, revertEntry, SEARCH_WINDOW, sourcePage, setHidden, SightingLimitError, terms, unmergeEntry, type EntryFields, type SightingFields, type StoredImage } from './entries'
import { joinAtlas, createPerson, personOf, startSession } from './people'
import { openTestDb } from './testdb'

const fields = (over: Partial<EntryFields> = {}): EntryFields => ({ script: 'han', script_other: null, description: null, radical: null, strokes: null, claims: [], ...over })
const claim = (kind: Claim['kind'], value: string, data: Claim['data'] = null, links: Partial<Pick<Claim, 'sightings' | 'under'>> = {}): Claim => newClaim(kind, value, data, links)
const described = (...sequences: string[]) => fields({ claims: sequences.map(sequence => claim('ids', sequence)) })
const relation = (character: string, relationship: string, difference = '', evidence = ''): Claim => claim('relation', character, { relationship, ...(difference ? { difference } : {}), ...(evidence ? { evidence } : {}) })
const seen = (over: Partial<SightingFields> = {}): SightingFields => ({ place: 'A shop sign in Tainan', url: null, title: null, author: null, publisher: null, report_date: null, via_url: null, via_title: null, via_author: null, via_publisher: null, via_report_date: null, original_date: null, page: null, context: null, style: null, types: null, note: null, ...over })
const image: StoredImage = { image_key: 'a.webp', image_type: 'image/webp', image_w: 100, image_h: 100, thumb_key: 't.webp', box: null }

let db: D1Database, raw: ReturnType<typeof openTestDb>['raw'], who: { actor: string; ip: null }
beforeEach(async () => {
  ({ db, raw } = openTestDb())
  who = { actor: (await createPerson(db)).id, ip: null }
})

test('structured comparisons retain evidence across edits and restoration', async () => {
  const form = new FormData()
  form.set('related_characters_present', '1')
  for (const [character, relationship, difference, evidence] of [['木', 'variant', 'One extra stroke', 'Dictionary p. 10'], ['林', 'uncertain', 'Different component', 'Inscription A']]) {
    form.append('related_character', character); form.append('related_relationship', relationship)
    form.append('related_difference', difference); form.append('related_evidence', evidence)
  }
  const { fields: values, error } = readEntryFields(form)
  expect(error).toBeNull()
  const relations = values.claims
  expect(relations.map(({ key, ...rest }) => rest)).toEqual([relation('木', 'variant', 'One extra stroke', 'Dictionary p. 10'), relation('林', 'uncertain', 'Different component', 'Inscription A')].map(({ key, ...rest }) => rest))
  const id = await createEntry(db, values, seen(), [], who)
  const original = (await history(db, id)).find(row => row.kind === 'create')!
  expect((await getEntry(db, id))!.sightings[0].place).toBe('A shop sign in Tainan')
  await editEntry(db, id, 1, { ...values, claims: [] }, who, null)
  await revertEntry(db, id, original.id, who)
  expect((await getEntry(db, id))!.claims).toEqual(relations)
  expect(JSON.parse((await history(db, id))[0].snapshot).claims).toEqual(relations)
})

test('search indexes comparison characters, differences and evidence through edits and restores', async () => {
  const initial = fields({ claims: [relation('𠀀', 'variant', 'distinctive hook', 'Gazetteer 1932')] })
  const id = await createEntry(db, initial, seen(), [], who)
  const original = (await history(db, id)).find(row => row.kind === 'create')!
  for (const query of ['𠀀', 'distinctive', 'gazetteer']) expect((await list(db, { query }))!.tiles.map(tile => tile.id)).toEqual([id])
  expect((await list(db, { query: 'relationship' }))!.tiles).toEqual([])
  await editEntry(db, id, 1, { ...initial, claims: [] }, who, null)
  for (const query of ['𠀀', 'distinctive', 'gazetteer']) expect((await list(db, { query }))!.tiles).toEqual([])
  await revertEntry(db, id, original.id, who)
  expect((await list(db, { query: '𠀀' }))!.tiles.map(tile => tile.id)).toEqual([id])
})

test('comparison indexing preserves existing terms at the 400-word cap', async () => {
  const description = Array.from({ length: 400 }, (_, i) => `token${i}`).join(' ')
  const initial = fields({ description })
  const id = await createEntry(db, initial, seen(), [], who)
  expect((await list(db, { query: 'token399' }))!.tiles.map(tile => tile.id)).toEqual([id])
  await editEntry(db, id, 1, { ...initial, claims: [relation('木', 'not_variant')] }, who, null)
  expect((await list(db, { query: 'token399' }))!.tiles.map(tile => tile.id)).toEqual([id])
})

test('omitted comparison controls preserve existing data; explicit empty controls clear it', () => {
  const original = fields({ claims: [relation('木', 'similar')] })
  const form = new FormData()
  expect(readEntryFields(form, original).fields.claims).toEqual(original.claims)
  form.set('related_characters_present', '1')
  expect(readEntryFields(form, original).fields.claims).toEqual([])
})

describe('marked works', () => {
  const code = (charset: string, value: string) => claim('encoding', value, { charset })
  const ids = async (listing: Parameters<typeof list>[1]) => (await list(db, listing))!.tiles.map(tile => tile.id)

  test('a record is listed in or out of each marked work, and moves with its codes', async () => {
    const encoded = await createEntry(db, fields({ claims: [code('unicode', 'U+2D6DD')] }), seen(), [], who)
    const filed = await createEntry(db, fields({ claims: [code('zitools', '⿰魚它'), code('mj', 'MJ059588')] }), seen(), [], who)
    const bare = await createEntry(db, fields(), seen(), [], who)
    expect(await ids({ within: ['unicode'] })).toEqual([encoded])
    expect((await list(db, {}))!.tiles.map(tile => tile.marks)).toEqual([[], ['zitools', 'mj'], ['unicode', 'zitools', 'yedict', 'glyphwiki']])
    expect(await ids({ within: ['zitools'] })).toEqual([filed, encoded])
    expect(await ids({ without: ['zitools'] })).toEqual([bare])
    expect(await ids({ within: ['zitools'], without: ['unicode'] })).toEqual([filed])
    expect(await ids({ script: 'han', filter: 'unchecked', without: ['zitools', 'yedict', 'glyphwiki', 'mj'] })).toEqual([bare])
    expect(await ids({ within: ['zitools'], without: ['zitools'] })).toEqual([])
    expect(await counts(db)).toMatchObject({ 'r:unicode': 1, 'x:unicode': 2, 'r:zitools': 2, 'x:zitools': 1, 'r:glyphwiki': 1, 'x:glyphwiki': 2, 'r:mj': 1, 'x:mj': 2 })

    await editEntry(db, bare, 1, fields({ claims: [code('glyphwiki', 'irg2021-03300')] }), who, null)
    await editEntry(db, encoded, 1, fields(), who, null)
    expect(await ids({ within: ['glyphwiki'] })).toEqual([bare])
    expect((await list(db, {}))!.tiles.map(tile => tile.marks)).toEqual([['glyphwiki'], ['zitools', 'mj'], []])
    expect(await ids({ without: ['unicode'] })).toEqual([bare, filed, encoded])
    expect(await counts(db)).toMatchObject({ 'x:unicode': 3, 'r:zitools': 1, 'x:zitools': 2, 'r:glyphwiki': 1, 'x:glyphwiki': 2 })
    expect((await counts(db))['r:unicode'] ?? 0).toBe(0)
  })

  test('a short list is read by its own key, however long the others are', async () => {
    const rare = await createEntry(db, fields({ claims: [newClaim('relation', '哦', { relationship: 'homograph' })] }), seen(), [], who)
    for (let i = 0; i < SEARCH_WINDOW + 10; i++) await createEntry(db, fields(), seen(), [], who)
    expect(await list(db, { script: 'han', filter: 'homograph', without: ['mj'] })).toEqual({ tiles: [expect.objectContaining({ id: rare })], next: null, partial: false })
    expect(await list(db, { script: 'han', filter: 'homograph', within: ['mj'] })).toEqual({ tiles: [], next: null, partial: false })
  })

  test('a work that is not marked names no list', async () => {
    expect(await list(db, { within: ['big5'] })).toBeNull()
    expect(await list(db, { without: ['nowhere'] })).toBeNull()
  })
})

describe('adding a record', () => {
  test('rolls back the entry and sighting when indexing fails', async () => {
    raw.exec("CREATE TRIGGER fail_index BEFORE INSERT ON entry_tags BEGIN SELECT RAISE(ABORT, 'index failure'); END")
    await expect(createEntry(db, fields(), seen(), [image], who)).rejects.toThrow('index failure')
    for (const table of ['entries', 'sightings', 'revisions', 'entry_tags', 'tag_counts'])
      expect(raw.query(`SELECT count(*) AS n FROM ${table}`).get()).toEqual({ n: 0 })
  })

  test('concurrent creates retain both entries and facet counts', async () => {
    const ids = await Promise.all(Array.from({ length: 10 }, () => createEntry(db, fields(), seen(), [], who)))
    expect(new Set(ids).size).toBe(10)
    expect((await list(db, {}))!.tiles).toHaveLength(10)
    expect(await counts(db)).toMatchObject({ all: 10, 's:han': 10 })
    for (const id of ids) expect((await history(db, id))).toHaveLength(2)
  })

  test('a place and an image are enough, and whoever and whenever are recorded', async () => {
    const id = await createEntry(db, fields(), seen(), [image], who)
    const found = await getEntry(db, id)
    expect(found!.entry.by_id).toBe(who.actor)
    expect(found!.entry.cover_key).toBe('t.webp')
    expect(found!.sightings).toHaveLength(1)
    expect(found!.sightings[0].created_at).toMatch(/^\d{4}-/)
    expect((await history(db, id)).map(row => row.kind).sort()).toEqual(['create', 'sighting'])
  })

  test('a record starts with several sightings, as if each had been added after it', async () => {
    const book = { title: 'Zidian', author: 'Mei Yingzuo', report_date: '1615' }
    const later = [
      { fields: seen({ place: 'Page 12', ...book, types: JSON.stringify(['definition']) }), media: [image] },
      { fields: seen({ place: 'Page 40', ...book }), media: [] },
      { fields: seen({ place: 'A post', url: 'https://example.test/post', via_title: 'A thread' }), media: [] },
    ]
    const first = seen({ place: 'A shop sign', report_date: '1932', types: JSON.stringify(['mention']) })
    const id = await createEntry(db, described('⿰山東'), first, [], who, later)
    const found = (await getEntry(db, id))!
    expect(found.sightings.map(sighting => sighting.place)).toEqual(['A shop sign', 'Page 12', 'Page 40', 'A post'])
    expect(found.sightings.map(sighting => sighting.media.length)).toEqual([0, 1, 0, 0])
    expect(found.sightings.every(sighting => sighting.entry_id === id && sighting.first_entry === id)).toBe(true)
    // The two pages cite one book; the sign's date, the post's link and what the post was found through are sources of their own.
    expect(found.sightings[1].source_id).toBe(found.sightings[2].source_id)
    expect(new Set(found.sightings.map(sighting => sighting.source_id)).size).toBe(3)
    expect(found.sightings.map(sighting => sighting.via_id === null)).toEqual([true, true, true, false])
    expect(raw.query('SELECT count(*) AS n FROM sources').get()).toEqual({ n: 4 })
    const journal = raw.query('SELECT kind, sighting_id, rev FROM revisions WHERE entry_id = ? ORDER BY id').all(id)
    expect(journal).toEqual([{ kind: 'create', sighting_id: null, rev: 1 }, ...found.sightings.map(sighting => ({ kind: 'sighting', sighting_id: sighting.id, rev: 1 }))])

    const other = await createEntry(db, described('⿰山東'), first, [], who)
    for (const draft of later) await addSighting(db, other, draft.fields, draft.media, who)
    const summary = (entry: number) => raw.query('SELECT ids, cover_key, cover_place, sightings, types, first_year, first_year_kind FROM entries WHERE id = ?').get(entry)
    const tags = (entry: number) => raw.query('SELECT tag FROM entry_tags WHERE entry_id = ? ORDER BY tag').all(entry)
    expect(summary(id)).toEqual(summary(other))
    expect(summary(id)).toMatchObject({ cover_key: 't.webp', cover_place: 'Page 12', sightings: 4, first_year: '1615' })
    expect(tags(id)).toEqual(tags(other))
  })

  test('a later sighting that cannot be written leaves nothing behind', async () => {
    raw.exec("CREATE TRIGGER fail_second BEFORE INSERT ON sightings WHEN NEW.place = 'second' BEGIN SELECT RAISE(ABORT, 'second sighting'); END")
    await expect(createEntry(db, fields(), seen(), [image], who, [{ fields: seen({ place: 'second', title: 'Book' }), media: [image] }])).rejects.toThrow('second sighting')
    for (const table of ['entries', 'sightings', 'sighting_media', 'sources', 'claims', 'revisions', 'entry_tags', 'tag_counts'])
      expect(raw.query(`SELECT count(*) AS n FROM ${table}`).get()).toEqual({ n: 0 })
  })

  test('a record lands in the lists of its script, its status and what it lacks', async () => {
    const id = await createEntry(db, fields({ script: 'nom' }), seen(), [], who)
    for (const [script, filter] of [[null, null], ['nom', null], [null, 'unchecked'], ['nom', 'unchecked'], [null, 'image'], [null, 'ids'], ['nom', 'source']] as const)
      expect((await list(db, { script, filter }))!.tiles.map(tile => tile.id)).toEqual([id])
    expect((await list(db, { script: 'han' }))!.tiles).toEqual([])
    expect(await counts(db)).toMatchObject({ all: 1, 's:nom': 1, 'f:unchecked': 1, 'n:image': 1 })
  })

  test('a filter that does not exist lists nothing', async () => {
    expect(await list(db, { filter: 'nope' })).toBeNull()
    expect(await list(db, { script: 'nope' })).toBeNull()
  })

  test('a tile summarizes its source types and the earliest report year among its sightings', async () => {
    const id = await createEntry(db, fields(), seen({ report_date: '1932', types: JSON.stringify(['mention']) }), [], who)
    await addSighting(db, id, seen({ report_date: 'c. 1716', types: JSON.stringify(['reading', 'attestation']) }), [], who)
    await addSighting(db, id, seen({ report_date: '1897', types: JSON.stringify(['attestation']) }), [], who)
    const [tile] = (await list(db, {}))!.tiles
    expect(tile).toMatchObject({ id, types: ['mention', 'attestation', 'reading'], firstYear: '1716', firstYearKind: 'report', sightings: 3 })
  })
})

describe('search', () => {
  test('complete IDS searches the exact normalized sequence, not components or prose', async () => {
    const exact = await createEntry(db, described('⿰木木'), seen(), [], who)
    await createEntry(db, described('⿱木木'), seen(), [], who)
    await createEntry(db, described('⿰木水'), seen(), [], who)
    await createEntry(db, fields({ description: '⿰木木' }), seen(), [], who)
    expect((await list(db, { query: '⿰ 木 木' }))!.tiles.map(tile => tile.id)).toEqual([exact])
    expect((await list(db, { query: '⿰木' }))!.tiles).toHaveLength(4)
    const variant = await createEntry(db, described('⿰𠀀󠄀木'), seen(), [], who)
    await createEntry(db, described('⿰𠀀木'), seen(), [], who)
    expect((await list(db, { query: '⿰𠀀󠄀木' }))!.tiles.map(tile => tile.id)).toEqual([variant])
  })

  test('exact IDS search pages through bounded candidates without skipping', async () => {
    const n = SEARCH_WINDOW * 2 + 10
    raw.prepare(`WITH RECURSIVE seq(x) AS (VALUES(1) UNION ALL SELECT x+1 FROM seq WHERE x < ?)
      INSERT INTO entries(id, script, ids, created_by, created_at, updated_at)
      SELECT x, 'han', CASE WHEN x IN (1, 2, 300, 520) THEN '⿰木木' ELSE '⿱木木' END, ?, '2026', '2026' FROM seq`).run(n, who.actor)
    raw.exec("INSERT INTO claims(entry_id, position, key, kind, value) SELECT id, 0, printf('ids%05d', id), 'ids', ids FROM entries")
    raw.exec("INSERT INTO entry_tags(tag, entry_id) SELECT 'all', id FROM entries")
    let before: number | null = null
    const found: number[] = []
    let pages = 0
    do {
      const candidates = (await listStatement(db, { query: '⿰木木', before, limit: 1 })!.all()).results
      expect(candidates.length).toBeLessThanOrEqual(SEARCH_WINDOW + 1)
      const page: NonNullable<Awaited<ReturnType<typeof list>>> = (await list(db, { query: '⿰木木', before, limit: 1 }))!
      found.push(...page.tiles.map(tile => tile.id))
      before = page.next
      expect(++pages).toBeLessThan(10)
    } while (before !== null)
    expect(found).toEqual([520, 300, 2, 1])
  })
  test('finds a part inside a description sequence and a word in the place', async () => {
    const id = await createEntry(db, described('⿰亻⿱七木'), seen({ place: 'Kangxi dictionary' }), [], who)
    await createEntry(db, described('⿱艹水'), seen(), [], who)
    expect((await list(db, { query: '亻' }))!.tiles.map(tile => tile.id)).toEqual([id])
    expect((await list(db, { query: '亻 木' }))!.tiles.map(tile => tile.id)).toEqual([id])
    expect((await list(db, { query: 'KANGXI' }))!.tiles.map(tile => tile.id)).toEqual([id])
    expect((await list(db, { query: '亻 艹' }))!.tiles).toEqual([])
  })

  test('rare and absent terms scan bounded candidate ranges and continue without skipping', async () => {
    const n = SEARCH_WINDOW * 3 + 20
    raw.prepare(`WITH RECURSIVE seq(x) AS (VALUES(1) UNION ALL SELECT x+1 FROM seq WHERE x < ?)
      INSERT INTO entries(id, script, created_by, created_at, updated_at) SELECT x, 'han', ?, '2026', '2026' FROM seq`).run(n, who.actor)
    raw.exec("INSERT INTO entry_tags(tag, entry_id) SELECT 'all', id FROM entries")
    raw.exec("INSERT INTO entry_tags(tag, entry_id) SELECT 'w:rare', id FROM entries WHERE id IN (2, 100, 300, 520, 700)")
    raw.exec("INSERT INTO entry_tags(tag, entry_id) SELECT 'w:other', id FROM entries WHERE id IN (2, 300, 700)")

    for (const query of ['absent', 'rare', 'rare other']) {
      let before: number | null = null
      const found: number[] = []
      let pages = 0
      do {
        const statement = listStatement(db, { query, before, limit: 2 })!
        const candidates = (await statement.all<{ id: number; matches: number }>()).results
        // Every row returned by the statement is a facet candidate, including nonmatches.
        expect(candidates.length).toBeLessThanOrEqual(SEARCH_WINDOW + 1)
        const page: NonNullable<Awaited<ReturnType<typeof list>>> = (await list(db, { query, before, limit: 2 }))!
        found.push(...page.tiles.map(tile => tile.id))
        if (page.next !== null) expect(before === null || page.next < before).toBe(true)
        before = page.next
        expect(++pages).toBeLessThan(10)
      } while (before !== null)
      expect(found).toEqual(query === 'absent' ? [] : query === 'rare' ? [700, 520, 300, 100, 2] : [700, 300, 2])
    }
    const first = (await list(db, { query: 'absent' }))!
    expect(first).toMatchObject({ tiles: [], next: n - SEARCH_WINDOW + 1, partial: true })
    const candidates = (await listStatement(db, { query: 'absent' })!.all<{ matches: number }>()).results
    expect(candidates).toHaveLength(SEARCH_WINDOW + 1)
    expect(candidates.every(row => row.matches === 0)).toBe(true)

    // Instrument the driving range in SQLite, rather than inferring its work from matches.
    const statement = listStatement(db, { query: 'absent' }) as unknown as { sql: string; values: unknown[] }
    const instrumented = statement.sql.replace('WHERE t.tag = ?', 'WHERE observe(t.entry_id) AND t.tag = ?')
    const python = `import sys, sqlite3, json\ndb=sqlite3.connect(':memory:')\ndb.deserialize(sys.stdin.buffer.read())\nseen=[]\ndb.create_function('observe', 1, lambda n: seen.append(n) or 1)\ndb.execute(sys.argv[1], json.loads(sys.argv[2])).fetchall()\nprint(len(seen))`
    const run = Bun.spawnSync(['python3', '-c', python, instrumented, JSON.stringify(statement.values)], { stdin: raw.serialize() })
    expect(run.exitCode).toBe(0)
    expect(Number(run.stdout.toString().trim())).toBe(SEARCH_WINDOW + 1)
  })

  test('rejects excess distinct terms and queries without searchable terms', async () => {
    await createEntry(db, fields({ description: 'one two three four five' }), seen(), [], who)
    expect(await list(db, { query: 'one two three four five six' })).toBeNull()
    expect(await list(db, { query: '... ⿰' })).toBeNull()
    expect(await list(db, { query: 'a'.repeat(201) })).toBeNull()
    expect((await list(db, { query: 'one one two three four five' }))!.tiles).toHaveLength(1)
  })

  test('operators are not terms', () => expect(terms('⿰亻木')).toEqual(['亻', '木']))
})

describe('the wiki', () => {
  test('rolls back an entry edit when its index fails', async () => {
    const id = await createEntry(db, fields({ description: 'old' }), seen(), [], who)
    raw.exec("CREATE TRIGGER fail_edit_index BEFORE DELETE ON entry_tags BEGIN SELECT RAISE(ABORT, 'index failure'); END")
    await expect(editEntry(db, id, 1, fields({ description: 'new' }), who, null)).rejects.toThrow('index failure')
    expect((await getEntry(db, id))!.entry).toMatchObject({ rev: 1, description: 'old' })
    expect((await history(db, id))).toHaveLength(2)
    expect((await list(db, { query: 'old' }))!.tiles.map(tile => tile.id)).toEqual([id])
  })

  test('concurrent edits of one revision have one winner', async () => {
    const id = await createEntry(db, fields(), seen(), [], who)
    const results = await Promise.all(['first', 'second'].map(description => editEntry(db, id, 1, fields({ description }), who, null)))
    expect(results.filter(result => result.ok)).toHaveLength(1)
    expect(results.filter(result => !result.ok)).toEqual([{ ok: false, code: 'conflict' }])
    expect((await history(db, id)).filter(row => row.kind === 'edit')).toHaveLength(1)
  })

  test('an edit against an old revision is refused, and history keeps every state', async () => {
    const id = await createEntry(db, fields({ description: 'first' }), seen(), [], who)
    expect(await editEntry(db, id, 1, fields({ description: 'second' }), who, null)).toEqual({ ok: true, rev: 2 })
    expect(await editEntry(db, id, 1, fields({ description: 'stale' }), who, null)).toEqual({ ok: false, code: 'conflict' })
    expect((await getEntry(db, id))!.entry.description).toBe('second')
    const create = (await history(db, id)).find(row => row.kind === 'create')!
    expect(await revertEntry(db, id, create.id, who)).toMatchObject({ ok: true, rev: 3 })
    expect((await getEntry(db, id))!.entry.description).toBe('first')
    expect((await history(db, id)).filter(row => !row.sighting_id).map(row => row.kind)).toEqual(['revert', 'edit', 'create'])
  })

  test('adding a Unicode encoding claim moves the record to the encoded list and keeps the counts', async () => {
    const id = await createEntry(db, fields(), seen(), [], who)
    await editEntry(db, id, 1, fields({ claims: [claim('encoding', 'U+5650', { charset: 'unicode' })] }), who, null)
    expect(raw.query('SELECT status FROM entries WHERE id = ?').get(id)).toEqual({ status: 'encoded' })
    expect(raw.query("SELECT tag FROM entry_tags WHERE entry_id = ? AND tag LIKE '%f:%' ORDER BY tag").all(id)).toEqual([{ tag: 'f:encoded' }, { tag: 's:han|f:encoded' }])
    expect((await list(db, { filter: 'unchecked' }))!.tiles).toEqual([])
    expect((await list(db, { filter: 'encoded' }))!.tiles).toHaveLength(1)
    expect(await counts(db)).toMatchObject({ 'f:encoded': 1 })
    expect((await counts(db))['f:unchecked']).toBeUndefined()
    await revertEntry(db, id, (await history(db, id)).find(row => row.kind === 'create')!.id, who)
    expect(raw.query('SELECT status FROM entries WHERE id = ?').get(id)).toEqual({ status: 'unchecked' })
    expect(await counts(db)).toMatchObject({ 'f:unchecked': 1 })
  })

  test('a record created with a relation to an encoded character takes its status from it', async () => {
    const id = await createEntry(db, fields({ claims: [relation('哦', 'homograph')] }), seen(), [], who)
    expect(raw.query('SELECT status FROM entries WHERE id = ?').get(id)).toEqual({ status: 'homograph' })
    expect((await list(db, { filter: 'homograph' }))!.tiles.map(tile => tile.id)).toEqual([id])
  })

  test('concurrent additions cannot exceed the sighting limit', async () => {
    const id = await createEntry(db, fields(), seen(), [], who)
    const insert = raw.prepare('INSERT INTO sightings(entry_id, first_entry, place, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
    for (let i = 0; i < 198; i++) insert.run(id, id, 'existing', who.actor, '2026', '2026')
    const results = await Promise.allSettled([
      addSighting(db, id, seen({ place: 'first' }), [], who),
      addSighting(db, id, seen({ place: 'second' }), [], who),
    ])
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    const rejected = results.find(result => result.status === 'rejected') as PromiseRejectedResult
    expect(rejected.reason).toBeInstanceOf(SightingLimitError)
    expect(raw.query('SELECT count(*) AS n FROM sightings WHERE entry_id = ?').get(id)).toEqual({ n: 200 })
    await expect(addSighting(db, id, seen(), [], who)).rejects.toBeInstanceOf(SightingLimitError)
  })

  test('atomic capacity guard rejects a last slot filled after the precheck', async () => {
    const id = await createEntry(db, fields(), seen(), [], who)
    const insert = raw.prepare('INSERT INTO sightings(entry_id, first_entry, place, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
    for (let i = 0; i < 198; i++) insert.run(id, id, 'existing', who.actor, '2026', '2026')
    const batch = db.batch.bind(db)
    let injected = false
    db.batch = (async (statements: D1PreparedStatement[]) => {
      if (!injected) {
        injected = true
        insert.run(id, id, 'concurrent', who.actor, '2026', '2026')
      }
      return batch(statements)
    }) as typeof db.batch
    await expect(addSighting(db, id, seen({ place: 'rejected' }), [], who)).rejects.toBeInstanceOf(SightingLimitError)
    expect(injected).toBe(true)
    expect(raw.query('SELECT count(*) AS n FROM sightings WHERE entry_id = ?').get(id)).toEqual({ n: 200 })
    expect(raw.query("SELECT count(*) AS n FROM sightings WHERE place = 'rejected'").get()).toEqual({ n: 0 })
    expect((await history(db, id)).filter(row => row.kind === 'sighting')).toHaveLength(1)
  })

  test('rolls back a sighting when indexing fails', async () => {
    const id = await createEntry(db, fields(), seen(), [], who)
    raw.exec("CREATE TRIGGER fail_sighting_index BEFORE INSERT ON entry_tags BEGIN SELECT RAISE(ABORT, 'index failure'); END")
    await expect(addSighting(db, id, seen({ place: 'uniqueplace' }), [image], who)).rejects.toThrow('index failure')
    const found = await getEntry(db, id)
    expect(found!.sightings).toHaveLength(1)
    expect(found!.entry).toMatchObject({ sightings: 1, cover_key: null })
    expect(await history(db, id)).toHaveLength(2)
  })

  test('concurrent additions and entry edits retain both index updates', async () => {
    const id = await createEntry(db, fields(), seen(), [], who)
    const [sighting, edit] = await Promise.all([
      addSighting(db, id, seen({ place: 'uniqueplace' }), [image], who),
      editEntry(db, id, 1, fields({ description: 'uniqueword' }), who, null),
    ])
    expect(sighting).not.toBeNull()
    expect(edit).toEqual({ ok: true, rev: 2 })
    expect((await getEntry(db, id))!.entry).toMatchObject({ sightings: 2, cover_key: 't.webp' })
    for (const query of ['uniqueplace', 'uniqueword']) expect((await list(db, { query }))!.tiles.map(tile => tile.id)).toEqual([id])
    expect(await counts(db)).not.toHaveProperty('n:image')
  })

  test('a second sighting joins the same record and can supply its cover', async () => {
    const id = await createEntry(db, fields(), seen(), [], who)
    await addSighting(db, id, seen({ place: 'Another book' }), [image], who)
    const found = await getEntry(db, id)
    expect(found!.sightings).toHaveLength(2)
    expect(found!.entry.cover_key).toBe('t.webp')
    expect((await list(db, { filter: 'image' }))!.tiles).toEqual([])
  })

  test('merging moves the sightings, drops the record from lists, and undoing brings all of it back', async () => {
    const a = await createEntry(db, fields(), seen({ place: 'one' }), [], who)
    const b = await createEntry(db, fields(), seen({ place: 'two' }), [], who)
    expect((await mergeEntry(db, a, b, who, null)).ok).toBe(true)
    expect((await getEntry(db, b))!.sightings).toHaveLength(2)
    expect((await list(db, {}))!.tiles.map(tile => tile.id)).toEqual([b])
    expect(await counts(db)).toMatchObject({ all: 1 })
    expect(await unmergeEntry(db, a, who)).toBe(true)
    expect((await getEntry(db, b))!.sightings).toHaveLength(1)
    expect((await getEntry(db, a))!.sightings).toHaveLength(1)
    expect((await list(db, {}))!.tiles.map(tile => tile.id)).toEqual([b, a])
  })

  test('merging and undoing keep every claim and picture where it was written', async () => {
    const a = await createEntry(db, fields({ claims: [claim('ids', '⿰木木'), claim('reading', 'tung'), relation('林', 'variant', 'a stroke')] }), seen({ place: 'one' }), [{ ...image, image_key: 'a.jpg', thumb_key: 'a-t.jpg', box: '[[1,2,10,10]]' }], who)
    const b = await createEntry(db, fields({ claims: [claim('ids', '⿱木木'), claim('encoding', 'U+5D20', { charset: 'unicode' })] }), seen({ place: 'two' }), [], who)
    const claimsOf = async (id: number) => (await getEntry(db, id))!.claims
    const [aClaims, bClaims] = [await claimsOf(a), await claimsOf(b)]
    await mergeEntry(db, a, b, who, null)
    expect(await claimsOf(a)).toEqual(aClaims)
    expect(await claimsOf(b)).toEqual(bClaims)
    const merged = (await getEntry(db, b))!
    expect(merged.sightings.map(item => item.media.map(picture => picture.image_key))).toEqual([['a.jpg'], []])
    expect(merged.entry).toMatchObject({ cover_key: 'a-t.jpg', cover_place: 'one', sightings: 2 })
    expect(merged.sightings[0].media[0].box).toBe('[[1,2,10,10]]')
    expect((await claimedBy(db, 'ids', '⿰木木')).map(row => row.id)).toEqual([])
    expect((await list(db, { query: 'tung' }))!.tiles).toEqual([])
    expect(await mediaVisible(db, 'a.jpg')).toBe(true)
    expect(await unmergeEntry(db, a, who)).toBe(true)
    expect(await claimsOf(a)).toEqual(aClaims)
    expect(await claimsOf(b)).toEqual(bClaims)
    const back = (await getEntry(db, a))!
    expect(back.sightings[0].media.map(picture => picture.image_key)).toEqual(['a.jpg'])
    expect(back.entry).toMatchObject({ cover_key: 'a-t.jpg', ids: '⿰木木', sightings: 1 })
    expect((await getEntry(db, b))!.entry).toMatchObject({ cover_key: null, ids: '⿱木木', sightings: 1 })
    expect((await claimedBy(db, 'ids', '⿰木木')).map(row => row.id)).toEqual([a])
    expect((await list(db, { query: 'tung' }))!.tiles.map(tile => tile.id)).toEqual([a])
    expect((await list(db, { query: '⿰木木' }))!.tiles.map(tile => tile.id)).toEqual([a])
  })

  test('a record cannot merge into itself or into a merged record', async () => {
    const a = await createEntry(db, fields(), seen(), [], who)
    const b = await createEntry(db, fields(), seen(), [], who)
    const c = await createEntry(db, fields(), seen(), [], who)
    expect(await mergeEntry(db, a, a, who, null)).toEqual({ ok: false, code: 'self' })
    await mergeEntry(db, a, b, who, null)
    expect(await mergeEntry(db, c, a, who, null)).toEqual({ ok: false, code: 'missing' })
  })

  test('hiding rolls back with the index and rejects mismatched targets', async () => {
    const id = await createEntry(db, fields(), seen(), [image], who)
    const other = await createEntry(db, fields(), seen(), [], who)
    const sighting = (await getEntry(db, other))!.sightings[0].id
    expect(await setHidden(db, { entry: id, sighting }, true, who, null)).toBe(false)
    expect(await history(db, id)).toHaveLength(2)
    raw.exec("CREATE TRIGGER fail_hide_index BEFORE DELETE ON entry_tags BEGIN SELECT RAISE(ABORT, 'index failure'); END")
    await expect(setHidden(db, { entry: id }, true, who, null)).rejects.toThrow('index failure')
    expect((await getEntry(db, id))!.entry.hidden_at).toBeNull()
    expect(await history(db, id)).toHaveLength(2)
    expect((await list(db, {}))!.tiles).toHaveLength(2)
  })

  test('concurrent sighting hide and entry edit preserve the final index', async () => {
    const id = await createEntry(db, fields(), seen({ place: 'secretword' }), [image], who)
    const sighting = (await getEntry(db, id))!.sightings[0].id
    const [hidden, edit] = await Promise.all([
      setHidden(db, { entry: id, sighting }, true, who, null),
      editEntry(db, id, 1, fields({ description: 'newword' }), who, null),
    ])
    expect(hidden).toBe(true)
    expect(edit.ok).toBe(true)
    expect((await getEntry(db, id))!.entry).toMatchObject({ sightings: 0, cover_key: null })
    expect((await list(db, { query: 'secretword' }))!.tiles).toEqual([])
    expect((await list(db, { query: 'newword' }))!.tiles.map(row => row.id)).toEqual([id])
    expect(await counts(db)).toMatchObject({ all: 1, 'n:image': 1 })
  })

  test('concurrent hide and add leave no hidden entry in lists', async () => {
    const id = await createEntry(db, fields(), seen(), [], who)
    await Promise.all([
      setHidden(db, { entry: id }, true, who, null),
      addSighting(db, id, seen({ place: 'addedword' }), [image], who),
    ])
    expect((await getEntry(db, id))!.entry.hidden_at).not.toBeNull()
    expect((await list(db, {}))!.tiles).toEqual([])
    expect(await counts(db)).not.toHaveProperty('all')
    await setHidden(db, { entry: id }, false, who, null)
    const found = (await getEntry(db, id))!
    expect(found.entry.sightings).toBe(found.sightings.length)
    expect(await counts(db)).toMatchObject({ all: 1 })
  })

  test('concurrent sighting hide and edit retain consistent visibility', async () => {
    const id = await createEntry(db, fields(), seen({ place: 'oldword' }), [image], who)
    const sid = (await getEntry(db, id))!.sightings[0].id
    await Promise.all([
      setHidden(db, { entry: id, sighting: sid }, true, who, null),
      editSighting(db, sid, 1, seen({ place: 'newword' }), [], who, null, id),
    ])
    expect((await getEntry(db, id))!.entry).toMatchObject({ sightings: 0, cover_key: null })
    for (const query of ['oldword', 'newword']) expect((await list(db, { query }))!.tiles).toEqual([])
    expect(await counts(db)).toMatchObject({ all: 1, 'n:image': 1 })
  })

  test('removing an image updates its snapshot, cover, search and image facet together', async () => {
    const id = await createEntry(db, fields(), seen({ place: 'oldword' }), [{ ...image, box: '[[1,2,10,10]]' }], who)
    const sid = (await getEntry(db, id))!.sightings[0].id
    expect(await editSighting(db, sid, 1, seen({ place: 'newword' }), [], who, null, id)).toEqual({ ok: true, rev: 2 })
    const found = (await getEntry(db, id))!
    expect(found.sightings[0]).toMatchObject({ media: [], rev: 2, place: 'newword' })
    expect(found.entry).toMatchObject({ cover_key: null, cover_place: 'newword' })
    const row = raw.query("SELECT snapshot FROM revisions WHERE kind = 'sighting_edit'").get() as { snapshot: string }
    expect(JSON.parse(row.snapshot)).toMatchObject({ media: [], place: 'newword' })
    expect((await list(db, { query: 'oldword' }))!.tiles).toEqual([])
    expect((await list(db, { query: 'newword', filter: 'image' }))!.tiles.map(row => row.id)).toEqual([id])
    expect(await counts(db)).toMatchObject({ 'n:image': 1 })
    expect(await editSighting(db, sid, 1, seen(), null, who, null, id)).toEqual({ ok: false, code: 'conflict' })
  })

  test('concurrent image removal and replacement have one winner', async () => {
    const id = await createEntry(db, fields(), seen(), [image], who)
    const sid = (await getEntry(db, id))!.sightings[0].id
    const replacement = { ...image, image_key: 'new.webp', thumb_key: 'new-thumb.webp' }
    const results = await Promise.all([
      editSighting(db, sid, 1, seen({ place: 'removedword' }), [], who, null, id),
      editSighting(db, sid, 1, seen({ place: 'replacedword' }), [replacement], who, null, id),
    ])
    expect(results.filter(result => result.ok)).toHaveLength(1)
    expect(results.filter(result => !result.ok)).toEqual([{ ok: false, code: 'conflict' }])
    const found = (await getEntry(db, id))!
    const removed = found.sightings[0].media.length === 0
    expect(found.entry.cover_key).toBe(removed ? null : 'new-thumb.webp')
    expect((await list(db, { query: removed ? 'removedword' : 'replacedword' }))!.tiles.map(row => row.id)).toEqual([id])
    expect((await list(db, { query: removed ? 'replacedword' : 'removedword' }))!.tiles).toEqual([])
    expect((await history(db, id)).filter(row => row.kind === 'sighting_edit')).toHaveLength(1)
  })

  test('image removal selects the next cover and rolls back on index failure', async () => {
    const id = await createEntry(db, fields(), seen({ place: 'firstword' }), [image], who)
    const sid = (await getEntry(db, id))!.sightings[0].id
    await addSighting(db, id, seen({ place: 'secondword' }), [{ ...image, image_key: 'b.webp', thumb_key: 'b-thumb.webp' }], who)
    raw.exec("CREATE TRIGGER fail_remove_index BEFORE DELETE ON entry_tags BEGIN SELECT RAISE(ABORT, 'index failure'); END")
    await expect(editSighting(db, sid, 1, seen({ place: 'newword' }), [], who, null, id)).rejects.toThrow('index failure')
    expect((await getEntry(db, id))!.sightings.find(s => s.id === sid)).toMatchObject({ rev: 1, media: [image], place: 'firstword' })
    expect((await getEntry(db, id))!.entry.cover_key).toBe('t.webp')
    expect((await history(db, id)).filter(row => row.kind === 'sighting_edit')).toHaveLength(0)
    expect((await list(db, { query: 'firstword' }))!.tiles.map(row => row.id)).toEqual([id])
    raw.exec('DROP TRIGGER fail_remove_index')
    expect(await editSighting(db, sid, 1, seen({ place: 'newword' }), [], who, null, id)).toEqual({ ok: true, rev: 2 })
    expect((await getEntry(db, id))!.entry).toMatchObject({ cover_key: 'b-thumb.webp', cover_place: 'secondword' })
    expect(await counts(db)).not.toHaveProperty('n:image')
  })

  test('sighting edit is atomic and respects visibility and ownership', async () => {
    const id = await createEntry(db, fields(), seen({ place: 'oldword' }), [], who)
    const sid = (await getEntry(db, id))!.sightings[0].id
    expect(await editSighting(db, sid, 1, seen(), null, who, null, id + 1)).toEqual({ ok: false, code: 'missing' })
    raw.exec("CREATE TRIGGER fail_sighting_edit BEFORE DELETE ON entry_tags BEGIN SELECT RAISE(ABORT, 'index failure'); END")
    await expect(editSighting(db, sid, 1, seen({ place: 'newword' }), null, who, null, id)).rejects.toThrow('index failure')
    expect((await getEntry(db, id))!.sightings[0]).toMatchObject({ rev: 1, place: 'oldword' })
    raw.exec('DROP TRIGGER fail_sighting_edit')
    await setHidden(db, { entry: id, sighting: sid }, true, who, null)
    expect(await editSighting(db, sid, 1, seen(), null, who, null, id)).toEqual({ ok: false, code: 'missing' })
  })

  test('a hidden record leaves every list and comes back', async () => {
    const id = await createEntry(db, fields(), seen(), [image], who)
    await setHidden(db, { entry: id }, true, who, 'spam')
    expect((await list(db, {}))!.tiles).toEqual([])
    await setHidden(db, { entry: id }, false, who, null)
    expect((await list(db, {}))!.tiles).toHaveLength(1)
  })
})

describe('source types', () => {
  test('reads several checked types, ignores unknown values, and orders them for storage', () => {
    const form = new FormData()
    for (const type of ['reading', 'mention', 'mention', 'unknown']) form.append('types', type)
    expect(readSightingFields(form).types).toBe(JSON.stringify(['mention', 'reading']))
    expect(readSightingFields(new FormData()).types).toBeNull()
  })

  test('saves types with a sighting, edits them, and records each state', async () => {
    const id = await createEntry(db, fields(), seen({ types: JSON.stringify(['attestation', 'definition']) }), [], who)
    const sighting = (await getEntry(db, id))!.sightings[0]
    expect(sighting.types).toBe(JSON.stringify(['attestation', 'definition']))
    await editSighting(db, sighting.id, 1, seen({ types: JSON.stringify(['reading']) }), null, who, null, id)
    expect((await getEntry(db, id))!.sightings[0].types).toBe(JSON.stringify(['reading']))
    const edited = (await history(db, id)).find(row => row.kind === 'sighting_edit')!
    expect(JSON.parse(edited.snapshot).types).toBe(JSON.stringify(['reading']))
  })
})

describe('source dates', () => {
  test('reads the report date apart from the original date', () => {
    const form = new FormData()
    form.set('report_date', '2024-05-01')
    form.set('original_date', '1890')
    expect(readSightingFields(form)).toMatchObject({ report_date: '2024-05-01', original_date: '1890' })
  })

  test('keeps both dates, and lists the older work rather than the post that showed it', async () => {
    const post = await createEntry(db, fields(), seen({ report_date: '2024-05-01', original_date: '1890' }), [], who)
    const book = await createEntry(db, fields(), seen({ report_date: '1998' }), [], who)
    expect((await getEntry(db, post))!.sightings[0]).toMatchObject({ report_date: '2024-05-01', original_date: '1890' })
    const tiles = (await list(db, {}))!.tiles
    expect(tiles.find(tile => tile.id === post)).toMatchObject({ firstYear: '1890', firstYearKind: 'original' })
    expect(tiles.find(tile => tile.id === book)).toMatchObject({ firstYear: '1998', firstYearKind: 'report' })
  })
})

describe('input', () => {
  test('a link alone answers where it was found, and only a web link is kept', () => {
    const form = new FormData(); form.set('url', 'https://example.org/page')
    expect(readSightingFields(form).place).toBe('https://example.org/page')
    form.set('url', 'javascript:alert(1)')
    expect(readSightingFields(form)).toMatchObject({ url: null, place: '' })
  })

  test('boxes are kept inside the image, up to eight', () => {
    expect(readBoxes('[[-5,10,500,20]]', 100, 100)).toBe('[[0,10,100,20]]')
    expect(readBoxes('[[1,2,10,10],[20,20,30,30]]', 100, 100)).toBe('[[1,2,10,10],[20,20,30,30]]')
    expect(readBoxes(JSON.stringify(Array(8).fill([0, 0, 5, 5])), 100, 100)).not.toBeNull()
    expect(readBoxes(JSON.stringify(Array(9).fill([0, 0, 5, 5])), 100, 100)).toBeNull()
    for (const bad of ['nonsense', '[]', '[1,2,10,10]', '[[0,0,1,1]]', '[[1,2,10,10],[0,0,1,1]]', '[[1,2,10]]']) expect(readBoxes(bad, 100, 100)).toBeNull()
  })

  test('several boxes of a picture are stored, exported and kept in the snapshot', async () => {
    const boxes = '[[1,2,10,10],[20,20,30,30]]'
    const id = await createEntry(db, fields(), seen(), [{ ...image, box: boxes }], who)
    expect((await getEntry(db, id))!.sightings[0].media[0].box).toBe(boxes)
    expect((await exportPage(db, 0, 10)).entries[0].evidence[0].media[0].box).toBe(boxes)
    expect(JSON.parse((await history(db, id)).find(row => row.kind === 'sighting')!.snapshot).media[0].box).toBe(boxes)
  })
})

describe('people', () => {
  test('an anonymous person joins an account already known here, and keeps their writes', async () => {
    const account = await createPerson(db, 'atlas-1', 'Named')
    const anon = await createPerson(db)
    const token = await startSession(db, anon.id)
    const other = await startSession(db, anon.id)
    const id = await createEntry(db, fields(), seen(), [], { actor: anon.id, ip: null })
    expect(await joinAtlas(db, anon, 'atlas-1', 'Named', token)).toBe(account.id)
    expect((await getEntry(db, id))!.entry.by_name).toBe('Named')
    expect(await personOf(db, token)).toBeNull()
    expect(await personOf(db, other)).toBeNull()
    await expect(joinAtlas(db, anon, 'another-account', 'Other', token)).rejects.toThrow()
  })

  test('only one concurrent account link can claim an anonymous session', async () => {
    const anon = await createPerson(db)
    const first = await createPerson(db, 'first', 'First')
    const second = await createPerson(db, 'second', 'Second')
    const token = await startSession(db, anon.id)
    const extra = await startSession(db, anon.id)
    const results = await Promise.allSettled([
      joinAtlas(db, anon, 'first', 'First', token, 'replacement-first'),
      joinAtlas(db, anon, 'second', 'Second', token, 'replacement-second'),
    ])
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1)
    const merged = raw.query('SELECT merged_into FROM people WHERE id = ?').get(anon.id) as { merged_into: string }
    expect([first.id, second.id]).toContain(merged.merged_into)
    expect(await personOf(db, token)).toBeNull()
    expect(await personOf(db, extra)).toBeNull()
    const replacements = await Promise.all(['replacement-first', 'replacement-second'].map(token => personOf(db, token)))
    expect(replacements.filter(Boolean)).toHaveLength(1)
    expect(replacements.find(Boolean)?.id).toBe(merged.merged_into)
  })

  test('a revoked session cannot link an anonymous person', async () => {
    const anon = await createPerson(db)
    const token = await startSession(db, anon.id)
    await db.prepare('DELETE FROM sessions WHERE person = ?').bind(anon.id).run()
    await createPerson(db, 'known', 'Known')
    await expect(joinAtlas(db, anon, 'known', 'Known', token, 'bad-known')).rejects.toThrow()
    await expect(joinAtlas(db, anon, 'new', 'New', token, 'bad-new')).rejects.toThrow()
    expect(await personOf(db, 'bad-known')).toBeNull()
    expect(await personOf(db, 'bad-new')).toBeNull()
    expect(raw.query('SELECT atlas_sub, merged_into FROM people WHERE id = ?').get(anon.id)).toEqual({ atlas_sub: null, merged_into: null })
  })

  test('a first sign-in keeps the anonymous person and the name it chose', async () => {
    const anon = await createPerson(db)
    const token = await startSession(db, anon.id)
    expect(await joinAtlas(db, anon, 'atlas-2', 'Elsewhere', token)).toBe(anon.id)
    expect(raw.query('SELECT atlas_sub FROM people WHERE id = ?').get(anon.id)).toEqual({ atlas_sub: 'atlas-2' })
  })
})

// Every list a visitor can ask for, as the query plan runs it: one range of `entry_tags` and lookups by key,
// with no scan of a table and no sort.
describe('query cost', () => {
  const plan = (sql: string, values: unknown[]) => (raw.query(`EXPLAIN QUERY PLAN ${sql}`).all(...(values as never[])) as { detail: string }[]).map(row => row.detail)
  const shapes: Parameters<typeof listStatement>[1][] = [{}, { script: 'han' }, { filter: 'unchecked' }, { filter: 'ids' }, { script: 'han', filter: 'unchecked' }, { script: 'han', filter: 'source' }, { query: '亻' }, { query: '⿰木木' }, { script: 'han', filter: 'ids', query: '⿰木木' }, { query: '亻 木 水 火 土' }, { script: 'han', filter: 'ids', query: '亻 word' }, { facet: 'g:hakka' }, { facet: 't:IRG' }, { script: 'han', filter: 'unchecked', facet: 'c:ids-db' }, { facet: 'g:hakka', query: '亻' }, { facet: 'c:ids-db', query: '⿰木木' }, { without: ['zitools'] }, { script: 'han', within: ['unicode'], without: ['zitools', 'mj'] }, { script: 'han', filter: 'unchecked', facet: 'g:hakka', without: ['zitools'], query: '亻' }]
  for (const shape of shapes) test(`list ${JSON.stringify(shape)}`, () => {
    const statement = listStatement(db, shape) as unknown as { sql: string; values: unknown[] }
    const details = plan(statement.sql, statement.values)
    expect(details.join('\n')).not.toMatch(/TEMP B-TREE/)
    for (const detail of details) expect(detail).not.toMatch(/^SCAN (?!.*USING)/)
    expect(details[0]).toMatch(/^SEARCH (t|w\d) USING PRIMARY KEY/)
  })

  test('an exact description search reads the claims index by value', () => {
    const statement = listStatement(db, { query: '⿰木木' }) as unknown as { sql: string; values: unknown[] }
    expect(plan(statement.sql, statement.values).join('\n')).toMatch(/SEARCH k USING COVERING INDEX claims_by_value \(kind=\? AND value=\? AND entry_id=\?\)/)
  })

  test('claims by value and a source page read their indexes', async () => {
    const plans: string[] = []
    const traced = { prepare(sql: string) {
      const statement = db.prepare(sql)
      return { bind(...values: unknown[]) { plans.push(plan(sql, values).join('\n')); return statement.bind(...values) } }
    }, batch: (statements: D1PreparedStatement[]) => db.batch(statements) } as D1Database
    await createEntry(db, fields(), seen({ title: 'Book', via_title: 'Post' }), [], who)
    await claimedBy(traced, 'ids', '⿰木木')
    await sourcePage(traced, 1)
    // claims, then the source itself (a lookup by key), then a direct and a via read of rows and pictures.
    expect(plans).toHaveLength(6)
    plans.splice(1, 1)
    expect(plans[0]).toMatch(/SEARCH k USING COVERING INDEX claims_by_value \(kind=\? AND value=\?\)/)
    expect(plans[1]).toMatch(/SEARCH s USING INDEX sightings_by_source \(source_id=\?\)/)
    expect(plans[2]).toMatch(/SEARCH s USING INDEX sightings_by_source \(source_id=\?\)/)
    expect(plans[3]).toMatch(/SEARCH s USING INDEX sightings_by_via \(via_id=\?\)/)
    expect(plans[4]).toMatch(/SEARCH s USING INDEX sightings_by_via \(via_id=\?\)/)
    for (const details of plans) expect(details).not.toMatch(/TEMP B-TREE|SCAN (?!.*USING)/)
  })

  test('a new record gives its claims the ids of their sightings through the indexes of the record', async () => {
    const written: string[] = []
    const traced = { prepare(sql: string) { written.push(sql); return db.prepare(sql) }, batch: (statements: D1PreparedStatement[]) => db.batch(statements) } as D1Database
    // A record whose claims name no sighting writes neither statement.
    await createEntry(traced, fields({ claims: [claim('meaning', 'east')] }), seen(), [], who)
    expect(written.filter(sql => /^UPDATE (claims SET sightings|revisions SET snapshot)/.test(sql))).toEqual([])
    await createEntry(traced, fields({ claims: [claim('meaning', 'east', null, { sightings: [1] })] }), seen(), [], who)
    const cited = written.filter(sql => /^UPDATE (claims SET sightings|revisions SET snapshot)/.test(sql)).map(sql => plan(sql, []).join('\n'))
    expect(cited).toHaveLength(2)
    expect(cited[0]).toMatch(/SEARCH claims USING INDEX claims_by_entry \(entry_id=\?\)/)
    expect(cited[0]).toMatch(/SEARCH sightings USING COVERING INDEX sightings_by_entry \(entry_id=\?\)/)
    expect(cited[1]).toMatch(/SEARCH revisions USING INDEX revisions_by_entry \(entry_id=\?\)/)
    expect(cited[1]).toMatch(/SEARCH k USING INDEX claims_by_key \(entry_id=\? AND key=\?\)/)
    // Nothing is read whole but the sequence row, the lists a claim carries and the record's own sightings.
    for (const details of cited) expect(details).not.toMatch(/^SCAN (entries|claims|revisions|sightings|k)\b/m)
  })

  test('a record reads its claims in order from their index', () => {
    expect(plan('SELECT key, kind, value, data, sightings, under FROM claims WHERE entry_id = ? ORDER BY position', [1]).join('\n')).toMatch(/^SEARCH claims USING INDEX claims_by_entry \(entry_id=\?\)$/)
  })

  test('the test sees a missing index', () => {
    raw.exec('CREATE TABLE plain(tag TEXT, entry_id INTEGER)')
    const details = plan('SELECT entry_id FROM plain WHERE tag = ? ORDER BY entry_id DESC LIMIT 5', ['all'])
    expect(details.join('\n')).toMatch(/TEMP B-TREE|^SCAN plain/m)
  })
})

describe('status', () => {
  const form = (pairs: [string, string][]) => { const data = new FormData(); for (const [name, value] of pairs) data.append(name, value); return data }
  const unicode: [string, string][] = [['encodings_present', '1'], ['encoding_charset', 'unicode'], ['encoding_code', 'U+5650']]

  test('a posted status is ignored', () => {
    expect(readEntryFields(form([...unicode, ['status', 'variant']])).fields).not.toHaveProperty('status')
  })

  test('an old snapshot that holds a status still reads', () => {
    const raw = JSON.stringify({ script: 'han', script_other: null, description: null, status: 'doubtful', radical: null, strokes: null, claims: [] })
    expect(entryFieldsOf(raw)).toEqual({ script: 'han', script_other: null, description: null, radical: null, strokes: null, claims: [] })
  })
})

describe('scripts outside the list', () => {
  const named = (script: string) => { const form = new FormData(); form.set('script', script); return readEntryFields(form).fields }

  test('the form names a script, and only `other` keeps a name', () => {
    expect(named('漢字')).toMatchObject({ script: 'han', script_other: null })
    expect(named('方音符號')).toMatchObject({ script: 'other', script_other: '方音符號' })
    expect(readEntryFields(new FormData(), fields({ script: 'other', script_other: '方音符號' })).fields).toMatchObject({ script: 'other', script_other: '方音符號' })
  })

  test('a revision keeps a name only for `other`', () => {
    const snapshot = (script: string) => JSON.stringify({ ...fields({ script, script_other: '方音符號' }) })
    expect(entryFieldsOf(snapshot('han'))).toMatchObject({ script: 'han', script_other: null })
    expect(entryFieldsOf(snapshot('other'))).toMatchObject({ script: 'other', script_other: '方音符號' })
  })

  test('the names of visible records are offered once each, in name order, one index seek each', async () => {
    const ids = []
    for (const name of ['乙', '甲', '乙', '丙']) ids.push(await createEntry(db, fields({ script: 'other', script_other: name }), seen(), [], who))
    await createEntry(db, fields(), seen(), [], who)
    await setHidden(db, { entry: ids[3] }, true, who, null)
    expect(await customScripts(db)).toEqual(['乙', '甲'].sort())
    const statement = customScriptsStatement(db) as unknown as { sql: string; values: unknown[] }
    const details = (raw.query(`EXPLAIN QUERY PLAN ${statement.sql}`).all(...(statement.values as never[])) as { detail: string }[]).map(row => row.detail).join('\n')
    expect(details).not.toMatch(/TEMP B-TREE|SCAN entries/)
    expect(details.match(/SEARCH entries USING (COVERING )?INDEX entries_custom_scripts \(script_other>\?\)/g)).toHaveLength(2)
  })
})
