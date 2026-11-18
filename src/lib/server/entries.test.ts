import { publicPublisher, publisherDirectory, publisherSuggestions } from './publishers'
import { beforeEach, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { TAG_IMPLY_DEPTH_MAX, TAG_TYPES, arrangeTagsByType, canImply, cleanTag, implicationClosure, tagLabels } from '$lib/tags'
import { MOVE_RECORDS_MAX, MOVES_PER_HOUR, changesStatement, createTag, deleteTag, ensureTags, implicationsStatement, implyTag, latestChangeStatement, moveSizeStatement, recentMovesStatement, refileStatements, renameTag, retypeTag, tagList, tagsStatement, undoTagChange, unimplyTag } from './tags'
import { newClaim, readClaims, type Claim } from '$lib/claims'
import { ORDER, type Order } from '$lib/order'
import { standing } from '$lib/radicals'
import { type Citation, addSighting, getSighting, claimedBy, counts, countsStatement, createEntry, cursorOf, customScripts, customScriptsStatement, facetTag, editEntry, editSighting, entryFieldsOf, exportPage, getEntry, history, list, listStatement, mediaVisible, mergeEntry, readBoxes, readEntryFields, readSightingFields, refresh, restoreSighting, revertEntry, SEARCH_WINDOW, searchTotal, TOTAL_READ, totalStatement, WORD_SIZE, exactSize, alsoSearchIds, ALSO_MAX, earliestSighting, CHRONICLE_PAGE, chronicleBackStatement, chroniclePlace, chronicleStatement, chronology, decadeCountsStatement, parseSourceCursor, radicalCounts, radicalCountsStatement, shuffleRanges, sourceList, sourcePage, SOURCES_PAGE, setHidden, SightingLimitError, terms, unmergeEntry, type EntryFields, type SightingFields, type StoredImage } from './entries'
import { joinAtlas, createPerson, personOf, startSession } from './people'
import { openTestDb } from './testdb'

const fields = (over: Partial<EntryFields> = {}): EntryFields => ({ script: 'han', script_other: null, description: null, radical: null, strokes: null, claims: [], ...over })
const claim = (kind: Claim['kind'], value: string, data: Claim['data'] = null, links: Partial<Pick<Claim, 'sightings' | 'under'>> = {}): Claim => newClaim(kind, value, data, links)
const described = (...sequences: string[]) => fields({ claims: sequences.map(sequence => claim('ids', sequence)) })
const relation = (character: string, relationship: string, difference = '', evidence = ''): Claim => claim('relation', character, { relationship, ...(difference ? { difference } : {}), ...(evidence ? { evidence } : {}) })
// A source is found among the sightings that passed through it by the index of the chain, never by a scan.
const VIA_SEARCH = /SEARCH v USING (COVERING )?INDEX sighting_vias_by_source \(source_id=\?\)/
const via = (over: Partial<Citation>): Citation => ({ url: null, title: null, author: null, publisher: null, report_date: null, ...over })
const seen = (over: Partial<SightingFields> = {}): SightingFields => ({ place: 'A shop sign in Tainan', url: null, title: null, author: null, publisher: null, report_date: null, vias: [], original_date: null, page: null, context: null, style: null, types: null, note: null, ...over })
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
  const { fields: values, error } = readEntryFields(form, [])
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
  expect(readEntryFields(form, [], original).fields.claims).toEqual(original.claims)
  form.set('related_characters_present', '1')
  expect(readEntryFields(form, [], original).fields.claims).toEqual([])
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
    expect(await ids({ script: 'han', without: ['zitools', 'yedict', 'glyphwiki', 'mj'] })).toEqual([bare])
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
    expect(await list(db, { script: 'han', filter: 'homograph', without: ['mj'] })).toEqual({ tiles: [expect.objectContaining({ id: rare })], next: null, partial: false, read: 1 })
    expect(await list(db, { script: 'han', filter: 'homograph', within: ['mj'] })).toEqual({ tiles: [], next: null, partial: false, read: 0 })
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
      { fields: seen({ place: 'A post', url: 'https://example.test/post', vias: [via({ title: 'A thread' })] }), media: [] },
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
    expect(found.sightings.map(sighting => sighting.vias.length === 0)).toEqual([true, true, true, false])
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
    for (const [script, filter] of [[null, null], ['nom', null], [null, 'image'], [null, 'ids'], ['nom', 'source']] as const)
      expect((await list(db, { script, filter }))!.tiles.map(tile => tile.id)).toEqual([id])
    expect((await list(db, { script: 'han' }))!.tiles).toEqual([])
    expect(await counts(db)).toMatchObject({ all: 1, 's:nom': 1, 'n:image': 1 })
    expect(await counts(db)).not.toHaveProperty('f:unchecked')
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

  test('other spellings are searched with the description, and bad or excess ones are dropped', async () => {
    const folded = await createEntry(db, described('⿺𡕤面'), seen(), [], who)
    const written = await createEntry(db, described('⿺⿱𡗗夂面'), seen(), [], who)
    await createEntry(db, described('⿺木面'), seen(), [], who)
    const both = await createEntry(db, described('⿺𡕤面', '⿺⿱𡗗夂面'), seen(), [], who)
    const ids = async (query: string, also: string[]) => (await list(db, { query, also }))!.tiles.map(tile => tile.id).sort((a, b) => a - b)
    expect(await ids('⿺⿱𡗗夂面', [])).toEqual([written, both])
    expect(await ids('⿺⿱𡗗夂面', ['⿺𡕤面'])).toEqual([folded, written, both])
    expect(await ids('⿺𡕤面', ['⿺⿱ 𡗗夂面'])).toEqual([folded, written, both])
    expect(await searchTotal(db, { query: '⿺⿱𡗗夂面', also: ['⿺𡕤面'] })).toMatchObject({ n: 3 })
    expect(await searchTotal(db, { query: '⿺⿱𡗗夂面' })).toMatchObject({ n: 2 })
    // What is no description, the query itself and repeats are dropped, and so are the spellings past the limit.
    expect(alsoSearchIds('⿺⿱𡗗夂面', ['面', '⿺⿱𡗗夂面', '⿺𡕤面', '⿺𡕤 面', 'word'])).toEqual(['⿺𡕤面'])
    const many = Array.from({ length: ALSO_MAX + 5 }, (_, i) => `⿰木${String.fromCodePoint(0x4e00 + i)}`)
    expect(alsoSearchIds('⿰木木', many)).toEqual(many.slice(0, ALSO_MAX))
    // A query that is no whole description searches by its words and ignores them.
    expect(alsoSearchIds('木', ['⿺𡕤面'])).toEqual([])
    expect(await list(db, { query: '木', also: ['⿺𡕤面'] })).toEqual(await list(db, { query: '木' }))
  })

  test('exact IDS search pages through bounded candidates without skipping', async () => {
    const n = SEARCH_WINDOW * 2 + 10
    raw.prepare(`WITH RECURSIVE seq(x) AS (VALUES(1) UNION ALL SELECT x+1 FROM seq WHERE x < ?)
      INSERT INTO entries(id, script, ids, created_by, created_at, updated_at)
      SELECT x, 'han', CASE WHEN x IN (1, 2, 300, 520) THEN '⿰木木' ELSE '⿱木木' END, ?, '2026', '2026' FROM seq`).run(n, who.actor)
    raw.exec("INSERT INTO claims(entry_id, position, key, kind, value) SELECT id, 0, printf('ids%05d', id), 'ids', ids FROM entries")
    raw.exec("INSERT INTO entry_tags(tag, entry_id) SELECT 'all', id FROM entries")
    let after: string | null = null
    const found: number[] = []
    let pages = 0
    do {
      const candidates = (await listStatement(db, { query: '⿰木木', after, limit: 1 })!.all()).results
      expect(candidates.length).toBeLessThanOrEqual(SEARCH_WINDOW + 1)
      const page: NonNullable<Awaited<ReturnType<typeof list>>> = (await list(db, { query: '⿰木木', after, limit: 1 }))!
      found.push(...page.tiles.map(tile => tile.id))
      after = page.next
      expect(++pages).toBeLessThan(10)
    } while (after !== null)
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
      let after: string | null = null
      const found: number[] = []
      let pages = 0
      do {
        const statement = listStatement(db, { order: 'new', query, after, limit: 2 })!
        const candidates = (await statement.all<{ id: number; matches: number }>()).results
        // Every row returned by the statement is a facet candidate, including nonmatches.
        expect(candidates.length).toBeLessThanOrEqual(SEARCH_WINDOW + 1)
        const page: NonNullable<Awaited<ReturnType<typeof list>>> = (await list(db, { order: 'new', query, after, limit: 2 }))!
        found.push(...page.tiles.map(tile => tile.id))
        if (page.next !== null) expect(after === null || Number(page.next) < Number(after)).toBe(true)
        after = page.next
        expect(++pages).toBeLessThan(10)
      } while (after !== null)
      expect(found).toEqual(query === 'absent' ? [] : query === 'rare' ? [700, 520, 300, 100, 2] : [700, 300, 2])
    }
    const first = (await list(db, { order: 'new', query: 'absent' }))!
    expect(first).toMatchObject({ tiles: [], next: String(n - SEARCH_WINDOW + 1), partial: true })
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
    expect(await list(db, { filter: 'unchecked' })).toBeNull()
    expect((await list(db, { filter: 'encoded' }))!.tiles).toHaveLength(1)
    expect(await counts(db)).toMatchObject({ 'f:encoded': 1 })
    expect((await counts(db))['f:unchecked']).toBeUndefined()
    await revertEntry(db, id, (await history(db, id)).find(row => row.kind === 'create')!.id, who)
    expect(raw.query('SELECT status FROM entries WHERE id = ?').get(id)).toEqual({ status: null })
    expect((await counts(db))['f:encoded']).toBeUndefined()
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

describe('source gallery', () => {
  test('publisher filtering keeps citation spellings, accepts new names and follows public via references', async () => {
    const entry = await createEntry(db, fields(), seen({ title: 'Book', publisher: '江蘇教育出版社',
      vias: [via({ title: 'Post', publisher: 'Twitter' })] }), [], who)
    await addSighting(db, entry, seen({ title: 'Second', publisher: '江苏教育出版社' }), [], who)
    const other = await createEntry(db, fields(), seen({ title: 'New imprint', publisher: 'River Press' }), [], who)
    await createEntry(db, fields(), seen({ publisher: '未詳' }), [], who)
    const directory = await publisherDirectory(db)
    expect(directory.map(p => p.label)).toEqual(['River Press', 'X', '江苏教育出版社'])
    const x = directory.find(p => p.label === 'X')!
    expect(x.aliases).toContain('Twitter')
    expect((await sourceList(db, 'new', null, x.id)).sources.map(s => s.publisher)).toEqual(['Twitter'])
    expect(await publicPublisher(db, 'ＴＷＩＴＴＥＲ')).toMatchObject({ id: x.id })
    expect(await publisherDirectory(db, 'Ｔｗｉｔ')).toMatchObject([{ id: x.id }])
    expect(await publicPublisher(db, '未詳')).toBeNull()
    const press = directory.find(p => p.label === '江苏教育出版社')!
    expect((await sourceList(db, 'earliest', null, press.id)).sources.map(s => s.publisher)).toEqual(['江苏教育出版社', '江蘇教育出版社'])
    await setHidden(db, { entry: other }, true, who, null)
    expect((await publisherDirectory(db)).map(p => p.label)).not.toContain('River Press')
    expect(raw.query("SELECT name FROM publishers WHERE name = 'River Press'").get()).toBeTruthy()
    const sighting = (await getEntry(db, entry))!.sightings[0]
    await editSighting(db, sighting.id, sighting.rev, seen({ title: 'Changed', publisher: 'river press' }), null, who, null, entry)
    expect((await publisherDirectory(db)).map(p => p.label)).toEqual(['River Press', '江苏教育出版社'])
  })

  test('new spellings share one normalized directory name and subsequent curation moves existing citations', async () => {
    await createEntry(db, fields(), seen({ publisher: 'Éditions　 du  Ｎｏｒｄ' }), [], who)
    await createEntry(db, fields(), seen({ publisher: 'éditions du nord' }), [], who)
    const press = await publicPublisher(db, 'ÉDITIONS DU NORD')
    expect(press?.name).toBe('Éditions du Nord')
    expect((await sourceList(db, 'new', null, press!.id)).sources.map(s => s.publisher)).toEqual(['éditions du nord', 'Éditions　 du  Ｎｏｒｄ'])
    await createEntry(db, fields(), seen({ publisher: 'Northern imprint' }), [], who)
    raw.prepare("INSERT INTO publisher_aliases VALUES ('northern imprint','Northern imprint',?)").run(press!.id)
    expect((await sourceList(db, 'new', null, press!.id)).sources).toHaveLength(3)
    expect(raw.query("SELECT id FROM publishers WHERE lookup = 'northern imprint'").get()).toBeNull()
    raw.exec("DELETE FROM publisher_aliases WHERE lookup = 'northern imprint'")
    expect((await sourceList(db, 'new', null, press!.id)).sources).toHaveLength(2)
  })

  test('a publisher cursor stays in its group for every sort, including the undated tail', async () => {
    const add = raw.prepare('INSERT INTO sources(hash, title, publisher, year, records) VALUES (?, ?, ?, ?, 1)')
    for (let i = 0; i < SOURCES_PAGE + 5; i++) {
      add.run('a' + i, 'a' + i, i % 2 ? 'X' : 'Twitter', i < SOURCES_PAGE ? 2000 : null)
      add.run('b' + i, 'b' + i, 'Separate', 1999)
    }
    const publisher = (await publisherDirectory(db)).find(p => p.label === 'X')!
    for (const sort of ['new', 'most', 'earliest', 'latest'] as const) {
      const a = await sourceList(db, sort, null, publisher.id)
      const b = await sourceList(db, sort, parseSourceCursor(sort, a.next!), publisher.id)
      expect(b.next).toBeNull()
      const titles = [...a.sources, ...b.sources].map(s => s.title)
      expect(titles.every(t => t?.startsWith('a'))).toBe(true)
      expect(new Set(titles).size).toBe(SOURCES_PAGE + 5)
    }
  })

  const titles = async (...args: Parameters<typeof sourceList> extends [unknown, ...infer Rest] ? Rest : never) => (await sourceList(db, ...args)).sources.map(source => source.title)
  const records = (title: string) => (raw.query('SELECT records FROM sources WHERE title = ?').get(title) as { records: number }).records

  test('lists the sources visible records cite, with their records and cover, newest first', async () => {
    const first = await createEntry(db, fields(), seen({ title: 'Book' }), [image], who)
    const second = await createEntry(db, fields(), seen({ title: 'Book' }), [], who)
    await addSighting(db, first, seen({ title: 'Book' }), [], who)
    await createEntry(db, fields(), seen({ title: 'Article', vias: [via({ title: 'Book' })] }), [], who)
    const gone = await createEntry(db, fields(), seen({ title: 'Withdrawn' }), [], who)
    await setHidden(db, { entry: gone }, true, who, null)
    const { sources, next } = await sourceList(db)
    expect(next).toBeNull()
    expect(sources.map(source => source.title)).toEqual(['Article', 'Book'])
    expect(sources[1].tiles.map(tile => tile.id)).toEqual([first, second, first + 2])
    expect(sources[1]).toMatchObject({ records: 3, cover: 't.webp' })
    expect(sources[0]).toMatchObject({ records: 1, cover: null })
  })

  test('counts each source again when a record or sighting is hidden, shown, merged, split or moved to another source', async () => {
    const a = await createEntry(db, fields(), seen({ title: 'Book' }), [], who)
    const b = await createEntry(db, fields(), seen({ title: 'Book' }), [], who)
    expect(records('Book')).toBe(2)
    await setHidden(db, { entry: b }, true, who, null)
    expect(records('Book')).toBe(1)
    await setHidden(db, { entry: b }, false, who, null)
    expect(records('Book')).toBe(2)
    await mergeEntry(db, b, a, who, null)
    expect(records('Book')).toBe(1)
    await unmergeEntry(db, b, who)
    expect(records('Book')).toBe(2)
    const sighting = (await getEntry(db, b))!.sightings[0]
    await setHidden(db, { entry: b, sighting: sighting.id }, true, who, null)
    expect(records('Book')).toBe(1)
    await setHidden(db, { entry: b, sighting: sighting.id }, false, who, null)
    await editSighting(db, sighting.id, sighting.rev, seen({ title: 'Other' }), null, who, null, b)
    expect([records('Book'), records('Other')]).toEqual([1, 1])
    await editSighting(db, (await getEntry(db, a))!.sightings[0].id, 1, seen({ title: 'Other', vias: [via({ title: 'Book' })] }), null, who, null, a)
    expect([records('Book'), records('Other')]).toEqual([1, 2])
  })

  test('sorts by records, and by year with the undated sources last, across pages', async () => {
    const work = async (title: string, report_date: string | null, times = 1) => {
      const id = await createEntry(db, fields(), seen({ title, report_date }), [], who)
      for (let i = 1; i < times; i++) await createEntry(db, fields(), seen({ title, report_date }), [], who)
      return id
    }
    raw.prepare('INSERT INTO date_readings VALUES (?, ?)').run('令和2年 (2020)', JSON.stringify({ start: '2020-01-01', end: '2020-12-31', precision: 'year' }))
    await work('Late', '令和2年 (2020)', 2)
    await work('Early', 'c. 980', 3)
    await work('Undated', null)
    await work('Middle', '1850-03-01')
    expect(await titles('new')).toEqual(['Middle', 'Undated', 'Early', 'Late'])
    expect(await titles('most')).toEqual(['Early', 'Late', 'Middle', 'Undated'])
    expect(await titles('earliest')).toEqual(['Early', 'Middle', 'Late', 'Undated'])
    expect(await titles('latest')).toEqual(['Late', 'Middle', 'Early', 'Undated'])
    for (let i = 0; i < SOURCES_PAGE; i++) await work(`Dated ${i}`, `${1900 + i}`)
    for (let i = 0; i < 3; i++) await work(`Blank ${i}`, null)
    for (const sort of ['new', 'most', 'earliest', 'latest'] as const) {
      const seenTitles: (string | null)[] = []
      let cursor: string | null = null
      do {
        const page = await sourceList(db, sort, cursor === null ? null : parseSourceCursor(sort, cursor))
        seenTitles.push(...page.sources.map(source => source.title))
        cursor = page.next
      } while (cursor !== null)
      expect(seenTitles).toHaveLength(SOURCES_PAGE + 7)
      expect(new Set(seenTitles).size).toBe(SOURCES_PAGE + 7)
      if (sort === 'earliest' || sort === 'latest') expect(seenTitles.slice(-4)).toEqual(['Blank 2', 'Blank 1', 'Blank 0', 'Undated'])
    }
  })

  test('a cursor is a key and an id, or an id alone, as its sort reads', () => {
    expect(parseSourceCursor('latest', '1850.12')).toEqual({ key: 1850, id: 12 })
    expect(parseSourceCursor('earliest', '12')).toEqual({ key: null, id: 12 })
    expect(parseSourceCursor('most', '3.12')).toEqual({ key: 3, id: 12 })
    expect(parseSourceCursor('new', '12')).toEqual({ key: null, id: 12 })
    expect([parseSourceCursor('new', '3.12'), parseSourceCursor('most', '12')]).toEqual([null, null])
    for (const bad of ['', '0', '1.', '.1', '1.2.3', '-1', '1e3', '99999999999999999']) expect(parseSourceCursor('latest', bad)).toBeNull()
  })
})

describe('order', () => {
  // Records 1–7 with 0, 2, 1, 2, 0, 1, 2 sources, and first seen in 1935, 980, none, 1935, 2017, none and
  // 1618, read two at a time in every order.
  const counts = [0, 2, 1, 2, 0, 1, 2]
  const years = ['1935', '980', null, '1935', '2017', null, '1618']
  beforeEach(() => {
    counts.forEach((n, i) => raw.prepare("INSERT INTO entries(id, script, sightings, first_year, created_by, created_at, updated_at) VALUES(?, 'han', ?, ?, ?, '2026', '2026')").run(i + 1, n, years[i], who.actor))
    raw.exec("INSERT INTO entry_tags(tag, entry_id, sightings, year) SELECT 'all', id, sightings, CAST(first_year AS INTEGER) FROM entries")
  })
  const walk = async (order: Order, seed?: number) => {
    const found: number[] = []
    let after: string | null = null, pages = 0
    do {
      const page: NonNullable<Awaited<ReturnType<typeof list>>> = (await list(db, { order, seed, after, limit: 2 }))!
      found.push(...page.tiles.map(tile => tile.id))
      after = page.next
      expect(++pages).toBeLessThan(10)
    } while (after !== null)
    return found
  }
  test('each order reads every record once, in its order', async () => {
    expect(await walk('new')).toEqual([7, 6, 5, 4, 3, 2, 1])
    expect(await walk('old')).toEqual([1, 2, 3, 4, 5, 6, 7])
    expect(await walk('most')).toEqual([7, 4, 2, 6, 3, 5, 1])
    expect(await walk('fewest')).toEqual([1, 5, 3, 6, 2, 4, 7])
    // By year, a record with none is left out, and 980 comes before 1618 as a number.
    expect(await walk('earliest')).toEqual([2, 7, 1, 4, 5])
    expect(await walk('latest')).toEqual([5, 4, 1, 7, 2])
  })
  test('a shuffled list reads every record once from any start, in the order of its ranks', async () => {
    const rank = (id: number) => { const x = BigInt(id) * 1540483477n % 2n ** 32n; return Number(((x ^ (x >> 16n)) * 73244475n) % 2n ** 32n) }
    const byRank = [1, 2, 3, 4, 5, 6, 7].sort((a, b) => rank(a) - rank(b))
    for (const seed of [0, 1, rank(4), rank(4) + 1, 2 ** 31, 2 ** 32 - 1]) {
      const found = await walk('random', seed)
      const start = byRank.findIndex(id => rank(id) >= seed)
      expect(found).toEqual(start < 0 ? byRank : [...byRank.slice(start), ...byRank.slice(0, start)])
    }
    expect(await list(db, { order: 'random' })).toBeNull()
  })
  test('a shuffled list continues after a cursor up to its start', () => {
    expect(shuffleRanges(100, null)).toEqual([[100, 2 ** 32], [0, 100]])
    expect(shuffleRanges(100, 500)).toEqual([[501, 2 ** 32], [0, 100]])
    expect(shuffleRanges(100, 2 ** 32 - 1)).toEqual([[0, 100]])
    expect(shuffleRanges(100, 40)).toEqual([[41, 100]])
    expect(shuffleRanges(100, 99)).toEqual([])
    expect(shuffleRanges(0, null)).toEqual([[0, 2 ** 32]])
  })
  test('a cursor of another order is no cursor', () => {
    expect(cursorOf('earliest', '7')).toBeNull()
    expect(cursorOf('latest', '1935.4')).toEqual([1935, 4])
    expect(cursorOf('random', '4294967296')).toBeNull()
    expect(cursorOf('random', '1.5')).toBeNull()
    expect(cursorOf('random', '0')).toEqual([0])
    expect(cursorOf('new', '2.7')).toBeNull()
    expect(cursorOf('most', '7')).toBeNull()
    expect(cursorOf('most', '-1.7')).toBeNull()
    expect(cursorOf('old', '0')).toBeNull()
    expect(cursorOf('fewest', '0.3')).toEqual([0, 3])
  })
  test('a record is listed under the decade it was first seen in, and moves with an older sighting', async () => {
    const decades = (id: number) => raw.query("SELECT tag FROM entry_tags WHERE entry_id = ? AND tag GLOB 'y:*'").all(id)
    const counted = () => raw.query("SELECT tag, n FROM tag_counts WHERE tag GLOB 'y:*' AND n > 0 ORDER BY tag").all()
    const id = await createEntry(db, fields(), seen({ place: 'A shop sign', report_date: '1999' }), [], who)
    await createEntry(db, fields(), seen({ place: 'A sign', report_date: 'undated' }), [], who)
    expect(decades(id)).toEqual([{ tag: 'y:1990' }])
    expect(counted()).toEqual([{ tag: 'y:1990', n: 1 }])
    await addSighting(db, id, seen({ place: 'A book', original_date: '1935年' }), [], who)
    expect(decades(id)).toEqual([{ tag: 'y:1930' }])
    expect(counted()).toEqual([{ tag: 'y:1930', n: 1 }])
    expect((await list(db, { decade: '1930' }))!.tiles.map(tile => tile.id)).toEqual([id])
    expect(await list(db, { decade: '1935' })).toBeNull()
  })

  test('a record keeps its first year on every row it is listed under, and its words keep none', async () => {
    const dated = (id: number) => raw.query("SELECT DISTINCT year FROM entry_tags WHERE entry_id = ? AND tag NOT GLOB '[wp]:*'").all(id)
    const words = (id: number) => raw.query("SELECT DISTINCT year FROM entry_tags WHERE entry_id = ? AND tag GLOB '[wp]:*'").all(id)
    const id = await createEntry(db, fields(), seen({ place: 'A shop sign', report_date: '1999' }), [], who)
    expect(dated(id)).toEqual([{ year: 1999 }])
    expect(words(id)).toEqual([{ year: null }])
    await addSighting(db, id, seen({ place: 'A book', original_date: '1935年' }), [], who)
    expect(dated(id)).toEqual([{ year: 1935 }])
    expect(words(id)).toEqual([{ year: null }])
  })

  test('a record keeps its count on every row it is listed under, and its words keep none', async () => {
    const counted = (id: number) => raw.query("SELECT DISTINCT sightings FROM entry_tags WHERE entry_id = ? AND tag NOT GLOB '[wp]:*'").all(id)
    const words = (id: number) => raw.query("SELECT DISTINCT sightings FROM entry_tags WHERE entry_id = ? AND tag GLOB '[wp]:*'").all(id)
    const id = await createEntry(db, fields(), seen({ place: 'A shop sign' }), [], who)
    expect(counted(id)).toEqual([{ sightings: 1 }])
    expect(words(id)).toEqual([{ sightings: 0 }])
    await addSighting(db, id, seen({ place: 'A book' }), [], who)
    expect(counted(id)).toEqual([{ sightings: 2 }])
    expect(words(id)).toEqual([{ sightings: 0 }])
  })
})

// Every list a visitor can ask for, as the query plan runs it: one range of `entry_tags` and lookups by key,
// with no scan of a table and no sort.
describe('query cost', () => {
  const plan = (sql: string, values: unknown[]) => (raw.query(`EXPLAIN QUERY PLAN ${sql}`).all(...(values as never[])) as { detail: string }[]).map(row => row.detail)
  const shapes: Parameters<typeof listStatement>[1][] = [{}, { script: 'han' }, { filter: 'encoded' }, { filter: 'ids' }, { script: 'han', filter: 'variant' }, { script: 'han', filter: 'source' }, { query: '亻' }, { query: '⿰木木' }, { script: 'han', filter: 'ids', query: '⿰木木' }, { query: '亻 木 水 火 土' }, { script: 'han', filter: 'ids', query: '亻 word' }, { facet: 't:hakka' }, { facet: 't:IRG' }, { radical: '口' }, { decade: '1930' }, { decade: '1930', order: 'earliest', after: '1935.4' }, { decade: '1930', script: 'han', query: '亻' }, { radical: '儿兄克', script: 'han', filter: 'variant', facet: 't:hakka', query: '亻' }, { radical: '儿兄克', order: 'most' }, { script: 'han', filter: 'variant', facet: 'c:ids-db' }, { facet: 't:hakka', query: '亻' }, { facet: 'c:ids-db', query: '⿰木木' }, { without: ['zitools'] }, { script: 'han', within: ['unicode'], without: ['zitools', 'mj'] }, { script: 'han', filter: 'variant', facet: 't:hakka', without: ['zitools'], query: '亻' }, ...(['new', 'old', 'fewest', 'earliest', 'latest'] as const).flatMap(order => [{ order }, { order, filter: 'variant', after: order === 'new' || order === 'old' ? '5' : '1.5' }, { order, script: 'han', within: ['unicode'], query: '亻' }]), { order: 'random', seed: 7 }, { order: 'random', seed: 7, filter: 'variant', after: '3' }, { order: 'random', seed: 7, script: 'han', within: ['unicode'], query: '亻' }]
  for (const shape of shapes) test(`list ${JSON.stringify(shape)}`, () => {
    const statement = listStatement(db, shape) as unknown as { sql: string; values: unknown[] }
    const details = plan(statement.sql, statement.values)
    expect(details.join('\n')).not.toMatch(/TEMP B-TREE/)
    for (const detail of details) expect(detail).not.toMatch(/^SCAN (?!.*USING)/)
    if (shape.order === 'random') return expect(details[0]).toMatch(/^SEARCH t USING COVERING INDEX entry_tags_by_shuffle \(tag=\? AND <expr>>\? AND <expr><\?\)$/)
    // A list by count reads the count index from the cursor on; any other reads the key in order.
    // A list by year reads the dated rows of the year index; going down, "has a year" bounds it below.
    if (shape.order === 'earliest' || shape.order === 'latest') return expect(details[0]).toMatch(/^SEARCH t USING COVERING INDEX entry_tags_by_year \(tag=\? AND (year>\? AND )?\(year,entry_id\)[<>]\(\?,\?\)\)$/)
    expect(details[0]).toMatch((shape.order ?? ORDER) === 'most' || shape.order === 'fewest' ? /^SEARCH t USING COVERING INDEX entry_tags_by_sightings \(tag=\? AND \(sightings,entry_id\)[<>]\(\?,\?\)\)$/ : /^SEARCH (t|w\d) USING PRIMARY KEY/)
  })

  test('publisher autocomplete reads canonical and alias prefixes through their indexes', () => {
    for (const prefix of ['', '江', 'Ａ', '%']) {
      const statement = publisherSuggestions(db, prefix) as unknown as { sql: string; values: unknown[] }
      const details = plan(statement.sql, statement.values).join('\n')
      expect(details).toContain('publishers_listed')
      if (prefix) {
        expect(details).toMatch(/SEARCH publishers USING (?:COVERING )?INDEX publishers_listed \(lookup>\? AND lookup<\?\)/)
        expect(details).toMatch(/SEARCH a USING PRIMARY KEY \(lookup>\? AND lookup<\?\)/)
      }
    }
  })

  test('the radical counts read one range of the counts by key', () => {
    for (const under of [undefined, '儿']) {
      const statement = radicalCountsStatement(db, under) as unknown as { sql: string; values: unknown[] }
      const details = plan(statement.sql, statement.values).join('\n')
      expect(details).toMatch(/SEARCH tag_counts USING INDEX tag_counts_branches \(tag>\? AND tag<\?\)/)
      expect(details).toMatch(/SEARCH tag_counts USING PRIMARY KEY \(tag=\?\)/)
      // The stated paths are one range of the counts, and each one's records are read by key.
      expect(details).toMatch(/SEARCH d USING PRIMARY KEY \(tag>\? AND tag<\?\)/)
      expect(details).toMatch(/SEARCH t USING PRIMARY KEY \(tag=\?\)/)
      expect(details).toMatch(/SEARCH tag_counts USING PRIMARY KEY \(tag>\? AND tag<\?\)/)
      expect(details).not.toMatch(/SCAN (tag_counts|d|t)\b|TEMP B-TREE/)
    }
  })

  test('the filter counts step over the radical paths by key', () => {
    const statement = countsStatement(db) as unknown as { sql: string; values: unknown[] }
    const details = plan(statement.sql, statement.values).join('\n')
    expect(details).toMatch(/SEARCH tag_counts USING PRIMARY KEY \(tag<\?\)/)
    expect(details).toMatch(/SEARCH tag_counts USING PRIMARY KEY \(tag>\?\)/)
    expect(details).not.toMatch(/SCAN tag_counts/)
  })

  test('the second read of a shuffled list reads the shuffle index too', () => {
    const statement = listStatement(db, { order: 'random', seed: 7 }, undefined, 1) as unknown as { sql: string; values: unknown[] }
    expect(plan(statement.sql, statement.values)[0]).toMatch(/^SEARCH t USING COVERING INDEX entry_tags_by_shuffle/)
    expect(listStatement(db, { order: 'random', seed: 0 }, undefined, 1)).toBeNull()
    expect(listStatement(db, { order: 'new' }, undefined, 1)).toBeNull()
  })

  test('an exact description search reads the claims index by value', () => {
    const statement = listStatement(db, { query: '⿰木木' }) as unknown as { sql: string; values: unknown[] }
    expect(plan(statement.sql, statement.values).join('\n')).toMatch(/SEARCH k USING COVERING INDEX claims_by_value \(kind=\? AND value=\? AND entry_id=\?\)/)
  })

  test('an exact description search with other spellings reads the claims index by value for each', () => {
    const statement = listStatement(db, { query: '⿰木木', also: ['⿱木木', '⿰木水'] }) as unknown as { sql: string; values: unknown[] }
    expect(statement.values.slice(0, 3)).toEqual(['⿰木木', '⿱木木', '⿰木水'])
    const details = plan(statement.sql, statement.values).join('\n')
    expect(details).toMatch(/SEARCH k USING COVERING INDEX claims_by_value \(kind=\? AND value=\? AND entry_id=\?\)/)
    expect(details).not.toMatch(/TEMP B-TREE FOR ORDER BY/)
  })

  test('claims by value and a source page read their indexes', async () => {
    const plans: string[] = []
    const traced = { prepare(sql: string) {
      const statement = db.prepare(sql)
      return { bind(...values: unknown[]) { plans.push(plan(sql, values).join('\n')); return statement.bind(...values) } }
    }, batch: (statements: D1PreparedStatement[]) => db.batch(statements) } as D1Database
    await createEntry(db, fields(), seen({ title: 'Book', vias: [via({ title: 'Post' })] }), [], who)
    await claimedBy(traced, 'ids', '⿰木木')
    await sourcePage(traced, 1)
    // claims, then the source itself (a lookup by key), then a direct and a via read of rows and pictures.
    expect(plans).toHaveLength(6)
    plans.splice(1, 1)
    expect(plans[0]).toMatch(/SEARCH k USING COVERING INDEX claims_by_value \(kind=\? AND value=\?\)/)
    expect(plans[1]).toMatch(/SEARCH s USING INDEX sightings_by_source \(source_id=\?\)/)
    expect(plans[2]).toMatch(/SEARCH s USING INDEX sightings_by_source \(source_id=\?\)/)
    expect(plans[3]).toMatch(VIA_SEARCH)
    expect(plans[4]).toMatch(VIA_SEARCH)
    for (const details of plans) expect(details).not.toMatch(/TEMP B-TREE|SCAN (?!.*USING)/)
  })

  test('the chain of a sighting is read, written and cleaned up through its keys', async () => {
    const written: { sql: string; values: unknown[] }[] = []
    const traced = { prepare(sql: string) {
      const statement = db.prepare(sql)
      return { ...statement, bind(...values: unknown[]) { if (sql.includes('sighting_vias')) written.push({ sql, values }); return statement.bind(...values) } }
    }, batch: (statements: D1PreparedStatement[]) => db.batch(statements) } as D1Database
    const id = await createEntry(traced, fields(), seen({ title: 'Book', vias: [via({ title: 'Post' }), via({ title: 'Thread' })] }), [], who)
    const sighting = (await getEntry(traced, id))!.sightings[0]
    await getSighting(traced, sighting.id)
    await editSighting(traced, sighting.id, 1, seen({ title: 'Book', vias: [via({ title: 'Thread' })] }), null, who, null, id)
    await setHidden(traced, { entry: id }, true, who, null)
    // The recount merges two lists with UNION, so it sorts what it merges; it is checked by its indexes in the test of the recount.
    const plans = written.filter(statement => !statement.sql.startsWith('UPDATE sources SET records')).map(statement => plan(statement.sql, statement.values).join('\n'))
    expect(plans.length).toBeGreaterThanOrEqual(8)
    for (const details of plans) expect(details).not.toMatch(/TEMP B-TREE|SCAN (?!j\b|sqlite_sequence\b)(?!.*USING)/)
    const all = plans.join('\n')
    expect(all).toMatch(/SEARCH v USING PRIMARY KEY \(sighting_id=\?\)/)
    expect(all).toMatch(/SEARCH sighting_vias USING PRIMARY KEY \(sighting_id=\?\)/)
    expect(all).toMatch(/SEARCH sighting_vias USING COVERING INDEX sighting_vias_by_source \(source_id=\?\)/)
  })

  test('each order of the source gallery reads its own index, and each source\'s sightings from theirs', async () => {
    await createEntry(db, fields(), seen({ title: 'Book', publisher: 'Test press', vias: [via({ title: 'Post', publisher: 'Test press' })], report_date: '1900' }), [image], who)
    await createEntry(db, fields(), seen({ title: 'Leaflet', publisher: 'Test press' }), [], who)
    const press = (await publicPublisher(db, 'Test press'))!
    const cases = [['new', null, 'sources_listed'], ['most', null, 'sources_by_records'], ['earliest', null, 'sources_by_year'], ['latest', { key: 1900, id: 1 }, 'sources_by_year'], ['latest', { key: null, id: 9 }, 'sources_undated']] as const
    for (const [sort, cursor, index] of cases) for (const publisher of [null, press.id]) {
      const plans: string[] = []
      const traced = { prepare(sql: string) {
        const statement = db.prepare(sql)
        return { bind(...values: unknown[]) { plans.push(plan(sql, values).join('\n')); return statement.bind(...values) } }
      }, batch: (statements: D1PreparedStatement[]) => db.batch(statements) } as D1Database
      await sourceList(traced, sort, cursor, publisher)
      expect(plans[0]).toMatch(new RegExp(`SEARCH c USING INDEX ${index}${publisher === null ? '' : '_publisher'} \\(`))
      expect(plans[0]).toMatch(/SEARCH s USING INDEX sightings_by_source \(source_id=\?\)/)
      expect(plans[0]).toMatch(VIA_SEARCH)
      expect(plans.at(-1)).toMatch(/SEARCH e USING INTEGER PRIMARY KEY \(rowid=\?\)/)
      for (const details of plans) expect(details).not.toMatch(/TEMP B-TREE|SCAN (?!j\b|r\b)(?!.*USING)/)
    }
  })

  test('a write counts a source again from the indexes of its sightings', async () => {
    const written: { sql: string; values: unknown[] }[] = []
    const traced = { prepare(sql: string) {
      const statement = db.prepare(sql)
      const wrap = (values: unknown[]): D1PreparedStatement => ({ ...statement, bind: (...more: unknown[]) => { written.push({ sql, values: more }); return statement.bind(...more) } }) as unknown as D1PreparedStatement
      return wrap([])
    }, batch: (statements: D1PreparedStatement[]) => db.batch(statements) } as D1Database
    const id = await createEntry(db, fields(), seen({ title: 'Book' }), [], who)
    await setHidden(traced, { entry: id }, true, who, null)
    const recount = written.find(statement => statement.sql.startsWith('UPDATE sources SET records'))!
    const details = plan(recount.sql, recount.values).join('\n')
    expect(details).toMatch(/SEARCH sources USING INTEGER PRIMARY KEY \(rowid=\?\)/)
    expect(details).toMatch(/SEARCH s USING INDEX sightings_by_source \(source_id=\?\)/)
    expect(details).toMatch(VIA_SEARCH)
    expect(details).not.toMatch(/SCAN (sources|sightings|entries)\b/)
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
    expect(readEntryFields(form([...unicode, ['status', 'variant']]), []).fields).not.toHaveProperty('status')
  })

  test('an old snapshot that holds a status still reads', () => {
    const raw = JSON.stringify({ script: 'han', script_other: null, description: null, status: 'doubtful', radical: null, strokes: null, claims: [] })
    expect(entryFieldsOf(raw)).toEqual({ script: 'han', script_other: null, description: null, radical: null, strokes: null, claims: [] })
  })
})

test('a record repeats the layout of its first description for its tile, through edits and restores', async () => {
  const layout = { '0': [1, 0, 0, 1, -40, 12] }
  const moved = fields({ claims: [claim('ids', '⿰亻⿱七木', { layout }), claim('ids', '⿰亻桼')] })
  const id = await createEntry(db, moved, seen(), [], who)
  const original = (await history(db, id)).find(row => row.kind === 'create')!
  expect((await getEntry(db, id))!.entry.layout).toBe(JSON.stringify(layout))
  expect((await list(db, {}))!.tiles[0]).toMatchObject({ ids: '⿰亻⿱七木', layout: JSON.stringify(layout) })
  await editEntry(db, id, 1, { ...moved, claims: [claim('ids', '⿰亻⿱七木'), claim('ids', '⿰亻桼')] }, who, null)
  expect((await getEntry(db, id))!.entry.layout).toBeNull()
  await revertEntry(db, id, original.id, who)
  expect((await getEntry(db, id))!.entry.layout).toBe(JSON.stringify(layout))
  expect((await getEntry(db, id))!.claims[0].data).toEqual({ layout })
})

describe('scripts outside the list', () => {
  const named = (script: string) => { const form = new FormData(); form.set('script', script); return readEntryFields(form, []).fields }

  test('the form names a script, and only `other` keeps a name', () => {
    expect(named('漢字')).toMatchObject({ script: 'han', script_other: null })
    expect(named('方音符號')).toMatchObject({ script: 'other', script_other: '方音符號' })
    expect(readEntryFields(new FormData(), [], fields({ script: 'other', script_other: '方音符號' })).fields).toMatchObject({ script: 'other', script_other: '方音符號' })
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

describe('typed tags and implications', () => {
  const listed = () => tagList(db)
  const made = async (name: string, type: 'general' | 'region' | 'language' | 'form' | 'domain' | 'meta' = 'general', implies: string[] = []) => {
    const result = await createTag(db, await listed(), { name, type, implies }, who)
    expect(result).toMatchObject({ ok: true })
    return result
  }
  const tagsOf = (id: number) => (raw.query("SELECT tag FROM entry_tags WHERE entry_id = ? AND tag GLOB 't:*' ORDER BY tag").all(id) as { tag: string }[]).map(row => row.tag)
  const row = async (name: string) => {
    const found = (await listed()).find(tag => tag.name === name)
    if (!found) return found
    const { rev: _, ...rest } = found
    return rest
  }
  const countOf = (tag: string) => (raw.query('SELECT n FROM tag_counts WHERE tag = ?').get(tag) as { n: number } | null)?.n ?? 0
  const plan = (statement: unknown) => {
    const { sql, values } = statement as { sql: string; values: unknown[] }
    return (raw.query(`EXPLAIN QUERY PLAN ${sql}`).all(...(values as never[])) as { detail: string }[]).map(r => r.detail).join('\n')
  }
  const filed = () => [
    raw.query("SELECT tag, entry_id, sightings, year FROM entry_tags WHERE tag GLOB 't:*' ORDER BY tag, entry_id").all(),
    raw.query("SELECT tag, n FROM tag_counts WHERE tag GLOB 't:*' AND n != 0 ORDER BY tag").all(),
  ]
  const everything = () => [
    raw.query('SELECT * FROM tags ORDER BY name').all(),
    raw.query('SELECT * FROM tag_implications ORDER BY tag, implies').all(),
    raw.query('SELECT * FROM tag_changes ORDER BY id').all(),
    ...filed(),
  ]
  const refreshAll = async () => { for (const { id } of raw.query('SELECT id FROM entries').all() as { id: number }[]) await refresh(db, id) }
  const latest = () => (raw.query('SELECT MAX(id) AS id FROM tag_changes').get() as { id: number }).id

  test('seeded tags carry their types and regional/form implications transitively', async () => {
    const all = await listed()
    expect(all.find(tag => tag.name === 'nom')).toMatchObject({ type: 'form', implies: ['dialect', '越南'] })
    expect(all.find(tag => tag.name === 'kokuji')).toMatchObject({ type: 'form', implies: ['dialect', '日本'] })
    expect(all.find(tag => tag.name === 'ゲバ字')).toMatchObject({ type: 'form', implies: ['日本'] })
    expect(all.find(tag => tag.name === '日本')).toMatchObject({ type: 'region', implies: [] })
    expect(all.find(tag => tag.name === '越南')).toMatchObject({ type: 'region', implies: [] })

    const nomId = await createEntry(db, fields({ claims: [claim('tag', 'nom')] }), seen(), [], who)
    const gebaId = await createEntry(db, fields({ claims: [claim('tag', 'ゲバ字')] }), seen(), [], who)
    expect(tagsOf(nomId)).toEqual(['t:dialect', 't:nom', 't:越南'])
    expect(tagsOf(gebaId)).toEqual(['t:ゲバ字', 't:日本'])
    expect((await list(db, { facet: 't:越南' }))!.tiles.map(t => t.id)).toEqual([nomId])
    expect((await list(db, { facet: 't:日本' }))!.tiles.map(t => t.id)).toEqual([gebaId])
    expect((await list(db, { facet: 't:dialect' }))!.tiles.map(t => t.id)).toEqual([nomId])
    // Claims themselves are NOT duplicated with implied tags.
    expect((await getEntry(db, nomId))!.claims.map(c => c.value)).toEqual(['nom'])

    // Pure implicationClosure tracks diamond DAG paths cleanly.
    const grouped = arrangeTagsByType(all)
    expect(grouped.map(g => g.type)).toEqual(['region', 'language', 'form', 'domain'])
    const closure = implicationClosure(['nom', 'shinjitai'], all)
    expect(closure.direct).toEqual(['nom', 'shinjitai'])
    expect(closure.implied).toEqual(expect.arrayContaining([
      { name: '越南', via: ['nom'] },
      { name: 'dialect', via: ['nom'] },
      { name: '日本', via: ['shinjitai'] },
      { name: 'abbreviation', via: ['shinjitai'] },
    ]))
  })

  test('adding, editing, and removing diamond DAG implications keep counts and survival along alternate paths', async () => {
    // Diamond: child -> branchA -> root, child -> branchB -> root
    await made('root', 'region')
    await made('branchA', 'form', ['root'])
    await made('branchB', 'language', ['root'])
    await made('child', 'domain', ['branchA', 'branchB'])
    const id = await createEntry(db, fields({ claims: [claim('tag', 'child')] }), seen({ report_date: '1920' }), [], who)
    expect(tagsOf(id)).toEqual(['t:branchA', 't:branchB', 't:child', 't:root'])
    expect([countOf('t:child'), countOf('t:branchA'), countOf('t:branchB'), countOf('t:root')]).toEqual([1, 1, 1, 1])

    // Removing one diamond leg leaves 'root' intact via the other leg.
    expect(await unimplyTag(db, await listed(), { name: 'child', target: 'branchA' }, who)).toEqual({ ok: true })
    expect(tagsOf(id)).toEqual(['t:branchB', 't:child', 't:root'])
    expect([countOf('t:branchA'), countOf('t:branchB'), countOf('t:root')]).toEqual([0, 1, 1])

    // Removing the second leg clears 'root' cleanly too.
    expect(await unimplyTag(db, await listed(), { name: 'child', target: 'branchB' }, who)).toEqual({ ok: true })
    expect(tagsOf(id)).toEqual(['t:child'])
    expect([countOf('t:branchB'), countOf('t:root')]).toEqual([0, 0])

    // Editing away the direct claim zeroes counts.
    await editEntry(db, id, 1, fields({ claims: [] }), who, null)
    expect(tagsOf(id)).toEqual([])
    expect(countOf('t:child')).toBe(0)
  })

  test('an unknown tag added on a record lands under general and is indexed and logged once', async () => {
    const id = await createEntry(db, fields({ claims: [claim('tag', '戶籍用字')] }), seen(), [], who)
    expect(tagsOf(id)).toEqual(['t:戶籍用字'])
    expect(await row('戶籍用字')).toMatchObject({ type: 'general', implies: [], n: 1 })
    await ensureTags(db, ['戶籍用字'], who)
    expect(raw.query("SELECT name, kind, after FROM tag_changes WHERE name = '戶籍用字'").all()).toEqual([{ name: '戶籍用字', kind: 'create', after: '{"label":"戶籍用字","type":"general"}' }])
  })

  test('retype, rename, cycle checks, and depth cap enforce invariants', async () => {
    await made('t0', 'general')
    let prev = 't0'
    for (let i = 1; i < TAG_IMPLY_DEPTH_MAX; i += 1) {
      const next = `t${i}`
      await made(next, 'form', [prev])
      prev = next
    }
    expect(canImply(await listed(), 'extra', prev)).toBe('missing')
    await made('extra', 'domain')
    // Adding `extra -> t{depth-1}` creates path of length TAG_IMPLY_DEPTH_MAX + 1 > max.
    expect(await implyTag(db, await listed(), { name: 'extra', target: prev }, who)).toEqual({ ok: false, code: 'depth' })
    // Self and cycle are refused.
    expect(await implyTag(db, await listed(), { name: 't0', target: 't0' }, who)).toEqual({ ok: false, code: 'cycle' })
    expect(await implyTag(db, await listed(), { name: 't0', target: prev }, who)).toEqual({ ok: false, code: 'cycle' })

    // Retype and rename preserve implications and canonical names.
    expect(await retypeTag(db, await listed(), { name: 'extra', type: 'meta' }, who)).toEqual({ ok: true })
    expect(await row('extra')).toMatchObject({ type: 'meta' })
    expect(await renameTag(db, await listed(), { name: 'extra', label: '別名' }, who)).toEqual({ ok: true })
    expect(tagLabels(await listed()).get('extra')).toBe('別名')
    expect(cleanTag('別名', await listed())).toBe('extra')
    // Duplicate label or name collision refused.
    expect(await renameTag(db, await listed(), { name: 't0', label: '別名' }, who)).toEqual({ ok: false, code: 'exists' })
    expect(await retypeTag(db, await listed(), { name: 'extra', type: 'bogus' }, who)).toEqual({ ok: false, code: 'invalid' })
  })

  test('unused tags delete cleanly; tags used by records or upstream implications cannot be deleted', async () => {
    await made('target', 'region')
    await made('holder', 'form', ['target'])
    await made('spare', 'meta')
    const id = await createEntry(db, fields({ claims: [claim('tag', 'holder')] }), seen(), [], who)
    await setHidden(db, { entry: id }, true, who, null)
    expect(await deleteTag(db, await listed(), { name: 'holder' }, who)).toEqual({ ok: false, code: 'used' })
    expect(await deleteTag(db, await listed(), { name: 'target' }, who)).toEqual({ ok: false, code: 'used' })
    expect(await deleteTag(db, await listed(), { name: '無' }, who)).toEqual({ ok: false, code: 'missing' })
    expect(await deleteTag(db, await listed(), { name: 'spare' }, who)).toEqual({ ok: true })
    expect(await row('spare')).toBeUndefined()
  })

  test('reads and writes use indexes rather than scans or temporary sorts', async () => {
    await made('甲', 'domain', ['music'])
    const sent: { sql: string; values: unknown[] }[] = []
    const spy = { prepare: (sql: string) => db.prepare(sql), batch: (statements: never[]) => { sent.push(...statements); return db.batch(statements) } } as unknown as D1Database
    await createTag(spy, await listed(), { name: '乙', type: 'form', implies: ['甲'] }, who)
    await ensureTags(spy, ['丙', '乙'], who)
    await renameTag(spy, await listed(), { name: '乙', label: '乙二' }, who)
    await retypeTag(spy, await listed(), { name: '乙', type: 'meta' }, who)
    await implyTag(spy, await listed(), { name: '乙', target: 'dialect' }, who)
    await unimplyTag(spy, await listed(), { name: '乙', target: '甲' }, who)
    await deleteTag(spy, await listed(), { name: '丙' }, who)
    await undoTagChange(spy, await listed(), latest(), who)
    const filedRecord = await createEntry(spy, fields({ claims: [claim('tag', '乙')] }), seen(), [], who)
    await editEntry(spy, filedRecord, 1, fields({ claims: [claim('tag', 'music')] }), who, null)
    expect(sent.length).toBeGreaterThan(12)
    for (const statement of sent.filter(statement => /tags|tag_implications|'t:'/.test(statement.sql))) {
      expect(`${statement.sql}: ${plan(statement)}`).not.toMatch(/claims_by_value \(kind=\?\)|AUTOMATIC|TEMP B-TREE FOR (ORDER BY|DISTINCT)|SCAN (tags|tag_implications|tag_counts|claims|entries|entry_tags|people|cl|e|t|c)\b/)
    }

    const reads: [string, string, RegExp][] = [
      ['list', plan(tagsStatement(db)), /SCAN c USING INDEX tags_by_type[\s\S]*SEARCH t USING PRIMARY KEY \(tag=\?\)/],
      ['used', plan(tagsStatement(db, true)), /SEARCH t USING PRIMARY KEY \(tag=\?\)[\s\S]*SEARCH claims USING COVERING INDEX claims_by_value \(kind=\? AND value=\?\)/],
      ['implications', plan(implicationsStatement(db)), /: SCAN tag_implications$/],
      ['move size', plan(moveSizeStatement(db, '甲')), /SEARCH tag_counts USING PRIMARY KEY \(tag=\?\)/],
      ['recent moves', plan(recentMovesStatement(db, who.actor, '2026')), /SEARCH tag_changes USING (COVERING )?INDEX tag_changes_by_actor \(actor=\?/],
      ['latest change', plan(latestChangeStatement(db, '甲')), /SEARCH tag_changes USING COVERING INDEX tag_changes_by_name \(name=\?\)/],
      ['changes', plan(changesStatement(db)), /SCAN c[\s\S]*SEARCH p USING INDEX sqlite_autoindex_people_1 \(id=\?\)/],
      ...refileStatements(db, '甲').map((statement, index): [string, string, RegExp] => [
        `refile ${index}`,
        plan(statement),
        /^(?=[\s\S]*SEARCH i USING COVERING INDEX tag_implications_by_implies \(implies=\?\))(?=[\s\S]*SEARCH cl USING (COVERING )?INDEX claims_by_value \(kind=\? AND value=\?\))/,
      ]),
      ['label check', plan(db.prepare('SELECT 1 FROM tags WHERE label = ?').bind('甲')), /SEARCH tags USING COVERING INDEX tags_by_label \(label=\?\)/],
      ['unused check', plan(db.prepare("SELECT NOT EXISTS (SELECT 1 FROM tag_implications WHERE implies = ?1) AND NOT EXISTS (SELECT 1 FROM claims WHERE kind = 'tag' AND value = ?1)").bind('甲')), /tag_implications_by_implies \(implies=\?\)[\s\S]*claims_by_value \(kind=\? AND value=\?\)/],
    ]
    expect(plan(refileStatements(db, '甲')[2])).toMatch(/SEARCH cl USING INDEX claims_by_entry \(entry_id=\?\)/)
    for (const [name, details, wanted] of reads) {
      expect(`${name}: ${details}`).not.toMatch(/claims_by_value \(kind=\?\)/)
      expect(`${name}: ${details}`).toMatch(wanted)
      expect(`${name}: ${details}`).not.toMatch(/AUTOMATIC|TEMP B-TREE FOR (ORDER BY|DISTINCT)|SCAN (tags|tag_counts|claims|entries|entry_tags|people|cl|e|t)\b/)
      if (name !== 'implications') expect(`${name}: ${details}`).not.toMatch(/SCAN tag_implications\b/)
      if (name !== 'refile 3') expect(details).not.toMatch(/TEMP B-TREE/)
    }
    expect(plan(changesStatement(db))).not.toMatch(/ORDER BY/)
  })

  test('imply and unimply refile affected records accurately, including alongside edit/create races and stale revisions', async () => {
    await made('P1', 'region'); await made('P2', 'region'); await made('C', 'form', ['P1'])
    const id = await createEntry(db, fields({ claims: [claim('tag', 'C')] }), seen({ report_date: '1617' }), [], who)
    const stale = await listed()
    expect(await implyTag(db, stale, { name: 'C', target: 'P2' }, who)).toEqual({ ok: true })
    const after = everything()
    // Second write from stale snapshot is refused cleanly.
    expect(await retypeTag(db, stale, { name: 'C', type: 'meta' }, who)).toEqual({ ok: false, code: 'conflict' })
    expect(everything()).toEqual(after)

    // Race between imply/unimply and editEntry leaves record filed under final tag graph.
    let flips = 1
    const racing = {
      prepare: (sql: string) => db.prepare(sql),
      batch: async (statements: { sql: string }[]) => {
        if (flips && statements.some(statement => /UPDATE entries SET/.test(statement.sql))) {
          flips -= 1
          expect(await unimplyTag(db, await listed(), { name: 'C', target: 'P1' }, who)).toEqual({ ok: true })
        }
        return db.batch(statements as never[])
      },
    } as unknown as D1Database
    expect(await editEntry(racing, id, 1, fields({ claims: [claim('tag', 'C')] }), who, null)).toMatchObject({ ok: true })
    expect(tagsOf(id)).toEqual(['t:C', 't:P2'])
    const edited = filed()
    await refreshAll()
    expect(filed()).toEqual(edited)
  })

  test('implication changes stop past the record cap and hourly limit, while undo stays exempt', async () => {
    await made('R', 'region'); await made('H', 'form')
    raw.run('PRAGMA foreign_keys = OFF')
    raw.transaction(() => {
      for (let i = 1000; i < 1000 + MOVE_RECORDS_MAX + 1; i += 1) {
        raw.run("INSERT INTO entries(id, script, created_by, created_at, updated_at, sightings) VALUES (?, 'han', 'p', 'x', 'x', 1)", [i])
        raw.run("INSERT INTO claims(entry_id, position, key, kind, value, data, sightings, under) VALUES (?, 0, 'tag00001', 'tag', 'H', NULL, '[]', '[]')", [i])
        raw.run("INSERT INTO entry_tags(tag, entry_id, sightings) VALUES ('t:H', ?, 1)", [i])
      }
      raw.run("INSERT INTO tag_counts(tag, n) VALUES ('t:H', ?) ON CONFLICT(tag) DO UPDATE SET n = ?", [MOVE_RECORDS_MAX + 1, MOVE_RECORDS_MAX + 1])
    })()
    raw.run('PRAGMA foreign_keys = ON')
    expect(await implyTag(db, await listed(), { name: 'H', target: 'R' }, who)).toEqual({ ok: false, code: 'too_large' })

    // Rate limit for non-undo implication edits; undo passes.
    await made('L1'); await made('L2')
    raw.transaction(() => {
      const stamp = new Date().toISOString()
      for (let i = 1; i < MOVES_PER_HOUR; i += 1) {
        raw.run("INSERT INTO tag_changes(name, kind, before, after, actor, at) VALUES ('L2', 'imply', NULL, '{}', ?, ?)", [who.actor, stamp])
      }
    })()
    expect(await implyTag(db, await listed(), { name: 'L1', target: 'L2' }, who)).toEqual({ ok: true })
    const implyId = latest()
    expect(await unimplyTag(db, await listed(), { name: 'L1', target: 'L2' }, who)).toEqual({ ok: false, code: 'slow' })
    expect(await undoTagChange(db, await listed(), implyId, who)).toEqual({ ok: true })
    expect(await row('L1')).toMatchObject({ implies: [] })
  })

  test('undoing create, rename, retype, imply, unimply and delete restores tags and tag_counts cleanly, and change ids never repeat', async () => {
    await made('甲', 'domain')
    await made('乙', 'form', ['甲'])
    await createEntry(db, fields({ claims: [claim('tag', '乙')] }), seen({ report_date: '1850' }), [], who)
    const before = everything()

    expect(await retypeTag(db, await listed(), { name: '乙', type: 'meta' }, who)).toEqual({ ok: true })
    expect(await undoTagChange(db, await listed(), latest(), who)).toEqual({ ok: true })
    expect([tagsOf(1), countOf('t:甲')]).toEqual([['t:乙', 't:甲'], 1])

    expect(await unimplyTag(db, await listed(), { name: '乙', target: '甲' }, who)).toEqual({ ok: true })
    expect([tagsOf(1), countOf('t:甲')]).toEqual([['t:乙'], 0])
    expect(await undoTagChange(db, await listed(), latest(), who)).toEqual({ ok: true })
    expect([tagsOf(1), countOf('t:甲')]).toEqual([['t:乙', 't:甲'], 1])

    // Only the latest change of a tag can be undone.
    await renameTag(db, await listed(), { name: '乙', label: '乙改' }, who)
    const staleId = latest() - 1
    expect(await undoTagChange(db, await listed(), staleId, who)).toEqual({ ok: false, code: 'conflict' })
    expect(await undoTagChange(db, await listed(), latest(), who)).toEqual({ ok: true })
    expect(await row('乙')).toMatchObject({ label: '乙', type: 'form', implies: ['甲'] })

    // Unused tag create/delete roundtrip.
    await made('丙', 'meta', ['乙'])
    const createId = latest()
    expect(await undoTagChange(db, await listed(), createId, who)).toEqual({ ok: true })
    expect(await row('丙')).toBeUndefined()
    expect(await undoTagChange(db, await listed(), latest(), who)).toEqual({ ok: true })
    expect(await row('丙')).toMatchObject({ type: 'meta', implies: ['乙'] })

    // Deleting a tag log row cannot make a stale rev succeed.
    const zStale = await listed()
    expect(await renameTag(db, await listed(), { name: '丙', label: '丙新' }, who)).toEqual({ ok: true })
    raw.run('DELETE FROM tag_changes WHERE id = ?', [latest()])
    expect(await renameTag(db, zStale, { name: '丙', label: '丙錯' }, who)).toEqual({ ok: false, code: 'conflict' })
    expect(before[0]).toBeDefined()
  })

  test('every valid tag name is accepted as a t: facet', () => {
    expect(facetTag('t:近古字書')).toBe('t:近古字書')
    expect(facetTag(`t:${'字'.repeat(40)}`)).toBe(`t:${'字'.repeat(40)}`)
    expect(facetTag('c:extension-e')).toBe('c:extension-e')
    expect(facetTag('g:hakka')).toBeUndefined()
  })
})
describe('radicals', () => {
  const tagsOf = (id: number) => (raw.query("SELECT tag FROM entry_tags WHERE entry_id = ? AND tag GLOB 'b:*' ORDER BY tag").all(id) as { tag: string }[]).map(row => row.tag)
  const statedBy = (id: number) => (raw.query("SELECT tag FROM entry_tags WHERE entry_id = ? AND tag GLOB 'b!*' ORDER BY tag").all(id) as { tag: string }[]).map(row => row.tag)
  const listed = async (radical: string) => (await list(db, { radical }))!.tiles.map(tile => tile.id)
  const stand = async (under?: string) => { const { counts, stated } = await radicalCounts(db, under); return standing(counts, stated) }

  test('a record is listed under its radical and every path down to its head', async () => {
    const weight = await createEntry(db, described('⿺克卡'), seen(), [], who)
    const mouth = await createEntry(db, described('⿰口男'), seen(), [], who)
    expect(tagsOf(weight)).toEqual(['b:儿', 'b:儿兄', 'b:儿兄克'])
    expect(tagsOf(mouth)).toEqual(['b:口'])
    expect(await listed('儿')).toEqual([weight])
    expect(await listed('儿兄克')).toEqual([weight])
    expect(await listed('口')).toEqual([mouth])
    expect(await listed('山')).toEqual([])
    expect(await list(db, { radical: '克' })).toBeNull()
    expect(await list(db, { radical: 'x' })).toBeNull()
    expect(await counts(db)).not.toHaveProperty('b:口')
  })

  test('a new description or a stated radical files the record again, and a hidden record is filed nowhere', async () => {
    const id = await createEntry(db, described('⿰口男'), seen(), [], who)
    await editEntry(db, id, 1, described('⿰男口'), who, null)
    expect(tagsOf(id)).toEqual(['b:田', 'b:田男'])
    await editEntry(db, id, 2, { ...described('⿰男口'), radical: '口' }, who, null)
    expect(tagsOf(id)).toEqual(['b:口'])
    expect(statedBy(id)).toEqual(['b!口'])
    expect(await radicalCounts(db)).toEqual({ counts: new Map([['口', 1]]), stated: new Set(['口']) })
    await setHidden(db, { entry: id }, true, who, null)
    expect(tagsOf(id)).toEqual([])
    expect(await radicalCounts(db)).toEqual({ counts: new Map(), stated: new Set() })
  })

  test('a path stands as a radical once ten records stay in it', async () => {
    for (const part of '千百十分厘毫卡兩') await createEntry(db, described(`⿺克${part}`), seen(), [], who)
    await createEntry(db, described('⿰兄口'), seen(), [], who)
    const nine = await createEntry(db, described('⿺克米'), seen(), [], who)
    expect(await stand()).toEqual([{ path: '儿', radical: '儿', records: 10, branches: [{ path: '儿兄', radical: '兄', records: 10, branches: [] }] }])
    await createEntry(db, described('⿺克斤'), seen(), [], who)
    // 兄 keeps one record of its own once 克 stands, so it stands no longer.
    expect(await stand('儿')).toEqual([{ path: '儿', radical: '儿', records: 11, branches: [{ path: '儿兄克', radical: '克', records: 10, branches: [] }] }])
    await setHidden(db, { entry: nine }, true, who, null)
    expect(await stand()).toEqual([{ path: '儿', radical: '儿', records: 10, branches: [{ path: '儿兄', radical: '兄', records: 10, branches: [] }] }])
  })

  test('a radical a record states stands at once, and holds the records read into it', async () => {
    const read = await createEntry(db, described('⿰男求'), seen(), [], who)
    expect(await stand()).toEqual([{ path: '田', radical: '田', records: 1, branches: [] }])
    const said = await createEntry(db, { ...described('⿱糞土'), radical: '男' }, seen(), [], who)
    expect(tagsOf(said)).toEqual(['b:田', 'b:田男'])
    expect(statedBy(said)).toEqual(['b!田男'])
    expect(await stand()).toEqual([{ path: '田', radical: '田', records: 2, branches: [{ path: '田男', radical: '男', records: 2, branches: [] }] }])
    expect(await stand('田')).toEqual(await stand())
    expect(await listed('田男')).toEqual([said, read])
    await setHidden(db, { entry: said }, true, who, null)
    expect(await stand()).toEqual([{ path: '田', radical: '田', records: 1, branches: [] }])
  })

  test('a stated character without a Kangxi radical is a radical after the Kangxi ones', async () => {
    const id = await createEntry(db, { ...described('⿸ㄏ·'), radical: 'ㄏ' }, seen(), [], who)
    const other = await createEntry(db, { ...described('⿰口男'), radical: 'ㄏ' }, seen(), [], who)
    await createEntry(db, described('⿰龠口'), seen(), [], who)
    expect(tagsOf(id)).toEqual(['b:ㄏ'])
    expect(statedBy(id)).toEqual(['b!ㄏ'])
    expect((await stand()).map(branch => [branch.path, branch.records])).toEqual([['龠', 1], ['ㄏ', 2]])
    expect(await stand('ㄏ')).toEqual([{ path: 'ㄏ', radical: 'ㄏ', records: 2, branches: [] }])
    expect(await listed('ㄏ')).toEqual([other, id])
    expect(await counts(db)).not.toHaveProperty('b!ㄏ')
  })
})

describe('chronology', () => {
  // Records first seen in 1803, 1813, … 1933, then CHRONICLE_PAGE more from 1950 on, and one with no year.
  const years = [...Array.from({ length: 14 }, (_, i) => 1803 + i * 10), ...Array.from({ length: CHRONICLE_PAGE }, (_, i) => 1950 + Math.floor(i / 3)), null]
  beforeEach(() => {
    years.forEach((year, i) => raw.prepare("INSERT INTO entries(id, script, first_year, first_year_kind, created_by, created_at, updated_at) VALUES(?, 'han', ?, 'report', ?, '2026', '2026')").run(i + 1, year === null ? null : String(year), who.actor))
    raw.exec("INSERT INTO entry_tags(tag, entry_id, year) SELECT 'all', id, CAST(first_year AS INTEGER) FROM entries")
    raw.exec("INSERT INTO entry_tags(tag, entry_id, year) SELECT 'y:' || (CAST(first_year AS INTEGER) / 10 * 10), id, CAST(first_year AS INTEGER) FROM entries WHERE first_year IS NOT NULL")
    raw.exec("INSERT INTO tag_counts(tag, n) SELECT tag, count(*) FROM entry_tags GROUP BY tag")
  })

  test('lists dated records by year from a place, a page at a time, and counts the decades', async () => {
    const first = await chronology(db, chroniclePlace(null, null, null)!)
    expect(first.entries.map(entry => entry.year).slice(0, 3)).toEqual([1803, 1813, 1823])
    expect(first.entries).toHaveLength(CHRONICLE_PAGE)
    expect(first.decades[0]).toEqual({ decade: 1800, n: 1 })
    expect({ earlier: first.earlier, later: first.later, dated: first.dated, undated: first.undated }).toEqual({ earlier: null, later: `at=1978.${CHRONICLE_PAGE + 1}`, dated: 14 + CHRONICLE_PAGE, undated: 1 })
    const next = await chronology(db, chroniclePlace(first.later!.slice(3), null, null)!)
    expect(next.entries.map(entry => entry.tile.id)).toEqual(Array.from({ length: 14 }, (_, i) => CHRONICLE_PAGE + 1 + i))
    expect(next.later).toBeNull()
    expect(next.earlier).toBe(`before=1978.${CHRONICLE_PAGE + 1}`)
    // A decade starts at its first record.
    expect((await chronology(db, chroniclePlace(null, null, '1950')!)).entries[0]).toMatchObject({ year: 1950, tile: { id: 15 } })
  })

  test('pages tile exactly both ways, even with fewer than a page before the start', async () => {
    const ids = async (place: ReturnType<typeof chroniclePlace>) => (await chronology(db, place!)).entries.map(entry => entry.tile.id)
    // 1950 starts after 14 records, fewer than a page.
    const from = await chronology(db, chroniclePlace(null, null, '1950')!)
    expect(from.earlier).toBe('before=1950.15')
    const back = await chronology(db, chroniclePlace(null, '1950.15', null)!)
    expect(back.entries.map(entry => entry.tile.id)).toEqual(Array.from({ length: 14 }, (_, i) => i + 1))
    expect(back.earlier).toBeNull()
    // Going back and forth returns to the same rows.
    expect(back.later).toBe('at=1950.15')
    expect(await ids(chroniclePlace('1950.15', null, null))).toEqual(from.entries.map(entry => entry.tile.id))
    // A full page back from the end, and on from there.
    const end = await chronology(db, chroniclePlace(null, `1983.${CHRONICLE_PAGE + 14}`, null)!)
    expect(end.entries).toHaveLength(CHRONICLE_PAGE)
    expect(end.earlier).toBe(`before=${end.entries[0].year}.${end.entries[0].tile.id}`)
    expect(end.later).toBe(`at=1983.${CHRONICLE_PAGE + 14}`)
  })

  test('names the evidence that holds each year, with the date it was read from', async () => {
    const id = await createEntry(db, fields(), seen({ title: 'Old print', author: 'Someone', report_date: '1999', original_date: '1935年5月' }), [], who)
    const page = await chronology(db, { at: [1935, 0] })
    expect(page.entries[0]).toMatchObject({ year: 1935, tile: { id }, sighting: { title: 'Old print', author: 'Someone', date: '1935年5月' } })
  })

  test('a place is a year and a record either way, or a decade', () => {
    expect(chroniclePlace('1935.412', null, null)).toEqual({ at: [1935, 412] })
    expect(chroniclePlace(null, '1935.412', null)).toEqual({ before: [1935, 412] })
    expect(chroniclePlace(null, null, '1930')).toEqual({ at: [1930, 0] })
    expect(chroniclePlace(null, null, null)).toEqual({ at: [-1, 0] })
    for (const [at, before, from] of [['1935', null, null], ['1935.0', null, null], [null, 'x.1', null], [null, null, '1935'], [null, null, '05']]) expect(chroniclePlace(at, before, from)).toBeUndefined()
  })

  test('reads one range of the year index, and the counts by key', () => {
    const plan = (statement: unknown) => { const { sql, values } = statement as { sql: string; values: unknown[] }; return (raw.query(`EXPLAIN QUERY PLAN ${sql}`).all(...(values as never[])) as { detail: string }[]).map(row => row.detail) }
    for (const details of [plan(chronicleStatement(db, [1935, 0])), plan(chronicleBackStatement(db, [1935, 0]))]) {
      expect(details[0]).toMatch(/^SEARCH t USING COVERING INDEX entry_tags_by_year \(tag=\? AND /)
      expect(details.join('\n')).not.toMatch(/TEMP B-TREE/)
      for (const detail of details) expect(detail).not.toMatch(/^SCAN /)
    }
    expect(plan(decadeCountsStatement(db))).toEqual([expect.stringMatching(/^SEARCH tag_counts USING PRIMARY KEY \(tag>\? AND tag<\?\)$/)])
  })
})

test('the earliest attestation is a work\'s own date when older than its report, among visible evidence, first added on a tie', () => {
  const at = (id: number, report_date: string | null, original_date: string | null, hidden_at: string | null = null) => ({ id, report_date, original_date, hidden_at })
  expect(earliestSighting([at(1, '2017-03-01', null), at(2, '1999', '1935年'), at(3, '1940', null)])).toMatchObject({ text: '1935', kind: 'original', sighting: { id: 2 } })
  // A reported date older than the work's own date is the earlier one.
  expect(earliestSighting([at(1, '1920', '1950')])).toMatchObject({ text: '1920', kind: 'report' })
  expect(earliestSighting([at(1, '1999', null), at(2, '1800', null, 'hidden')])).toMatchObject({ text: '1999', sighting: { id: 1 } })
  expect(earliestSighting([at(1, '1935', null), at(2, '1935', null)])).toMatchObject({ sighting: { id: 1 } })
  expect(earliestSighting([at(1, null, null), at(2, '令和', null)])).toBeNull()
})

test('a record names the evidence that holds its earliest year through every write', async () => {
  const first = (id: number) => (raw.query('SELECT first_sighting AS s FROM entries WHERE id = ?').get(id) as { s: number | null }).s
  const ids = (id: number) => (raw.query('SELECT id FROM sightings WHERE entry_id = ? ORDER BY id').all(id) as { id: number }[]).map(row => row.id)
  // Created with three pieces of evidence, the middle one oldest.
  const id = await createEntry(db, fields(), seen({ report_date: '2017' }), [], who, [{ fields: seen({ place: 'A book', report_date: '1999', original_date: '1935年' }), media: [] }, { fields: seen({ place: 'A sign', report_date: '2020' }), media: [] }])
  expect(first(id)).toBe(ids(id)[1])
  // An older one added later takes over, and gives the year back when hidden.
  const older = await addSighting(db, id, seen({ place: 'Older', report_date: '1899' }), [], who)
  expect(first(id)).toBe(older)
  const row = await getEntry(db, id)
  const added = row!.sightings.find(sighting => sighting.id === older)!
  await setHidden(db, { entry: id, sighting: older! }, true, who, null)
  expect(first(id)).toBe(ids(id)[1])
  // An edit that moves the date moves the record's earliest evidence with it.
  const latest = row!.sightings.find(sighting => sighting.place === 'A sign')!
  expect(await editSighting(db, latest.id, latest.rev, seen({ place: 'A sign', report_date: '1800' }), null, who, null, id)).toMatchObject({ ok: true })
  expect(first(id)).toBe(latest.id)
  expect(added.id).toBe(older!)
  // A record with no year names none.
  const undated = await createEntry(db, fields(), seen(), [], who)
  expect(first(undated)).toBeNull()
})
describe('search total', () => {
  test('a search counts every record it finds, from its shortest range', async () => {
    await createEntry(db, described('⿰木木'), seen(), [], who)
    await createEntry(db, described('⿰木水'), seen(), [], who)
    await createEntry(db, described('⿰水水'), seen({ place: 'A temple in Lukang' }), [], who)
    expect(await searchTotal(db, { script: 'han', query: '木' })).toEqual({ n: 2, floor: false, pool: 3 })
    expect(await searchTotal(db, { script: 'han', query: '木 水' })).toEqual({ n: 1, floor: false, pool: 3 })
    expect(await searchTotal(db, { script: 'han', query: '⿰木水' })).toEqual({ n: 1, floor: false, pool: 3 })
    expect(await searchTotal(db, { script: 'han', query: 'Lukang' })).toEqual({ n: 1, floor: false, pool: 3 })
    expect(await searchTotal(db, { script: 'han', query: 'absent' })).toEqual({ n: 0, floor: false, pool: 3 })
    expect(await searchTotal(db, { script: 'han', filter: 'variant', query: '木' })).toEqual({ n: 0, floor: false, pool: 0 })
    // A list with nothing to test is no search, and its count is the chip's.
    expect(await searchTotal(db, { script: 'han' })).toBeNull()
  })

  test('past the records it may read, the count is a floor', async () => {
    const n = TOTAL_READ + 5
    raw.prepare(`WITH RECURSIVE seq(x) AS (VALUES(1) UNION ALL SELECT x+1 FROM seq WHERE x < ?)
      INSERT INTO entries(id, script, created_by, created_at, updated_at) SELECT x, 'han', ?, '2026', '2026' FROM seq`).run(n, who.actor)
    raw.exec("INSERT INTO entry_tags(tag, entry_id) SELECT 'all', id FROM entries")
    raw.exec("INSERT INTO entry_tags(tag, entry_id) SELECT 'w:wide', id FROM entries")
    raw.exec("INSERT INTO entry_tags(tag, entry_id) SELECT 'w:even', id FROM entries WHERE id % 2 = 0")
    raw.prepare("INSERT INTO tag_counts(tag, n) VALUES ('all', ?)").run(n)
    expect(await searchTotal(db, { query: 'wide' })).toEqual({ n: TOTAL_READ, floor: true, pool: n })
    expect(await searchTotal(db, { query: 'wide even' })).toEqual({ n: Math.floor(n / 2), floor: false, pool: n })
  })

  test('each read is a range of an index', () => {
    const plan = (sql: string, values: unknown[]) => (raw.query(`EXPLAIN QUERY PLAN ${sql}`).all(...(values as never[])) as { detail: string }[]).map(row => row.detail)
    const statements = [
      totalStatement(db, { script: 'han', query: '亻 木' }, { tag: 'w:亻' }),
      totalStatement(db, { script: 'han', filter: 'variant', within: ['unicode'], query: '亻' }, { tag: 'r:unicode' }),
      totalStatement(db, { script: 'han', query: '⿰木木' }, { exact: ['⿰木木'] }),
      totalStatement(db, { script: 'han', query: '⿰木木', also: ['⿱木木', '⿰木水'] }, { exact: ['⿰木木', '⿱木木', '⿰木水'] }),
    ].map(statement => statement as unknown as { sql: string; values: unknown[] })
    for (const { sql, values } of [...statements, { sql: WORD_SIZE, values: ['w:亻'] }, { sql: exactSize(1), values: ['⿰木木'] }, { sql: exactSize(3), values: ['⿰木木', '⿱木木', '⿰木水'] }]) {
      const details = plan(sql, values)
      // Counting records once uses a temporary tree, over the capped range alone; nothing is sorted or grouped.
      expect(details.join('\n')).not.toMatch(/TEMP B-TREE FOR (ORDER BY|GROUP BY)/)
      expect(details.filter(detail => /TEMP B-TREE/.test(detail))).toEqual(details.filter(detail => detail === 'USE TEMP B-TREE FOR count(DISTINCT)'))
      // Every table is searched by key; the one scan is of the capped range read just above it.
      for (const detail of details) expect(detail).not.toMatch(/^SCAN (?!d$|\(subquery-\d+\)$)/)
    }
  })
})
