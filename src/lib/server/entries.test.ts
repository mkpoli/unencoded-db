import { authorSuggestions } from './authors'
import { containerSuggestions } from './containers'
import { hashHex } from './image'
import { copyOfSource, copyPage, matchingCopies } from './digitized-copies'
import { sourceMatches, sourceMatchParams, editSourceAlias, sourceAliases, suggestSources } from './source-aliases'
import { publicPublisher, publisherDirectory, publisherSuggestions } from './publishers'
import { beforeEach, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { isDescription, rateFormsOfPart } from 'ids-input'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { TAG_IMPLY_DEPTH_MAX, TAG_TYPES, arrangeTags, canImply, cleanTag, implicationClosure, localized, tagLabels } from '$lib/tags'
import { MOVE_RECORDS_MAX, MOVES_PER_HOUR, changesStatement, tagChanges, createTag, deleteTag, ensureTags, implicationsStatement, implyTag, latestChangeStatement, moveSizeStatement, recentMovesStatement, refileStatements, renameTag, moveTag, tagList, tagsStatement, taxonomy, undoTagChange, unimplyTag, createGroup, deleteGroup, moveGroup, renameGroup, groupsStatement, mergeTag, aliasTag, unaliasTag, aliasesStatement, nameTier } from './tags'
import { newClaim, readClaims, type Claim } from '$lib/claims'
import { ORDER, type Order } from '$lib/order'
import { standing } from '$lib/radicals'
import { decadeOf } from '$lib/dates'
import { recordCode } from '$lib/code'
import { readDates, sightingDates } from './date-readings'
import { type Via, evidenceOrder, addSighting, moveSighting, getSighting, claimedBy, counts, countsStatement, creatorCounts, creatorCountsStatement, createEntry, cursorOf, pageCount, pageCursor, pageOf, PAGES_MAX, PAGED_MAX, customScripts, customScriptsStatement, facetTag, editEntry, editSighting, entryFieldsOf, exportPage, getEntry, history, list, listStatement, mediaVisible, mergeEntry, mergedInto, readBoxes, redactRevision, readEntryFields, readSightingFields, refresh, restoreSighting, revertEntry, SEARCH_WINDOW, searchTotal, TOTAL_READ, totalStatement, wordSize, searchProblem, alsoSearchIds, alsoSearchParts, PART_ALSO_MAX, searchParts, ALSO_MAX, earliestSighting, CHRONICLE_PAGE, chronicleBackStatement, chroniclePlace, chronicleStatement, chronology, decadeCountsStatement, parseSourceCursor, radicalCounts, radicalCountsStatement, shuffleRanges, sourceList, sourcePage, SOURCES_PAGE, setHidden, SightingLimitError, terms, unmergeEntry, searchFound, foundStatement, type EntryFields, type SightingFields, type StoredImage } from './entries'
import { PAGE, PAGE_SIZES, pageSizeOf } from '$lib/order'
import { joinAtlas, createPerson, personOf, startSession } from './people'
import { openTestDb } from './testdb'

const fields = (over: Partial<EntryFields> = {}): EntryFields => ({ script: 'han', script_other: null, description: null, radical: null, strokes: null, claims: [], ...over })
const claim = (kind: Claim['kind'], value: string, data: Claim['data'] = null, links: Partial<Pick<Claim, 'sightings' | 'under'>> = {}): Claim => newClaim(kind, value, data, links)
const described = (...sequences: string[]) => fields({ claims: sequences.map(sequence => claim('ids', sequence)) })
const relation = (character: string, relationship: string, difference = '', evidence = ''): Claim => claim('relation', character, { relationship, ...(difference ? { difference } : {}), ...(evidence ? { evidence } : {}) })
// A source is found among the sightings that passed through it by the index of the chain, never by a scan.
const VIA_SEARCH = /SEARCH v USING (COVERING )?INDEX sighting_vias_by_source \(source_id=\?\)/
const via = (over: Partial<Via>): Via => ({ url: null, title: null, author: null, publisher: null, report_date: null, container: null, source_kind: null, quote: null, ...over })
const seen = (over: Partial<SightingFields> = {}): SightingFields => ({ place: 'A shop sign in Tainan', url: null, title: null, author: null, publisher: null, report_date: null, container: null, source_kind: null, vias: [], closeness: null, original_date: null, page: null, contexts: null, style: null, types: null, quotes: null, note: null, ...over })
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
  test('the four forms of 率 in a compound survive a record round trip', async () => {
    const choices = rateFormsOfPart('𳅀')
    const sequences = choices.map(choice => '⿰木' + choice.text)
    expect(new Set(sequences).size).toBe(4)
    const form = new FormData()
    for (const sequence of sequences) {
      expect(isDescription(sequence)).toBe(true)
      form.append('ids', sequence)
    }
    const { fields: values, error } = readEntryFields(form, [])
    expect(error).toBeNull()
    const id = await createEntry(db, values, seen(), [], who)
    const record = await getEntry(db, id)
    expect(record?.claims.filter(claim => claim.kind === 'ids').map(claim => claim.value)).toEqual(sequences)
  })

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
  test('a complete IDS finds the descriptions that hold it, not components or prose', async () => {
    const exact = await createEntry(db, described('⿰木木'), seen(), [], who)
    const stacked = await createEntry(db, described('⿱木木'), seen(), [], who)
    const water = await createEntry(db, described('⿰木水'), seen(), [], who)
    await createEntry(db, fields({ description: '⿰木木' }), seen(), [], who)
    expect((await list(db, { query: '⿰ 木 木' }))!.tiles.map(tile => tile.id)).toEqual([exact])
    // A structure left open finds every description that fills it.
    expect((await list(db, { query: '⿰木', order: 'old' }))!.tiles.map(tile => tile.id)).toEqual([exact, water])
    expect((await list(db, { query: '⿰？水' }))!.tiles.map(tile => tile.id)).toEqual([water])
    expect((await list(db, { query: '⿱', order: 'old' }))!.tiles.map(tile => tile.id)).toEqual([stacked])
    const inside = await createEntry(db, described('⿱艹⿰木木'), seen(), [], who)
    expect((await list(db, { query: '⿰木木', order: 'old' }))!.tiles.map(tile => tile.id)).toEqual([exact, inside])
    expect((await list(db, { query: '⿱艹⿰？木' }))!.tiles.map(tile => tile.id)).toEqual([inside])
    expect((await list(db, { query: 'UD艹' }))!.tiles.map(tile => tile.id)).toEqual([inside])
    expect((await list(db, { query: 'OUP' }))!.tiles).toEqual([])
    await editEntry(db, inside, 1, described('⿱艹木'), who, null)
    expect((await list(db, { query: '⿰木木' }))!.tiles.map(tile => tile.id)).toEqual([exact])
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

  test('a description search pages through bounded candidates without skipping', async () => {
    const n = SEARCH_WINDOW * 2 + 10
    raw.prepare(`WITH RECURSIVE seq(x) AS (VALUES(1) UNION ALL SELECT x+1 FROM seq WHERE x < ?)
      INSERT INTO entries(id, script, ids, created_by, created_at, updated_at)
      SELECT x, 'han', CASE WHEN x IN (1, 2, 300, 520) THEN '⿰木木' ELSE '⿱木木' END, ?, '2026', '2026' FROM seq`).run(n, who.actor)
    raw.exec("INSERT INTO claims(entry_id, position, key, kind, value) SELECT id, 0, printf('ids%05d', id), 'ids', ids FROM entries")
    raw.exec("INSERT INTO entry_tags(tag, entry_id) SELECT 'all', id FROM entries")
    raw.exec("INSERT INTO entry_tags(tag, entry_id) SELECT 'p:' || ids, id FROM entries")
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
    expect(await list(db, { query: '... 、' })).toBeNull()
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
    expect((await mergeEntry(db, b, a, who, null)).ok).toBe(true)
    expect((await getEntry(db, a))!.sightings).toHaveLength(2)
    expect((await list(db, {}))!.tiles.map(tile => tile.id)).toEqual([a])
    expect(await counts(db)).toMatchObject({ all: 1 })
    expect(await unmergeEntry(db, b, who)).toBe(true)
    expect((await getEntry(db, a))!.sightings).toHaveLength(1)
    expect((await getEntry(db, b))!.sightings).toHaveLength(1)
    expect((await list(db, {}))!.tiles.map(tile => tile.id)).toEqual([b, a])
  })

  test('merging joins the claims, and undoing gives each record back its own claims and pictures', async () => {
    const b = await createEntry(db, fields({ claims: [claim('ids', '⿱木木'), claim('encoding', 'U+5D20', { charset: 'unicode' })] }), seen({ place: 'two' }), [], who)
    const a = await createEntry(db, fields({ claims: [claim('ids', '⿰木木'), claim('reading', 'tung'), relation('林', 'variant', 'a stroke')] }), seen({ place: 'one' }), [{ ...image, image_key: 'a.jpg', thumb_key: 'a-t.jpg', box: '[[1,2,10,10]]' }], who)
    const claimsOf = async (id: number) => (await getEntry(db, id))!.claims
    const [aClaims, bClaims] = [await claimsOf(a), await claimsOf(b)]
    await mergeEntry(db, a, b, who, null)
    expect(await claimsOf(a)).toEqual(aClaims)
    expect(await claimsOf(b)).toEqual([...bClaims, ...aClaims])
    const merged = (await getEntry(db, b))!
    expect(merged.sightings.map(item => item.media.map(picture => picture.image_key))).toEqual([[], ['a.jpg']])
    expect(merged.entry).toMatchObject({ cover_key: 'a-t.jpg', cover_place: 'one', sightings: 2 })
    expect(merged.sightings[1].media[0].box).toBe('[[1,2,10,10]]')
    expect((await claimedBy(db, 'ids', '⿰木木')).map(row => row.id)).toEqual([b])
    expect((await list(db, { query: 'tung' }))!.tiles.map(tile => tile.id)).toEqual([b])
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

  test('a duplicate saved twice merges into one record whose claims rest on both sightings', async () => {
    const meaning = claim('meaning', 'a fish'), reading = claim('reading', 'sou', { doculect: 'ja' }, { under: [meaning.key] })
    const twice = () => fields({ radical: null, claims: [claim('ids', '⿱赤相'), { ...reading, sightings: [1] }, { ...meaning, sightings: [1] }] })
    const a = await createEntry(db, { ...twice(), radical: '赤' }, seen({ place: 'post' }), [], who)
    const b = await createEntry(db, twice(), seen({ place: 'post' }), [image], who)
    const [first, second] = [(await getEntry(db, a))!.sightings[0].id, (await getEntry(db, b))!.sightings[0].id]
    expect(await mergeEntry(db, b, a, who, 'saved twice')).toEqual({ ok: true })
    const merged = (await getEntry(db, a))!
    expect(merged.entry).toMatchObject({ rev: 2, sightings: 2, cover_key: 't.webp', radical: '赤' })
    expect(merged.claims.map(({ kind, value, sightings, under }) => ({ kind, value, sightings, under }))).toEqual([
      { kind: 'ids', value: '⿱赤相', sightings: [], under: [] },
      { kind: 'reading', value: 'sou', sightings: [first, second], under: [meaning.key] },
      { kind: 'meaning', value: 'a fish', sightings: [first, second], under: [] },
    ])
    const [row] = await history(db, a)
    expect(row).toMatchObject({ kind: 'merge', rev: 2, summary: 'saved twice' })
    expect(JSON.parse(row.snapshot)).toMatchObject({ from: b, added: [], scoped: [], filled: [] })
    expect(entryFieldsOf(row.snapshot)!.claims).toEqual(merged.claims)
    expect(await unmergeEntry(db, b, who)).toBe(true)
    const parted = (await getEntry(db, a))!
    expect(parted.entry).toMatchObject({ rev: 3, sightings: 1, cover_key: null })
    expect(parted.claims.map(item => item.sightings)).toEqual([[], [first], [first]])
    expect((await getEntry(db, b))!.claims.map(item => item.sightings)).toEqual([[], [second], [second]])
  })

  test('undoing a merge takes back what the duplicate filled in and leaves later work', async () => {
    const a = await createEntry(db, fields({ claims: [claim('ids', '⿰木木')] }), seen({ place: 'one' }), [], who)
    const b = await createEntry(db, fields({ radical: '木', strokes: 8, claims: [claim('ids', '⿰木木'), claim('reading', 'rin')] }), seen({ place: 'two' }), [], who)
    await mergeEntry(db, b, a, who, null)
    const merged = (await getEntry(db, a))!
    expect(merged.entry).toMatchObject({ radical: '木', strokes: 8 })
    const kept = merged.sightings.find(sighting => sighting.place === 'one')!.id
    await editEntry(db, a, merged.entry.rev, { ...fields(), radical: '木', strokes: 9, claims: [...merged.claims.map(item => item.kind === 'reading' ? { ...item, sightings: [kept] } : item), claim('meaning', 'grove')] }, who, null)
    expect(await unmergeEntry(db, b, who)).toBe(true)
    const parted = (await getEntry(db, a))!
    expect(parted.entry).toMatchObject({ radical: null, strokes: 9 })
    expect(parted.claims.map(item => [item.kind, item.value])).toEqual([['ids', '⿰木木'], ['reading', 'rin'], ['meaning', 'grove']])
    expect((await getEntry(db, b))!.entry).toMatchObject({ radical: '木', strokes: 8, merged_into: null })
  })

  test('a merge drops the relations between the two records, and undoing it gives them back', async () => {
    const a = await createEntry(db, fields({ claims: [claim('ids', '⿰氵秀')] }), seen({ place: 'one' }), [], who)
    const b = await createEntry(db, fields({ claims: [claim('ids', '⿰氵秀'), relation('衛', 'variant'), relation(recordCode(a), 'unifiable')] }), seen({ place: 'two' }), [], who)
    const meaning = claim('meaning', '= 衛')
    await editEntry(db, a, 1, fields({ claims: [claim('ids', '⿰氵秀'), meaning, relation('衛', 'variant'), { ...relation(recordCode(b), 'variant'), under: [meaning.key] }] }), who, null)
    expect(await mergeEntry(db, b, a, who, null)).toEqual({ ok: true })
    const merged = (await getEntry(db, a))!
    expect(merged.claims.map(item => [item.kind, item.value])).toEqual([['ids', '⿰氵秀'], ['meaning', '= 衛'], ['relation', '衛']])
    expect(merged.entry.status).toBe('variant')
    expect(await unmergeEntry(db, b, who)).toBe(true)
    const parted = (await getEntry(db, a))!
    expect(parted.claims.map(item => [item.kind, item.value, item.under])).toEqual([['ids', '⿰氵秀', []], ['meaning', '= 衛', []], ['relation', '衛', []], ['relation', recordCode(b), [meaning.key]]])
    expect((await getEntry(db, b))!.claims.map(item => item.value)).toEqual(['⿰氵秀', '衛', recordCode(a)])
  })

  test('a relation a merge dropped comes back after the merge is redacted, on the evidence the record still holds', async () => {
    const a = await createEntry(db, fields({ claims: [claim('ids', '⿰氵秀')] }), seen({ place: 'one' }), [], who)
    const b = await createEntry(db, fields({ claims: [claim('ids', '⿰氵秀')] }), seen({ place: 'two' }), [], who)
    const d = await createEntry(db, fields({ claims: [claim('ids', '⿱木木')] }), seen({ place: 'three' }), [], who)
    const kept = (await addSighting(db, a, seen({ place: 'four' }), [], who))!
    const first = (await getEntry(db, a))!
    const moving = first.sightings.find(sighting => sighting.place === 'one')!.id
    await editEntry(db, a, first.entry.rev, fields({ claims: [claim('ids', '⿰氵秀'), { ...relation(recordCode(b), 'variant', 'one stroke more'), sightings: [moving, kept] }] }), who, null)
    expect(await mergeEntry(db, b, a, who, null)).toEqual({ ok: true })
    const merged = (await getEntry(db, a))!
    expect(merged.claims.map(item => item.kind)).toEqual(['ids'])
    const sighting = merged.sightings.find(item => item.id === moving)!
    expect(await moveSighting(db, a, moving, sighting.rev, d, who, null)).toBe('done')
    const merge = (await history(db, a)).find(row => row.kind === 'merge')!
    expect(await redactRevision(db, a, merge.id, who, null)).toBe(true)
    expect(await unmergeEntry(db, b, who)).toBe(true)
    expect((await getEntry(db, a))!.claims.filter(item => item.kind === 'relation').map(item => [item.value, item.data?.difference, item.sightings])).toEqual([[recordCode(b), 'one stroke more', [kept]]])
  })

  test('a merge drops the relations to records merged into either of the two before', async () => {
    const a = await createEntry(db, fields({ claims: [claim('ids', '⿰氵秀')] }), seen({ place: 'one' }), [], who)
    const b = await createEntry(db, fields({ claims: [claim('ids', '⿰氵秀')] }), seen({ place: 'two' }), [], who)
    const c = await createEntry(db, fields({ claims: [claim('ids', '⿰氵秀')] }), seen({ place: 'three' }), [], who)
    const first = (await getEntry(db, a))!
    await editEntry(db, a, first.entry.rev, fields({ claims: [claim('ids', '⿰氵秀'), relation(recordCode(c), 'unifiable'), relation('衛', 'variant')] }), who, null)
    expect(await mergeEntry(db, c, b, who, null)).toEqual({ ok: true })
    expect(await mergeEntry(db, b, a, who, null)).toEqual({ ok: true })
    expect((await getEntry(db, a))!.claims.map(item => item.value)).toEqual(['⿰氵秀', '衛'])
  })

  test('a hidden record keeps its duplicates, and a redacted merge can still be undone', async () => {
    const a = await createEntry(db, fields({ claims: [claim('ids', '⿰木木')] }), seen({ place: 'one' }), [], who)
    const b = await createEntry(db, fields({ radical: '木', claims: [claim('ids', '⿰木木'), claim('reading', 'rin')] }), seen({ place: 'two' }), [image], who)
    await mergeEntry(db, b, a, who, null)
    await setHidden(db, { entry: a }, true, who, null)
    expect(await unmergeEntry(db, b, who)).toBe(false)
    expect(await mediaVisible(db, 'a.webp')).toBe(false)
    await setHidden(db, { entry: a }, false, who, null)
    const merged = (await getEntry(db, a))!
    await editEntry(db, a, merged.entry.rev, { ...fields(), radical: '木', claims: merged.claims }, who, null)
    const merge = (await history(db, a)).find(row => row.kind === 'merge')!
    expect(await redactRevision(db, a, merge.id, who, null)).toBe(true)
    const redacted = (await history(db, a)).find(row => row.id === merge.id)!
    expect(JSON.parse(redacted.snapshot)).toMatchObject({ from: b, filled: ['radical'] })
    expect(entryFieldsOf(redacted.snapshot)).toBeNull()
    expect(await unmergeEntry(db, b, who)).toBe(true)
    const parted = (await getEntry(db, a))!
    expect(parted.entry.radical).toBeNull()
    expect(parted.claims.map(item => item.kind)).toEqual(['ids'])
  })

  test('a claim two duplicates gave stays until the last of them parts', async () => {
    const a = await createEntry(db, fields({ claims: [claim('ids', '⿰木木')] }), seen({ place: 'a' }), [], who)
    const b = await createEntry(db, fields({ claims: [claim('reading', 'rin')] }), seen({ place: 'b' }), [], who)
    const c = await createEntry(db, fields({ claims: [claim('reading', 'rin')] }), seen({ place: 'c' }), [], who)
    await mergeEntry(db, b, a, who, null)
    await mergeEntry(db, c, a, who, null)
    const kinds = async () => (await getEntry(db, a))!.claims.map(item => item.kind)
    expect(await unmergeEntry(db, b, who)).toBe(true)
    expect(await kinds()).toEqual(['ids', 'reading'])
    expect(await unmergeEntry(db, c, who)).toBe(true)
    expect(await kinds()).toEqual(['ids'])
  })

  test('a chain of merges parts one link at a time with everything that link brought', async () => {
    const [a, b, c] = [await createEntry(db, fields(), seen({ place: 'a' }), [], who), await createEntry(db, fields(), seen({ place: 'b' }), [], who), await createEntry(db, fields(), seen({ place: 'c' }), [], who)]
    await mergeEntry(db, c, b, who, null)
    await mergeEntry(db, b, a, who, null)
    expect((await getEntry(db, a))!.sightings.map(sighting => sighting.place)).toEqual(['a', 'b', 'c'])
    expect(await mergedInto(db, a)).toEqual([b])
    expect(await unmergeEntry(db, c, who)).toBe(false)
    expect(await unmergeEntry(db, b, who)).toBe(true)
    expect((await getEntry(db, a))!.sightings.map(sighting => sighting.place)).toEqual(['a'])
    expect((await getEntry(db, b))!.sightings.map(sighting => sighting.place)).toEqual(['b', 'c'])
    expect(await unmergeEntry(db, c, who)).toBe(true)
    expect((await getEntry(db, c))!.sightings.map(sighting => sighting.place)).toEqual(['c'])
  })

  test('a record cannot merge into itself, into a later record, or into a merged record', async () => {
    const a = await createEntry(db, fields(), seen(), [], who)
    const b = await createEntry(db, fields(), seen(), [], who)
    const c = await createEntry(db, fields(), seen(), [], who)
    expect(await mergeEntry(db, a, a, who, null)).toEqual({ ok: false, code: 'self' })
    expect(await mergeEntry(db, a, b, who, null)).toEqual({ ok: false, code: 'order' })
    expect((await getEntry(db, a))!.entry.merged_into).toBeNull()
    expect((await mergeEntry(db, b, a, who, null)).ok).toBe(true)
    expect(await mergeEntry(db, c, b, who, null)).toEqual({ ok: false, code: 'missing' })
  })

  test('the database guards record code permanence and merge direction directly', async () => {
    const a = await createEntry(db, fields(), seen(), [], who)
    const b = await createEntry(db, fields(), seen(), [], who)
    expect(() => raw.run('DELETE FROM entries WHERE id = ?', [b])).toThrow('entries cannot be deleted')
    for (const column of ['id', 'rowid', '_rowid_', 'oid']) {
      expect(() => raw.run(`UPDATE entries SET ${column} = 999 WHERE id = ?`, [b])).toThrow('entry id cannot change')
    }
    raw.exec('PRAGMA recursive_triggers = OFF')
    for (const column of ['id', 'rowid']) {
      expect(() => raw.run(`INSERT OR REPLACE INTO entries(${column}, script, created_by, created_at, updated_at) VALUES (?, 'han', ?, '2026', '2026')`, [b, who.actor])).toThrow('entries cannot be replaced')
    }
    for (const badId of [0, -1]) {
      expect(() => raw.run("INSERT INTO entries(id, script, created_by, created_at, updated_at) VALUES (?, 'han', ?, '2026', '2026')", [badId, who.actor])).toThrow('entry id must be positive')
    }
    expect(() => raw.run('UPDATE entries SET merged_into = ? WHERE id = ?', [a, a])).toThrow('a record can only merge into an earlier record')
    expect(() => raw.run('UPDATE entries SET merged_into = ? WHERE id = ?', [b, a])).toThrow('a record can only merge into an earlier record')
    expect(() => raw.run("INSERT INTO entries(id, script, merged_into, created_by, created_at, updated_at) VALUES (10, 'han', 10, ?, '2026', '2026')", [who.actor])).toThrow('a record can only merge into an earlier record')
    expect(() => raw.run("INSERT INTO entries(script, merged_into, created_by, created_at, updated_at) VALUES ('han', 999, ?, '2026', '2026')", [who.actor])).toThrow('a record can only merge into an earlier record')
    // Valid inserts with an auto-assigned or unused explicit id and merges into an earlier record succeed.
    expect(() => raw.run("INSERT INTO entries(script, merged_into, created_by, created_at, updated_at) VALUES ('han', ?, ?, '2026', '2026')", [a, who.actor])).not.toThrow()
    expect(() => raw.run("INSERT INTO entries(id, script, merged_into, created_by, created_at, updated_at) VALUES (20, 'han', ?, ?, '2026', '2026')", [a, who.actor])).not.toThrow()
    expect((await getEntry(db, a))!.entry.id).toBe(a)
    expect((await getEntry(db, b))!.entry.id).toBe(b)
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

test('a sighting keeps every context checked, in the order of the list', () => {
  const form = new FormData()
  for (const context of ['heading', 'running_text', 'heading', 'unknown']) form.append('contexts', context)
  expect(readSightingFields(form).contexts).toBe(JSON.stringify(['running_text', 'heading']))
  expect(readSightingFields(new FormData()).contexts).toBeNull()
})

test('a sighting keeps one closeness of the list, and the table refuses any other', async () => {
  const form = new FormData()
  form.set('closeness', 'secondary_cited')
  expect(readSightingFields(form).closeness).toBe('secondary_cited')
  form.set('closeness', 'tertiary')
  expect(readSightingFields(form).closeness).toBeNull()
  expect(readSightingFields(new FormData()).closeness).toBeNull()
  const id = await createEntry(db, fields(), seen({ closeness: 'memory' }), [], who)
  const sighting = (await getEntry(db, id))!.sightings[0]
  expect(sighting.closeness).toBe('memory')
  expect(JSON.parse((await history(db, id)).find(row => row.kind === 'sighting')!.snapshot).closeness).toBe('memory')
  expect(await editSighting(db, sighting.id, 1, seen({ closeness: 'primary' }), null, who, null, id)).toMatchObject({ ok: true })
  expect((await getEntry(db, id))!.sightings[0].closeness).toBe('primary')
  expect(() => raw.run("UPDATE sightings SET closeness = 'tertiary' WHERE id = ?", [sighting.id])).toThrow(/CHECK/)
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

  test('a record is listed under each person it names as the maker of its character', async () => {
    const counted = () => raw.query("SELECT tag, n FROM tag_counts WHERE tag GLOB 'm:*' AND n > 0 ORDER BY tag").all()
    const id = await createEntry(db, fields({ claims: [claim('ids', '⿻十〇'), claim('creator', '陸貫一')] }), seen(), [], who)
    const other = await createEntry(db, fields({ claims: [claim('ids', '⿴囗五'), claim('creator', '陸貫一'), claim('creator', '薛德炯')] }), seen(), [], who)
    await createEntry(db, fields({ claims: [claim('ids', '⿰山東')] }), seen({ author: '陸貫一' }), [], who)
    expect(counted()).toEqual([{ tag: 'm:薛德炯', n: 1 }, { tag: 'm:陸貫一', n: 2 }])
    expect(await creatorCounts(db)).toEqual([{ name: '陸貫一', n: 2 }, { name: '薛德炯', n: 1 }])
    expect((await list(db, { creator: '陸貫一' }))!.tiles.map(tile => tile.id).sort()).toEqual([id, other])
    expect((await list(db, { creator: '薛德炯', script: 'han' }))!.tiles.map(tile => tile.id)).toEqual([other])
    expect((await list(db, { creator: '無名氏' }))!.tiles).toEqual([])
    expect(await list(db, { creator: '陸|貫一' })).toBeNull()
    expect((raw.query((countsStatement(db) as unknown as { sql: string }).sql).all() as { tag: string }[]).filter(row => row.tag.startsWith('m:'))).toEqual([])
    const found = (await getEntry(db, other))!
    await editEntry(db, other, found.entry.rev, fields({ claims: found.claims.filter(item => item.value !== '陸貫一') }), who, null)
    expect(counted()).toEqual([{ tag: 'm:薛德炯', n: 1 }, { tag: 'm:陸貫一', n: 1 }])
  })

  test('the makers are one range of the counts', () => {
    const statement = creatorCountsStatement(db) as unknown as { sql: string; values: unknown[] }
    const details = (raw.query(`EXPLAIN QUERY PLAN ${statement.sql}`).all(...(statement.values as never[])) as { detail: string }[]).map(row => row.detail).join('\n')
    expect(details).toMatch(/SEARCH tag_counts USING PRIMARY KEY \(tag>\? AND tag<\?\)/)
    expect(details).not.toMatch(/SCAN tag_counts/)
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
  const shapes: Parameters<typeof listStatement>[1][] = [{}, { script: 'han' }, { filter: 'encoded' }, { filter: 'ids' }, { script: 'han', filter: 'variant' }, { script: 'han', filter: 'source' }, { query: '亻' }, { query: '⿰木木' }, { script: 'han', filter: 'ids', query: '⿰木木' }, { query: '亻 木 水 火 土' }, { query: '艹時', also: ['艹日寺', '蒔'] }, { script: 'han', filter: 'ids', order: 'new', query: '艹時', also: ['艹日寺'] }, { script: 'han', filter: 'ids', query: '亻 word' }, { facet: 't:hakka' }, { facet: 't:IRG' }, { radical: '口' }, { decade: '1930' }, { decade: '1930', order: 'earliest', after: '1935.4' }, { decade: '1930', script: 'han', query: '亻' }, { radical: '儿兄克', script: 'han', filter: 'variant', facet: 't:hakka', query: '亻' }, { radical: '儿兄克', order: 'most' }, { script: 'han', filter: 'variant', facet: 'c:ids-db' }, { facet: 't:hakka', query: '亻' }, { facet: 'c:ids-db', query: '⿰木木' }, { without: ['zitools'] }, { script: 'han', within: ['unicode'], without: ['zitools', 'mj'] }, { script: 'han', filter: 'variant', facet: 't:hakka', without: ['zitools'], query: '亻' }, ...(['new', 'old', 'fewest', 'earliest', 'latest'] as const).flatMap(order => [{ order }, { order, filter: 'variant', after: order === 'new' || order === 'old' ? '5' : '1.5' }, { order, script: 'han', within: ['unicode'], query: '亻' }]), { order: 'random', seed: 7 }, { order: 'random', seed: 7, filter: 'variant', after: '3' }, { order: 'random', seed: 7, script: 'han', within: ['unicode'], query: '亻' }]
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

  test('a description search reads the row of its structure by key', () => {
    const statement = listStatement(db, { query: '⿰木木' }) as unknown as { sql: string; values: unknown[] }
    expect(statement.values[0]).toBe('p:⿰木木')
    expect(plan(statement.sql, statement.values).join('\n')).toMatch(/SEARCH w USING (COVERING INDEX|PRIMARY KEY)[^\n]*\((tag=\? AND entry_id=\?|entry_id=\? AND tag=\?)\)/)
  })

  test('a description search with other spellings reads the row of each by key', () => {
    const statement = listStatement(db, { query: '⿰木木', also: ['⿱木木', '⿰木水'] }) as unknown as { sql: string; values: unknown[] }
    expect(statement.values.slice(0, 3)).toEqual(['p:⿰木木', 'p:⿱木木', 'p:⿰木水'])
    const details = plan(statement.sql, statement.values).join('\n')
    expect(details).toMatch(/SEARCH w USING (COVERING INDEX|PRIMARY KEY)[^\n]*\((tag=\? AND entry_id=\?|entry_id=\? AND tag=\?)\)/)
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
    // claims, then the source itself (a lookup by key), then a direct and a via read of rows and pictures,
    // unseen named cites, then the chains of the listed sightings.
    expect(plans).toHaveLength(8)
    plans.splice(1, 1)
    expect(plans[0]).toMatch(/SEARCH k USING COVERING INDEX claims_by_value \(kind=\? AND value=\?\)/)
    expect(plans[1]).toMatch(/SEARCH s USING INDEX sightings_by_source \(source_id=\?\)/)
    expect(plans[2]).toMatch(/SEARCH s USING INDEX sightings_by_source \(source_id=\?\)/)
    expect(plans[3]).toMatch(VIA_SEARCH)
    expect(plans[4]).toMatch(VIA_SEARCH)
    expect(plans[5]).toMatch(/SEARCH sc USING INDEX sighting_cites_by_source \(source_id=\?\)/)
    expect(plans[6]).toMatch(/SEARCH v USING PRIMARY KEY \(sighting_id=\?\)/)
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

describe('records a search finds', () => {
  test('each tag or spelling is read newest first on its own, with no sort of the rows read', async () => {
    const ids = []
    for (const value of ['⿱艹時', '⿰氵蒔', '⿱艹⿰日寺', '⿰木口', '⿱艹時']) ids.push(await createEntry(db, fields({ claims: [newClaim('ids', value)] }), seen(), [], who))
    await setHidden(db, { entry: ids[4] }, true, who, null)
    expect(await searchFound(db, { query: '艹時', also: ['艹日寺', '蒔'] }, 5)).toEqual([ids[2], ids[1], ids[0]])
    expect(await searchFound(db, { query: '⿱艹時', also: ['⿱艹⿰日寺'] }, 5)).toEqual([ids[2], ids[0]])
    const ranges = [{ words: ['w:口', 'p:口'] }, { words: ['p:⿱艹時', 'p:⿱艹⿰日寺'] }, { tag: 'w:口' }, { words: ['p:⿰木口'] }] as const
    for (const from of ranges) {
      const statement = foundStatement(db, { query: '口' }, from as never, 5) as unknown as { sql: string; values: unknown[] }
      const details = (raw.query(`EXPLAIN QUERY PLAN ${statement.sql}`).all(...(statement.values as never[])) as { detail: string }[]).map(row => row.detail)
      // Each tag or spelling is read along its index; only the few records found are sorted, after the reads.
      const reads = details.includes('SCAN d') ? details.slice(0, details.indexOf('SCAN d')) : details
      expect(reads.join('\n')).not.toMatch(/TEMP B-TREE/)
      expect(details.join('\n')).not.toMatch(/SCAN (entry_tags|claims)/)
    }
  })
})

test('a tag change by an agent shows the person it works for, with the agent and model', async () => {
  const person = await createPerson(db)
  const agent = await createPerson(db)
  raw.query("UPDATE people SET name = 'Owner' WHERE id = ?").run(person.id)
  raw.query("UPDATE people SET name = 'Claude Code', agent = 1, agent_model = 'Opus 5.5', merged_into = ? WHERE id = ?").run(person.id, agent.id)
  expect(await createTag(db, await tagList(db), { name: '族名', type: 'domain', implies: [] }, { actor: agent.id, ip: null })).toMatchObject({ ok: true })
  await createTag(db, await tagList(db), { name: '物理', type: 'domain', implies: [] }, who)
  const changes = await tagChanges(db)
  expect(changes.find(change => change.name === '族名')).toMatchObject({ by_id: person.id, by_name: 'Owner', by_agent: 'Claude Code', by_model: 'Opus 5.5' })
  expect(changes.find(change => change.name === '物理')).toMatchObject({ by_id: who.actor, by_agent: null, by_model: null })
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
    const grouped = arrangeTags(all, [])
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
    expect(await moveTag(db, await listed(), [], { name: 'extra', type: 'meta' }, who)).toEqual({ ok: true })
    expect(await row('extra')).toMatchObject({ type: 'meta' })
    expect(await renameTag(db, await listed(), { name: 'extra', label: '別名' }, who)).toEqual({ ok: true })
    expect(tagLabels(await listed()).get('extra')).toBe('別名')
    expect(cleanTag('別名', await listed())).toBe('extra')
    // Duplicate label or name collision refused.
    expect(await renameTag(db, await listed(), { name: 't0', label: '別名' }, who)).toEqual({ ok: false, code: 'exists' })
    expect(await moveTag(db, await listed(), [], { name: 'extra', type: 'bogus' }, who)).toEqual({ ok: false, code: 'invalid' })
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
    await moveTag(spy, await listed(), [], { name: '乙', type: 'meta' }, who)
    await implyTag(spy, await listed(), { name: '乙', target: 'dialect' }, who)
    await unimplyTag(spy, await listed(), { name: '乙', target: '甲' }, who)
    await deleteTag(spy, await listed(), { name: '丙' }, who)
    await undoTagChange(spy, await taxonomy(db), latest(), who)
    const grouped = await createGroup(spy, (await taxonomy(db)).groups, { type: 'form', label: '組' }, who)
    if (!grouped.ok) throw new Error('group not made')
    await moveTag(spy, await listed(), (await taxonomy(db)).groups, { name: 'nom', group: grouped.id, index: 0 }, who)
    await renameGroup(spy, (await taxonomy(db)).groups, { id: grouped.id, label: '組二' }, who)
    await moveGroup(spy, (await taxonomy(db)).groups, { id: grouped.id, type: 'meta' }, who)
    await moveTag(spy, await listed(), (await taxonomy(db)).groups, { name: 'nom', type: 'form', group: null }, who)
    await deleteGroup(spy, (await taxonomy(db)).groups, { id: grouped.id }, who)
    await made('丁', 'meta', ['乙'])
    await mergeTag(spy, await listed(), { name: '丁', into: '乙' }, who)
    await undoTagChange(spy, await taxonomy(db), latest(), who)
    await aliasTag(spy, await listed(), { name: '乙', alias: '乙別' }, who)
    await unaliasTag(spy, await listed(), [], { alias: '乙別' }, who)
    await nameTier(spy, await taxonomy(db), { subject: 'tag', name: '乙', locale: 'en', label: 'B' }, who)
    const filedRecord = await createEntry(spy, fields({ claims: [claim('tag', '乙')] }), seen(), [], who)
    await editEntry(spy, filedRecord, 1, fields({ claims: [claim('tag', 'music')] }), who, null)
    expect(sent.length).toBeGreaterThan(12)
    for (const statement of sent.filter(statement => /tags|tag_groups|tag_aliases|tag_implications|'t:'/.test(statement.sql))) {
      expect(`${statement.sql}: ${plan(statement)}`).not.toMatch(/claims_by_value \(kind=\?\)|AUTOMATIC|TEMP B-TREE FOR (ORDER BY|DISTINCT)|SCAN (tags|tag_groups|tag_aliases|tag_implications|tag_counts|claims|entries|entry_tags|people|cl|e|t|c)\b/)
    }

    const reads: [string, string, RegExp][] = [
      ['list', plan(tagsStatement(db)), /SCAN c USING INDEX tags_by_type[\s\S]*SEARCH t USING PRIMARY KEY \(tag=\?\)/],
      ['used', plan(tagsStatement(db, true)), /SEARCH t USING PRIMARY KEY \(tag=\?\)[\s\S]*SEARCH claims USING COVERING INDEX claims_by_value \(kind=\? AND value=\?\)/],
      ['implications', plan(implicationsStatement(db)), /: SCAN tag_implications$/],
      ['groups', plan(groupsStatement(db)), /SCAN tag_groups USING INDEX tag_groups_by_type/],
      ['aliases', plan(aliasesStatement(db)), /SCAN tag_aliases USING COVERING INDEX tag_aliases_by_tag/],
      ['move size', plan(moveSizeStatement(db, '甲')), /SEARCH tag_counts USING PRIMARY KEY \(tag=\?\)/],
      ['recent moves', plan(recentMovesStatement(db, who.actor, '2026')), /SEARCH tag_changes USING (COVERING )?INDEX tag_changes_by_actor \(actor=\?/],
      ['latest change', plan(latestChangeStatement(db, '甲')), /SEARCH tag_changes USING COVERING INDEX tag_changes_by_name \(subject=\? AND name=\?\)/],
      ['changes', plan(changesStatement(db)), /SCAN c[\s\S]*SEARCH p USING INDEX sqlite_autoindex_people_1 \(id=\?\)[\s\S]*SEARCH m USING INDEX sqlite_autoindex_people_1 \(id=\?\)/],
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
      expect(`${name}: ${details}`).not.toMatch(/AUTOMATIC|TEMP B-TREE FOR (ORDER BY|DISTINCT)|SCAN (tags|tag_counts|claims|entries|entry_tags|people|cl|e|t|m)\b/)
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
    expect(await moveTag(db, stale, [], { name: 'C', type: 'meta' }, who)).toEqual({ ok: false, code: 'conflict' })
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
    expect(await undoTagChange(db, await taxonomy(db), implyId, who)).toEqual({ ok: true })
    expect(await row('L1')).toMatchObject({ implies: [] })
  })

  test('undoing create, rename, retype, imply, unimply and delete restores tags and tag_counts cleanly, and change ids never repeat', async () => {
    await made('甲', 'domain')
    await made('乙', 'form', ['甲'])
    await createEntry(db, fields({ claims: [claim('tag', '乙')] }), seen({ report_date: '1850' }), [], who)
    const before = everything()

    expect(await moveTag(db, await listed(), [], { name: '乙', type: 'meta' }, who)).toEqual({ ok: true })
    expect(await undoTagChange(db, await taxonomy(db), latest(), who)).toEqual({ ok: true })
    expect([tagsOf(1), countOf('t:甲')]).toEqual([['t:乙', 't:甲'], 1])

    expect(await unimplyTag(db, await listed(), { name: '乙', target: '甲' }, who)).toEqual({ ok: true })
    expect([tagsOf(1), countOf('t:甲')]).toEqual([['t:乙'], 0])
    expect(await undoTagChange(db, await taxonomy(db), latest(), who)).toEqual({ ok: true })
    expect([tagsOf(1), countOf('t:甲')]).toEqual([['t:乙', 't:甲'], 1])

    // Only the latest change of a tag can be undone.
    await renameTag(db, await listed(), { name: '乙', label: '乙改' }, who)
    const staleId = latest() - 1
    expect(await undoTagChange(db, await taxonomy(db), staleId, who)).toEqual({ ok: false, code: 'conflict' })
    expect(await undoTagChange(db, await taxonomy(db), latest(), who)).toEqual({ ok: true })
    expect(await row('乙')).toMatchObject({ label: '乙', type: 'form', implies: ['甲'] })

    // Unused tag create/delete roundtrip.
    await made('丙', 'meta', ['乙'])
    const createId = latest()
    expect(await undoTagChange(db, await taxonomy(db), createId, who)).toEqual({ ok: true })
    expect(await row('丙')).toBeUndefined()
    expect(await undoTagChange(db, await taxonomy(db), latest(), who)).toEqual({ ok: true })
    expect(await row('丙')).toMatchObject({ type: 'meta', implies: ['乙'] })

    // Deleting a tag log row cannot make a stale rev succeed.
    const zStale = await listed()
    expect(await renameTag(db, await listed(), { name: '丙', label: '丙新' }, who)).toEqual({ ok: true })
    raw.run('DELETE FROM tag_changes WHERE id = ?', [latest()])
    expect(await renameTag(db, zStale, { name: '丙', label: '丙錯' }, who)).toEqual({ ok: false, code: 'conflict' })
    expect(before[0]).toBeDefined()
  })

  test('groups hold tags in order within a type, carry them to another type, and every change undoes', async () => {
    const state = () => taxonomy(db)
    const shelfOf = async (type: string, group: number | null) => (await listed()).filter(tag => tag.type === type && tag.group === group).sort((a, b) => a.position - b.position).map(tag => tag.name)
    const made1 = await createGroup(db, (await state()).groups, { type: 'form', label: '俗字' }, who)
    const made2 = await createGroup(db, (await state()).groups, { type: 'form', label: '簡化字' }, who)
    if (!made1.ok || !made2.ok) throw new Error('groups not made')
    expect(await createGroup(db, (await state()).groups, { type: 'form', label: '俗字' }, who)).toEqual({ ok: false, code: 'exists' })
    expect(await createGroup(db, (await state()).groups, { type: 'bogus', label: '甲' }, who)).toEqual({ ok: false, code: 'invalid' })
    expect((await state()).groups.map(group => [group.label, group.position])).toEqual([['俗字', 0], ['簡化字', 1]])

    // A tag made in a group takes the group's type; tags placed by index keep their neighbours in order.
    const { tags, groups } = await state()
    expect(await createTag(db, tags, { name: '方俗字', type: 'meta', group: made1.id }, who, groups)).toMatchObject({ ok: true })
    expect(await row('方俗字')).toMatchObject({ type: 'form', group: made1.id })
    expect(await moveTag(db, await listed(), groups, { name: 'abbreviation', group: made2.id }, who)).toEqual({ ok: true })
    expect(await moveTag(db, await listed(), groups, { name: 'simplified-cn', group: made2.id, index: 0 }, who)).toEqual({ ok: true })
    expect(await moveTag(db, await listed(), groups, { name: 'ryakuji', group: made2.id, index: 1 }, who)).toEqual({ ok: true })
    expect(await shelfOf('form', made2.id)).toEqual(['simplified-cn', 'ryakuji', 'abbreviation'])
    // A group of another type, or a missing one, is refused.
    expect(await moveTag(db, await listed(), groups, { name: 'hakka', type: 'language', group: made2.id }, who)).toEqual({ ok: false, code: 'invalid' })
    expect(await moveTag(db, await listed(), groups, { name: 'hakka', group: 999 }, who)).toEqual({ ok: false, code: 'target' })
    // A stale read is refused and changes nothing.
    const stale = await listed()
    expect(await moveTag(db, stale, groups, { name: 'ryakuji', group: made2.id, index: 0 }, who)).toEqual({ ok: true })
    const settled = everything()
    expect(await moveTag(db, stale, groups, { name: 'ryakuji', group: null, type: 'meta' }, who)).toEqual({ ok: false, code: 'conflict' })
    expect(everything()).toEqual(settled)
    expect(await undoTagChange(db, await state(), latest(), who)).toEqual({ ok: true })
    expect(await shelfOf('form', made2.id)).toEqual(['simplified-cn', 'ryakuji', 'abbreviation'])

    // Moving a group to another type takes its tags there, without touching how records are filed.
    const id = await createEntry(db, fields({ claims: [claim('tag', 'simplified-cn')] }), seen(), [], who)
    const filedBefore = tagsOf(id)
    const moved = (await state()).groups.find(group => group.id === made2.id)!
    expect(await moveGroup(db, (await state()).groups, { id: made2.id, type: 'meta', index: 0, rev: moved.rev }, who)).toEqual({ ok: true })
    expect((await listed()).filter(tag => tag.group === made2.id).map(tag => tag.type)).toEqual(['meta', 'meta', 'meta'])
    expect(tagsOf(id)).toEqual(filedBefore)
    expect(await moveGroup(db, (await state()).groups, { id: made2.id, type: 'form', rev: moved.rev }, who)).toEqual({ ok: false, code: 'conflict' })
    expect(await undoTagChange(db, await state(), latest(), who)).toEqual({ ok: true })
    expect((await listed()).filter(tag => tag.group === made2.id).map(tag => tag.type)).toEqual(['form', 'form', 'form'])
    expect((await state()).groups.map(group => [group.label, group.type, group.position])).toEqual([['俗字', 'form', 0], ['簡化字', 'form', 1]])

    // Renaming, deleting and their undoing; a group that holds tags stays.
    expect(await renameGroup(db, (await state()).groups, { id: made1.id, label: '簡化字' }, who)).toEqual({ ok: false, code: 'exists' })
    expect(await renameGroup(db, (await state()).groups, { id: made1.id, label: '方俗' }, who)).toEqual({ ok: true })
    expect(await undoTagChange(db, await state(), latest(), who)).toEqual({ ok: true })
    expect((await state()).groups.find(group => group.id === made1.id)?.label).toBe('俗字')
    expect(await deleteGroup(db, (await state()).groups, { id: made1.id }, who)).toEqual({ ok: false, code: 'used' })
    expect(await moveTag(db, await listed(), (await state()).groups, { name: '方俗字', type: 'form', group: null }, who)).toEqual({ ok: true })
    expect(await deleteGroup(db, (await state()).groups, { id: made1.id }, who)).toEqual({ ok: true })
    expect((await state()).groups.map(group => group.label)).toEqual(['簡化字'])
    expect(await undoTagChange(db, await state(), latest(), who)).toEqual({ ok: true })
    expect((await state()).groups.map(group => [group.id, group.label, group.position])).toEqual([[made1.id, '俗字', 0], [made2.id, '簡化字', 1]])
    // Two moves from one read cannot interleave; a deleted tag comes back to its place.
    const read = await listed()
    expect(await moveTag(db, read, (await state()).groups, { name: 'ryakuji', group: made2.id, index: 2 }, who)).toEqual({ ok: true })
    const moved2 = everything()
    expect(await moveTag(db, read, (await state()).groups, { name: 'simplified-cn', group: made2.id, index: 2 }, who)).toEqual({ ok: false, code: 'conflict' })
    expect(everything()).toEqual(moved2)
    expect(await undoTagChange(db, await state(), latest(), who)).toEqual({ ok: true })
    await made('臨字', 'form')
    expect(await moveTag(db, await listed(), (await state()).groups, { name: '臨字', group: made2.id, index: 1 }, who)).toEqual({ ok: true })
    const placed = await shelfOf('form', made2.id)
    expect(await deleteTag(db, await listed(), { name: '臨字' }, who)).toEqual({ ok: true })
    expect(await undoTagChange(db, await state(), latest(), who)).toEqual({ ok: true })
    expect(await shelfOf('form', made2.id)).toEqual(placed)
    expect(await deleteTag(db, await listed(), { name: '臨字' }, who)).toEqual({ ok: true })
    // A deleted group's id is not handed out again, so undoing a move into it does not land in a newer group.
    const spare = await createGroup(db, (await state()).groups, { type: 'region', label: '臨時' }, who)
    if (!spare.ok) throw new Error('group not made')
    expect(await moveTag(db, await listed(), (await state()).groups, { name: '臺灣', group: spare.id }, who)).toEqual({ ok: true })
    expect(await moveTag(db, await listed(), (await state()).groups, { name: '臺灣', type: 'region', group: null }, who)).toEqual({ ok: true })
    const movedOut = latest()
    expect(await deleteGroup(db, (await state()).groups, { id: spare.id }, who)).toEqual({ ok: true })
    const next = await createGroup(db, (await state()).groups, { type: 'meta', label: '新' }, who)
    expect(next).toMatchObject({ ok: true })
    expect(next.ok && next.id).not.toBe(spare.id)
    expect(await undoTagChange(db, await state(), movedOut, who)).toEqual({ ok: true })
    expect(await row('臺灣')).toMatchObject({ type: 'region', group: null })
    const created = (raw.query("SELECT id FROM tag_changes WHERE subject = 'group' AND name = ? AND kind = 'create'").get(String(made2.id)) as { id: number }).id
    expect(await undoTagChange(db, await state(), created, who)).toEqual({ ok: false, code: 'conflict' })

    // The tiers read back in order: groups first, then the tags in none.
    const form = arrangeTags(await listed(), (await state()).groups).find(section => section.type === 'form')!
    expect(form.shelves.map(shelf => [shelf.group?.label ?? null, shelf.tags.length])).toEqual([['簡化字', 3], [null, form.shelves.at(-1)!.tags.length]])
    expect(arrangeTags(await listed(), (await state()).groups, { every: true }).find(section => section.type === 'form')!.shelves.map(shelf => shelf.group?.label ?? null)).toEqual(['俗字', '簡化字', null])
  })

  test('merging files a tag\'s records under another, keeps its name as an alias, and undoes back to the tag it was', async () => {
    await made('布依字', 'general', ['dialect'])
    await made('布依方塊字', 'general')
    await made('壯字', 'general', ['布依字'])
    const direct = await createEntry(db, fields({ claims: [claim('tag', '布依字')] }), seen(), [], who)
    const carried = await createEntry(db, fields({ claims: [claim('tag', '壯字')] }), seen(), [], who)
    const other = await createEntry(db, fields({ claims: [claim('tag', '布依方塊字')] }), seen(), [], who)
    const before = everything()
    expect(tagsOf(direct)).toEqual(['t:dialect', 't:布依字'])

    expect(await mergeTag(db, await listed(), { name: '布依字', into: '布依方塊字' }, who)).toEqual({ ok: true })
    expect(await row('布依字')).toBeUndefined()
    expect(await row('布依方塊字')).toMatchObject({ implies: ['dialect'], aliases: ['布依字'], n: 3 })
    expect(await row('壯字')).toMatchObject({ implies: ['布依方塊字'] })
    // Claims stay as written; the records are filed under the tag the alias stands for.
    expect((await getEntry(db, direct))!.claims.map(c => c.value)).toEqual(['布依字'])
    expect(tagsOf(direct)).toEqual(['t:dialect', 't:布依方塊字'])
    expect(tagsOf(carried)).toEqual(['t:dialect', 't:壯字', 't:布依方塊字'])
    expect(tagsOf(other)).toEqual(['t:dialect', 't:布依方塊字'])
    expect(countOf('t:布依字')).toBe(0)
    expect(raw.query("SELECT count(*) AS n FROM tag_counts WHERE tag = 't:布依字'").get()).toEqual({ n: 0 })
    // The alias resolves wherever a name is typed or shown, and an edit or refresh files the same way.
    expect(cleanTag('布依字', await listed())).toBe('布依方塊字')
    expect(tagLabels(await listed()).get('布依字')).toBe('布依方塊字')
    expect(implicationClosure(['布依字'], await listed()).all).toEqual(['布依方塊字', 'dialect'])
    const merged = filed()
    await refreshAll()
    expect(filed()).toEqual(merged)
    await ensureTags(db, ['布依字'], who)
    expect(await row('布依字')).toBeUndefined()
    // A name taken by an alias is refused as a label or a new alias; the tag holding aliases stays.
    expect(await renameTag(db, await listed(), { name: '壯字', label: '布依字' }, who)).toEqual({ ok: false, code: 'aliased' })
    expect(await aliasTag(db, await listed(), { name: '壯字', alias: '布依字' }, who)).toEqual({ ok: false, code: 'aliased' })
    expect(await aliasTag(db, await listed(), { name: '壯字', alias: '布依方塊字' }, who)).toEqual({ ok: false, code: 'exists' })
    expect(await deleteTag(db, await listed(), { name: '布依方塊字' }, who)).toEqual({ ok: false, code: 'used' })

    // Undo brings the tag back with its implications, and every row as it was.
    expect(await undoTagChange(db, await taxonomy(db), latest(), who)).toEqual({ ok: true })
    const undone = everything()
    const shape = (rows: unknown[]) => (rows as { name: string; label: string; type: string; group_id: number | null; position: number }[]).map(({ name, label, type, group_id, position }) => ({ name, label, type, group_id, position }))
    expect([shape(undone[0]), undone[1], undone[3], undone[4]]).toEqual([shape(before[0]), before[1], before[3], before[4]])
    expect(await row('布依字')).toMatchObject({ implies: ['dialect'], aliases: [] })
    expect(await row('布依方塊字')).toMatchObject({ implies: [], aliases: [] })
    expect(await row('壯字')).toMatchObject({ implies: ['布依字'] })
    // Undoing that split merges again.
    expect(await undoTagChange(db, await taxonomy(db), latest(), who)).toEqual({ ok: true })
    expect(await row('布依方塊字')).toMatchObject({ aliases: ['布依字'] })
  })

  test('a merge refused for any reason changes nothing, refiles records whose implication could not move, and never closes a cycle', async () => {
    // A stale read of the target is refused before anything is stamped.
    await made('甲A'); await made('乙B')
    const stale = await listed()
    expect(await renameTag(db, await listed(), { name: '乙B', label: '乙B改' }, who)).toEqual({ ok: true })
    const settled = everything()
    expect(await mergeTag(db, stale, { name: '甲A', into: '乙B' }, who)).toEqual({ ok: false, code: 'conflict' })
    expect(everything()).toEqual(settled)
    expect(await renameTag(db, stale, { name: '甲A', label: '甲A改' }, who)).toEqual({ ok: true })
    expect(await row('甲A')).toMatchObject({ label: '甲A改' })

    // B → C → A: C's link to A cannot become C → B, yet C's records leave A.
    await made('A'); await made('C', 'general', ['A']); await made('B', 'general', ['C'])
    const id = await createEntry(db, fields({ claims: [claim('tag', 'C')] }), seen(), [], who)
    expect(tagsOf(id)).toEqual(['t:A', 't:C'])
    expect(await mergeTag(db, await listed(), { name: 'A', into: 'B' }, who)).toEqual({ ok: true })
    expect(tagsOf(id)).toEqual(['t:C'])
    expect(countOf('t:A')).toBe(0)
    const merged = filed()
    await refreshAll()
    expect(filed()).toEqual(merged)

    // A → X read before X → Y is added elsewhere: merging A into Y would close Y → X → Y, so it is refused.
    await made('X'); await made('Y'); await made('Q', 'general', ['X'])
    const read = await listed()
    expect(await implyTag(db, await listed(), { name: 'X', target: 'Y' }, who)).toEqual({ ok: true })
    const before = everything()
    expect(await mergeTag(db, read, { name: 'Q', into: 'Y' }, who)).toEqual({ ok: false, code: 'conflict' })
    expect(everything()).toEqual(before)
  })

  test('an alias given to a tag finds it, and taking it off leaves the records that name it a tag of their own', async () => {
    await made('俗字', 'form')
    expect(await aliasTag(db, await listed(), { name: '俗字', alias: '#俗體字' }, who)).toEqual({ ok: true })
    expect(await row('俗字')).toMatchObject({ aliases: ['俗體字'] })
    expect(cleanTag('俗體字', await listed())).toBe('俗字')
    expect(await aliasTag(db, await listed(), { name: '俗字', alias: 'a b' }, who)).toEqual({ ok: false, code: 'invalid' })
    // A record written through the API with the alias is filed under the tag.
    const id = await createEntry(db, fields({ claims: [claim('tag', '俗體字')] }), seen(), [], who)
    expect(tagsOf(id)).toEqual(['t:俗字'])
    expect(await row('俗體字')).toBeUndefined()
    // In use, taking the alias off makes it a tag again in the same place; unused, it just goes.
    expect(await unaliasTag(db, await listed(), [], { alias: '俗體字' }, who)).toEqual({ ok: true })
    expect(await row('俗體字')).toMatchObject({ type: 'form', aliases: [], n: 1 })
    expect(tagsOf(id)).toEqual(['t:俗體字'])
    expect(countOf('t:俗字')).toBe(0)
    expect(await aliasTag(db, await listed(), { name: '俗字', alias: '俗書' }, who)).toEqual({ ok: true })
    expect(await unaliasTag(db, await listed(), [], { alias: '俗書' }, who)).toEqual({ ok: true })
    expect(await row('俗書')).toBeUndefined()
    expect(await undoTagChange(db, await taxonomy(db), latest(), who)).toEqual({ ok: true })
    expect(await row('俗字')).toMatchObject({ aliases: ['俗書'] })
    expect(await undoTagChange(db, await taxonomy(db), latest(), who)).toEqual({ ok: true })
    expect(await row('俗字')).toMatchObject({ aliases: [] })
    expect(await unaliasTag(db, await listed(), [], { alias: '俗書' }, who)).toEqual({ ok: false, code: 'missing' })
  })

  test('a tag or a group is named in each language, shown there, found by it, and kept through delete and merge', async () => {
    await made('方俗字', 'form')
    const name = async (locale: string, label: string, subject: 'tag' | 'group' = 'tag', key = '方俗字') => nameTier(db, await taxonomy(db), { subject, name: key, locale, label }, who)
    expect(await name('en', 'Dialect vernacular characters')).toEqual({ ok: true })
    expect(await name('ja', '方言俗字')).toEqual({ ok: true })
    expect(await name('xx', '甲')).toEqual({ ok: false, code: 'invalid' })
    expect(await row('方俗字')).toMatchObject({ label: '方俗字', names: { en: 'Dialect vernacular characters', ja: '方言俗字' } })
    expect(localized(await listed(), 'ja').find(tag => tag.name === '方俗字')?.label).toBe('方言俗字')
    expect(localized(await listed(), 'ko').find(tag => tag.name === '方俗字')?.label).toBe('方俗字')
    expect(cleanTag('方言俗字', await listed())).toBe('方俗字')
    // A name in a language never takes over another tag's alias.
    await made('簡字', 'form')
    expect(await aliasTag(db, await listed(), { name: '簡字', alias: 'jianzi' }, who)).toEqual({ ok: true })
    await made('甲字', 'form')
    expect(await name('en', 'jianzi', 'tag', '甲字')).toEqual({ ok: true })
    expect(cleanTag('jianzi', await listed())).toBe('簡字')
    // An empty name takes it off; undo puts it back.
    expect(await name('ja', '')).toEqual({ ok: true })
    expect((await row('方俗字'))?.names).toEqual({ en: 'Dialect vernacular characters' })
    expect(await undoTagChange(db, await taxonomy(db), latest(), who)).toEqual({ ok: true })
    expect((await row('方俗字'))?.names).toEqual({ en: 'Dialect vernacular characters', ja: '方言俗字' })
    // A stale write is refused.
    const stale = await taxonomy(db)
    expect(await name('ko', '방속자')).toEqual({ ok: true })
    expect(await nameTier(db, stale, { subject: 'tag', name: '方俗字', locale: 'vi', label: 'x', rev: stale.tags.find(tag => tag.name === '方俗字')!.rev }, who)).toEqual({ ok: false, code: 'conflict' })
    // Delete and merge keep the names for undoing.
    await made('土俗字', 'form')
    expect(await name('en', 'Local vernacular', 'tag', '土俗字')).toEqual({ ok: true })
    expect(await deleteTag(db, await listed(), { name: '土俗字' }, who)).toEqual({ ok: true })
    expect(await undoTagChange(db, await taxonomy(db), latest(), who)).toEqual({ ok: true })
    expect((await row('土俗字'))?.names).toEqual({ en: 'Local vernacular' })
    expect(await mergeTag(db, await listed(), { name: '土俗字', into: '方俗字' }, who)).toEqual({ ok: true })
    expect(await undoTagChange(db, await taxonomy(db), latest(), who)).toEqual({ ok: true })
    expect((await row('土俗字'))?.names).toEqual({ en: 'Local vernacular' })
    // Groups too.
    const group = await createGroup(db, (await taxonomy(db)).groups, { type: 'form', label: '俗字' }, who)
    if (!group.ok) throw new Error('group not made')
    expect(await name('en', 'Vernacular forms', 'group', String(group.id))).toEqual({ ok: true })
    expect((await taxonomy(db)).groups.find(item => item.id === group.id)?.names).toEqual({ en: 'Vernacular forms' })
    expect(await deleteGroup(db, (await taxonomy(db)).groups, { id: group.id }, who)).toEqual({ ok: true })
    expect(await undoTagChange(db, await taxonomy(db), latest(), who)).toEqual({ ok: true })
    expect((await taxonomy(db)).groups.find(item => item.id === group.id)?.names).toEqual({ en: 'Vernacular forms' })
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

  test('a record from before the common era comes first, under its own decade, and the reindex files it the same', async () => {
    const made: number[] = []
    for (const date of ['-168', '前1年', '前169年', '西元前160年', '206 BCE']) made.push(await createEntry(db, fields(), seen({ title: 'Silk text', report_date: '1997', original_date: date }), [], who))
    const page = await chronology(db, chroniclePlace(null, null, null)!)
    const order = [4, 2, 0, 3, 1].map(i => made[i])
    expect(page.entries.slice(0, 6).map(entry => [entry.year, entry.tile.id])).toEqual([[-205, order[0]], [-168, order[1]], [-167, order[2]], [-159, order[3]], [0, order[4]], [1803, 1]])
    expect(page.entries[2]).toMatchObject({ tile: { firstYear: '-167', firstYearKind: 'original' }, sighting: { date: '-168' } })
    expect(page.decades.slice(0, 4)).toEqual([{ decade: -208, n: 1 }, { decade: -168, n: 3 }, { decade: -8, n: 1 }, { decade: 1800, n: 1 }])
    expect((await chronology(db, chroniclePlace(null, null, '-168')!)).entries[0].tile.id).toBe(order[1])
    const back = await chronology(db, chroniclePlace(null, `1803.1`, null)!)
    expect(back.entries.map(entry => entry.tile.id)).toEqual(order)
    expect(back.later).toBe('at=1803.1')
    expect((await chronology(db, chroniclePlace(`-159.${order[3]}`, null, null)!)).earlier).toBe(`before=-159.${order[3]}`)
    // The list read by year goes on from a year before the common era, and keeps to its decade.
    const first = await list(db, { order: 'earliest', limit: 3 })
    expect(first!.tiles.map(tile => tile.id)).toEqual(order.slice(0, 3))
    expect(first!.next).toBe(`-167.${order[2]}`)
    expect((await list(db, { order: 'earliest', limit: 2, after: first!.next }))!.tiles.map(tile => tile.id)).toEqual(order.slice(3))
    expect((await list(db, { order: 'latest', decade: '-168' }))!.tiles.map(tile => tile.id)).toEqual([order[3], order[2], order[1]])
    expect(cursorOf('most', '-1.5')).toBeNull()
    // Sources published before the common era lead the gallery read by date.
    for (const date of ['前168年', '前1年', '005年']) await createEntry(db, fields(), seen({ title: `Cast ${date}`, report_date: date }), [], who)
    const titles = async (cursor: string | null) => (await sourceList(db, 'earliest', cursor === null ? null : parseSourceCursor('earliest', cursor)))!.sources.map(source => source.title)
    expect((await titles(null)).slice(0, 4)).toEqual(['Cast 前168年', 'Cast 前1年', 'Cast 005年', 'Silk text'])
    const held = raw.query("SELECT id FROM sources WHERE title = 'Cast 前168年'").get() as { id: number }
    expect((await titles(`-167.${held.id}`))[0]).toBe('Cast 前1年')
    expect((await chronology(db, chroniclePlace(null, null, '0')!)).entries[0]).toMatchObject({ year: 5 })
    const filed = () => raw.query("SELECT tag, entry_id, year FROM entry_tags WHERE entry_id IN (SELECT value FROM json_each(?)) AND tag GLOB 'y:*' ORDER BY entry_id").all(JSON.stringify(made))
    const years = () => raw.query('SELECT id, first_year, first_year_kind, first_sighting FROM entries WHERE id IN (SELECT value FROM json_each(?)) ORDER BY id').all(JSON.stringify(made))
    const before = [filed(), years()]
    raw.exec("UPDATE entries SET first_year = NULL, first_year_kind = NULL, first_sighting = NULL; UPDATE entry_tags SET year = NULL WHERE tag = 'all'; DELETE FROM entry_tags WHERE tag GLOB 'y:*'")
    raw.exec(readFileSync(new URL('../../../scripts/reindex-dates.sql', import.meta.url), 'utf8'))
    expect([filed(), years()]).toEqual(before)
  })

  test('the reindex counts decades as decadeOf does', () => {
    const sql = /CASE WHEN year > 0 [^)]*\) \/ 10 \* 10 END/.exec(readFileSync(new URL('../../../scripts/reindex-dates.sql', import.meta.url), 'utf8'))![0]
    const rows = raw.query(`WITH RECURSIVE y(year) AS (SELECT -2100 UNION ALL SELECT year + 1 FROM y WHERE year < 2100) SELECT year, ${sql} AS decade FROM y`).all() as { year: number; decade: number }[]
    expect(rows.filter(row => row.decade !== decadeOf(row.year))).toEqual([])
  })

  test('names the evidence that holds each year, with the date it was read from and the chain it came through', async () => {
    const id = await createEntry(db, fields(), seen({ title: 'Old print', author: 'Someone', report_date: '1999', original_date: '1935年5月', vias: [via({ title: 'A post', author: 'Poster', publisher: 'X', report_date: '2020', url: 'https://example.test/post' })] }), [], who)
    const page = await chronology(db, { at: [1935, 0] })
    expect(page.entries[0]).toMatchObject({ year: 1935, tile: { id }, sighting: { title: 'Old print', author: 'Someone', date: '1935年5月', vias: [{ title: 'A post', author: 'Poster', publisher: 'X', report_date: '2020', url: 'https://example.test/post' }] } })
  })

  test('a place is a year and a record either way, or a decade', () => {
    expect(chroniclePlace('1935.412', null, null)).toEqual({ at: [1935, 412] })
    expect(chroniclePlace(null, '1935.412', null)).toEqual({ before: [1935, 412] })
    expect(chroniclePlace(null, null, '1930')).toEqual({ at: [1930, 0] })
    expect(chroniclePlace(null, null, null)).toEqual({ at: [-10000, 0] })
    expect(chroniclePlace('-167.412', null, null)).toEqual({ at: [-167, 412] })
    expect(chroniclePlace(null, '0.412', null)).toEqual({ before: [0, 412] })
    expect(chroniclePlace(null, null, '-168')).toEqual({ at: [-168, 0] })
    expect(chroniclePlace(null, null, '0')).toEqual({ at: [1, 0] })
    for (const [at, before, from] of [['1935', null, null], ['1935.0', null, null], [null, 'x.1', null], [null, null, '1935'], [null, null, '05'], [null, null, '-160'], ['-0.1', null, null]]) expect(chroniclePlace(at, before, from)).toBeUndefined()
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
  // Within a year the last day a date can mean decides.
  expect(earliestSighting([at(1, '1921年4月11日', null), at(2, '1921年4月5日', null)])).toMatchObject({ text: '1921', sighting: { id: 2 } })
  expect(earliestSighting([at(1, '1921', null), at(2, '1921年4月', null), at(3, '1921-04-11', null)])).toMatchObject({ sighting: { id: 3 } })
  expect(earliestSighting([at(1, '1921年10月5日', null), at(2, '1921', '1921年9月')])).toMatchObject({ kind: 'original', sighting: { id: 2 } })
  // Before the common era the earlier year still comes first, and a day within it still decides.
  expect(earliestSighting([at(1, null, '前168年'), at(2, null, '前206年'), at(3, '1921', null)])).toMatchObject({ text: '-205', sighting: { id: 2 } })
  expect(earliestSighting([at(1, null, '前168年'), at(2, null, '前168年2月'), at(3, null, '-168')])).toMatchObject({ sighting: { id: 2 } })
  expect(earliestSighting([at(1, '前160年', '前168年'), at(2, '前164年', '前168年')])).toMatchObject({ sighting: { id: 1 } })
  // A work dated only to the year keeps its own date, bounded by the day of its report.
  expect(earliestSighting([at(1, '1921年4月11日', null), at(2, '1921年4月5日', '1921')])).toMatchObject({ kind: 'original', sighting: { id: 2 } })
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
  // A day earlier in the same year takes over, and the sweep's reindex names the same evidence.
  const day = (date: string) => addSighting(db, id, seen({ place: date, report_date: date }), [], who)
  await day('1750年4月11日')
  await day('1750年4月5日')
  const earlier = await addSighting(db, id, seen({ place: 'Reported', report_date: '1750年4月1日', original_date: '1750' }), [], who)
  const kind = () => raw.query('SELECT first_year_kind AS kind FROM entries WHERE id = ?').get(id)
  expect(first(id)).toBe(earlier!)
  expect(kind()).toEqual({ kind: 'original' })
  raw.exec('UPDATE entries SET first_sighting = NULL, first_year_kind = NULL')
  raw.exec(readFileSync(new URL('../../../scripts/reindex-dates.sql', import.meta.url), 'utf8'))
  expect(first(id)).toBe(earlier!)
  expect(kind()).toEqual({ kind: 'original' })
  // Before the common era too: the same year by day, and an earlier year over a later one.
  for (const date of ['前168年', '前168年3月', '前168年2月']) await day(date)
  const february = first(id)
  expect(raw.query('SELECT c.report_date AS date FROM sightings s JOIN sources c ON c.id = s.source_id WHERE s.id = ?').get(february as number)).toEqual({ date: '前168年2月' })
  raw.exec('UPDATE entries SET first_sighting = NULL, first_year_kind = NULL, first_year = NULL')
  raw.exec(readFileSync(new URL('../../../scripts/reindex-dates.sql', import.meta.url), 'utf8'))
  expect(first(id)).toBe(february)
  await day('前206年')
  const oldest = first(id)
  expect(oldest).not.toBe(february)
  raw.exec('UPDATE entries SET first_sighting = NULL, first_year_kind = NULL, first_year = NULL')
  raw.exec(readFileSync(new URL('../../../scripts/reindex-dates.sql', import.meta.url), 'utf8'))
  expect(first(id)).toBe(oldest)
  // A record with no year names none.
  const undated = await createEntry(db, fields(), seen(), [], who)
  expect(first(undated)).toBeNull()
})
test('evidence is read closest first, and only primary or unjudged evidence is dated by the work it names', async () => {
  const picture = (key: string): StoredImage => ({ ...image, image_key: `${key}.webp`, thumb_key: `${key}-t.webp` })
  const reindexSql = readFileSync(new URL('../../../scripts/reindex-dates.sql', import.meta.url), 'utf8')
  const summary = (id: number) => raw.query('SELECT first_year, first_year_kind, first_sighting, cover_key, cover_place FROM entries WHERE id = ?').get(id) as { first_year: string; first_year_kind: string; first_sighting: number; cover_key: string; cover_place: string }
  const swept = (id: number) => { raw.exec('UPDATE entries SET first_year = NULL, first_year_kind = NULL, first_sighting = NULL'); raw.exec(reindexSql); return summary(id) }
  // A write that repairs a date runs the file statement by statement, split at each semicolon.
  for (const statement of reindexSql.split(';').map(sql => sql.trim()).filter(Boolean)) raw.prepare(statement)
  const id = await createEntry(db, fields(), seen({ place: 'dictionary', closeness: 'secondary_uncited', report_date: '1994', original_date: '1606' }), [picture('dictionary')], who, [
    { fields: seen({ place: 'stele', closeness: 'primary', report_date: '2001', original_date: '1650' }), media: [picture('stele')] },
    { fields: seen({ place: 'chat', closeness: 'memory', report_date: '1400' }), media: [] },
    { fields: seen({ place: 'cited', closeness: 'secondary_cited', report_date: '1890', original_date: '1500' }), media: [] },
    { fields: seen({ place: 'sign', report_date: '2020' }), media: [picture('sign')] },
  ])
  await addSighting(db, id, seen({ place: 'undated' }), [], who)
  const order = async () => {
    const { sightings } = (await getEntry(db, id))!
    return evidenceOrder(sightings, await readDates(db, sightingDates(sightings))).map(sighting => sighting.place)
  }
  expect(await order()).toEqual(['stele', 'sign', 'undated', 'cited', 'dictionary', 'chat'])
  const place = (name: string) => (raw.query('SELECT id FROM sightings WHERE place = ?').get(name) as { id: number }).id
  // A memory reported earliest still dates the record by its report; the dictionaries' older dates do not.
  expect(summary(id)).toEqual({ first_year: '1400', first_year_kind: 'report', first_sighting: place('chat'), cover_key: 'stele-t.webp', cover_place: 'stele' })
  expect(swept(id)).toMatchObject({ first_year: '1400', first_year_kind: 'report', first_sighting: place('chat') })
  const chat = (await getEntry(db, id))!.sightings.find(sighting => sighting.place === 'chat')!
  await setHidden(db, { entry: id, sighting: chat.id }, true, who, null)
  expect(summary(id)).toMatchObject({ first_year: '1650', first_year_kind: 'original', first_sighting: place('stele') })
  expect(swept(id)).toMatchObject({ first_year: '1650', first_year_kind: 'original', first_sighting: place('stele') })
  // Unjudged again, the dictionary's own date counts.
  const dictionary = (await getEntry(db, id))!.sightings.find(sighting => sighting.place === 'dictionary')!
  expect(await editSighting(db, dictionary.id, dictionary.rev, seen({ place: 'dictionary', report_date: '1994', original_date: '1606' }), null, who, null, id)).toMatchObject({ ok: true })
  expect(summary(id)).toMatchObject({ first_year: '1606', first_year_kind: 'original', first_sighting: place('dictionary'), cover_key: 'stele-t.webp' })
  expect(swept(id)).toMatchObject({ first_year: '1606', first_sighting: place('dictionary') })
  // Of two sightings with one date, the closer holds it, though it was added later.
  const tie = await createEntry(db, fields(), seen({ place: 'unjudged', report_date: '1700' }), [picture('unjudged')], who)
  const primary = await addSighting(db, tie, seen({ place: 'original', closeness: 'primary', report_date: '1700' }), [picture('original')], who)
  expect(summary(tie)).toMatchObject({ first_year: '1700', first_sighting: primary, cover_key: 'original-t.webp', cover_place: 'original' })
  expect(swept(tie)).toMatchObject({ first_year: '1700', first_sighting: primary })
})

test('parts typed with no structure find the records that spell them another way', async () => {
  const typed = await createEntry(db, described('⿱艹時'), seen(), [], who)
  const radical = await createEntry(db, described('⿱⺾時'), seen(), [], who)
  const mate = await createEntry(db, described('⿱艸時'), seen(), [], who)
  const written = await createEntry(db, described('⿱艹⿰日寺'), seen(), [], who)
  const inside = await createEntry(db, described('⿰氵蒔'), seen(), [], who)
  await createEntry(db, described('⿱艹新'), seen(), [], who)
  await createEntry(db, described('⿰日寺'), seen(), [], who)
  const found = async (listing: Parameters<typeof list>[1]) => (await list(db, { order: 'old', ...listing }))!.tiles.map(tile => tile.id)
  // A part is found as its radical code point and as the parts counted as one with it.
  expect(await found({ query: '艹時' })).toEqual([typed, radical, mate])
  // The spellings the browser found are searched too: the parts written out, and the character they make.
  expect(await found({ query: '艹時', also: ['艹日寺', '蒔'] })).toEqual([typed, radical, mate, written, inside])
  expect(await searchTotal(db, { query: '艹時' })).toMatchObject({ n: 3, floor: false })
  expect(await searchTotal(db, { query: '艹時', also: ['艹日寺', '蒔'] })).toMatchObject({ n: 5, floor: false })
  expect(searchParts('艹時')).toEqual(['艹', '時'])
  expect(searchParts('⿱艹時')).toBeNull()
  expect(searchParts('⿱ 艹')).toBeNull()
  expect([searchProblem(''), searchProblem('⿲'), searchProblem('、'), searchProblem('一 二 三 四 五 六'), searchProblem('⿰一⿱二⿰三⿱四？ ⿰五⿱六⿰七⿱八？ ⿰九？')]).toEqual([null, null, 'noSearchTerms', 'tooManyTerms', 'tooManyTerms'])
  expect(searchParts('艹 word')).toBeNull()
  // Another spelling is parts alone, is not the query in another order, and is one of a few.
  expect(alsoSearchParts('艹時', ['時艹', '艹日寺', '艹 日 寺', '⿱艹時', 'word', '日寺艹', '蒔', '一二三四五六'])).toEqual(['艹日寺', '蒔'])
  expect(alsoSearchParts('艹時', ['一', '二', '三', '四', '五'])).toHaveLength(PART_ALSO_MAX)
  expect(alsoSearchParts('word', ['艹日寺'])).toEqual([])
  // The character the parts make finds the records that name it as a related character.
  const variant = await createEntry(db, { ...described('⿱艹寺'), claims: [...described('⿱艹寺').claims, claim('relation', '蒔', { relationship: 'variant' })] }, seen(), [], who)
  expect(await found({ query: '艹時', also: ['蒔'] })).toEqual([typed, radical, mate, inside, variant])
  // A radical code point typed is the part it stands for, and a mate is read under the row its records are kept in.
  expect(await found({ query: '⺾時' })).toEqual([typed, radical, mate])
  const flesh = await createEntry(db, described('⿰⺼木'), seen(), [], who)
  expect(await found({ query: '月木' })).toEqual([flesh])
  // A character is found written out in the strokes it is drawn from, which the browser names as another spelling.
  const strokes = await createEntry(db, described('⿲㇇丨𰛅'), seen(), [], who)
  expect(alsoSearchParts('水', ['㇇𰛅'])).toEqual(['㇇𰛅'])
  expect(await found({ query: '水', also: ['㇇𰛅'] })).toEqual([strokes])
  expect(await found({ query: '㇇' })).toEqual([strokes])
  // The widest search stays under the number of values one statement may bind.
  const widest = { script: 'han', filter: 'variant', facet: 't:hakka', radical: '口', decade: '1930', within: ['unicode', 'zitools', 'yedict', 'glyphwiki', 'mj'], without: ['unicode', 'zitools', 'yedict', 'glyphwiki', 'mj'], query: '㔾七丸儿兔', also: ['兹冃冊凷刀', '叉友另囘堇', '夂奂尒彐擧'] }
  const bound = (statement: unknown) => (statement as { values: unknown[] }).values.length
  expect(bound(listStatement(db, widest))).toBeLessThanOrEqual(100)
  expect(bound(totalStatement(db, widest, { words: Array(16).fill('p:一') }))).toBeLessThanOrEqual(100)
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
      totalStatement(db, { script: 'han', query: '亻 木' }, { words: ['w:木', 'p:木'] }),
      totalStatement(db, { script: 'han', query: 'word 木' }, { words: ['w:word'] }),
      totalStatement(db, { script: 'han', query: '艹時', also: ['艹日寺', '蒔'] }, { words: ['w:時', 'p:時', 'p:寺', 'p:蒔'] }),
      totalStatement(db, { script: 'han', filter: 'variant', within: ['unicode'], query: '亻' }, { tag: 'r:unicode' }),
      totalStatement(db, { script: 'han', query: '⿰木木' }, { words: ['p:⿰木木'] }),
      totalStatement(db, { script: 'han', query: '⿰木木', also: ['⿱木木', '⿰木水'] }, { words: ['p:⿰木木', 'p:⿱木木', 'p:⿰木水'] }),
    ].map(statement => statement as unknown as { sql: string; values: unknown[] })
    for (const { sql, values } of [...statements, { sql: wordSize(1), values: ['w:word'] }, { sql: wordSize(3), values: ['w:艹', 'p:艹', 'p:艸'] }]) {
      const details = plan(sql, values)
      // Counting records once uses a temporary tree, over the capped range alone; nothing is sorted or grouped.
      expect(details.join('\n')).not.toMatch(/TEMP B-TREE FOR (ORDER BY|GROUP BY)/)
      expect(details.filter(detail => /TEMP B-TREE/.test(detail))).toEqual(details.filter(detail => detail === 'USE TEMP B-TREE FOR count(DISTINCT)'))
      // Every table is searched by key; the one scan is of the capped range read just above it.
      for (const detail of details) expect(detail).not.toMatch(/^SCAN (?!d$|\(subquery-\d+\)$)/)
    }
  })
})

test('source names find the exact public citation, including via-only works and shared aliases', async () => {
  const citations = [via({ title: 'Dictionary', publisher: 'Press A', report_date: '1606' }), via({ title: 'Dictionary', publisher: 'Press B' })]
  const entry = await createEntry(db, fields(), seen({ ...citations[0], vias: [citations[1]] }), [], who)
  const editions = await suggestSources(db, 'dict')
  expect(editions).toHaveLength(2)
  for (const source of editions) {
    expect(await editSourceAlias(db, source.id, 'ＤＩＣ  甲', false, who.actor)).toBe(true)
    expect(await editSourceAlias(db, source.id, 'dic 甲', false, who.actor)).toBe(false)
    expect(await sourceAliases(db, source.id)).toEqual(['ＤＩＣ  甲'])
  }
  const matches = await suggestSources(db, 'dic 甲')
  expect(matches.map(s => s.id)).toEqual(editions.map(s => s.id))
  expect(matches.find(s => s.publisher === 'Press A')?.report_date).toBe('1606')
  const press = await publicPublisher(db, 'Press B')
  expect((await sourceList(db, 'earliest', null, press!.id, 'dic 甲')).sources.map(s => s.publisher)).toEqual(['Press B'])
  expect(await editSourceAlias(db, editions[0].id, 'dic 甲', true, who.actor)).toBe(true)
  expect(await suggestSources(db, 'dic 甲')).toHaveLength(1)
  await setHidden(db, { entry }, true, who, null)
  expect(await suggestSources(db, 'dict')).toEqual([])
  expect(await suggestSources(db, 'dic 甲')).toEqual([])
  expect(await editSourceAlias(db, editions[1].id, 'private', false, who.actor)).toBe(false)
})

test('the Sources page finds a source by its author, container, link and account, and the title field by its name', async () => {
  const message = via({ author: '甲（1234567）', container: '某討論羣（7654321）', publisher: 'QQ', report_date: '2026-11-17' })
  const entry = await createEntry(db, fields(), seen({ title: '某字典', author: '乙、丙', url: 'https://example.org/dict', vias: [message, via({ author: '丁（@Someone）', url: 'https://x.com/Someone/status/1' })] }), [], who)
  const found = async (query: string) => (await sourceList(db, 'new', null, null, query)).sources.map(source => source.author)
  for (const query of ['甲', '甲（1234567）', '甲(123', '1234567', '某討論', '7654321']) expect(await found(query)).toEqual(['甲（1234567）'])
  for (const query of ['乙', '丙', '某字', 'example.org/d', 'https://example.org/dict']) expect(await found(query)).toEqual(['乙、丙'])
  for (const query of ['丁', 'someone', '@someone', 'x.com/someone']) expect(await found(query)).toEqual(['丁（@Someone）'])
  // Publishers have a filter of their own, and the middle of a name finds nothing.
  for (const query of ['QQ', '討論羣', '234567']) expect(await found(query)).toEqual([])
  // Each way a source is found is a range of an index.
  const plan = (raw.query(`EXPLAIN QUERY PLAN ${sourceMatches}`).all(...sourceMatchParams('甲')) as { detail: string }[]).map(row => row.detail)
  expect(plan.some(detail => /SEARCH k USING PRIMARY KEY \(lookup>\? AND lookup<\?\)/.test(detail))).toBe(true)
  expect(plan.filter(detail => /^SCAN|TEMP B-TREE/.test(detail))).toEqual([])
  // A group's name in the title field offers none of its messages.
  for (const query of ['某討論', '7654321', '丙']) expect(await suggestSources(db, query)).toEqual([])
  await setHidden(db, { entry }, true, who, null)
  for (const query of ['甲', '7654321', '乙']) expect(await found(query)).toEqual([])
  await setHidden(db, { entry }, false, who, null)
  // The keys of a source go with it, as D1 enforces foreign keys.
  raw.exec('PRAGMA foreign_keys = ON')
  const sighting = (await getEntry(db, entry))!.sightings[0]
  await editSighting(db, sighting.id, sighting.rev, seen({ title: '某字典' }), null, who, null, entry)
  expect(raw.query('SELECT author FROM sources').all()).toEqual([{ author: null }])
  expect(raw.query('SELECT * FROM source_keys').all()).toEqual([])
})

test('a search reads the sightings of the sources on its page alone', async () => {
  const insert = raw.prepare('INSERT INTO sources(hash, title, name_lookup, records) VALUES (?, ?, ?, 1)'), key = raw.prepare("INSERT INTO source_keys(lookup, source_id) VALUES ('某討論羣', ?)")
  raw.transaction(() => { for (let id = 1; id <= 4000; id++) { insert.run(String(id), `${id}`, `${id}`); key.run(id) } })()
  const statements: { sql: string; values: unknown[] }[] = []
  const traced = { prepare(sql: string) {
    const statement = db.prepare(sql)
    return { bind(...values: unknown[]) { statements.push({ sql, values }); return statement.bind(...values) } }
  }, batch: (list: D1PreparedStatement[]) => db.batch(list) } as D1Database
  for (const sort of ['new', 'most', 'earliest'] as const) {
    statements.length = 0
    expect((await sourceList(traced, sort, null, null, '某討論羣')).sources.length).toBe(SOURCES_PAGE)
    for (const { sql, values } of statements.filter(statement => statement.sql.includes('source_keys'))) {
      const plan = (raw.query(`EXPLAIN QUERY PLAN ${sql}`).all(...(values as never[])) as { detail: string }[]).map(row => row.detail)
      const chosen = plan.findIndex(detail => /USE TEMP B-TREE FOR ORDER BY/.test(detail)), read = plan.findIndex(detail => /sightings_by_source/.test(detail))
      expect(plan[0]).toBe('MATERIALIZE page')
      expect(chosen).toBeGreaterThan(0)
      expect(chosen).toBeLessThan(read)
    }
  }
})

test('the picker pages through shared spellings by normalized name and source id', async () => {
  const insert = raw.prepare('INSERT INTO sources(hash, title, name_lookup, records) VALUES (?, ?, ?, 1)')
  for (let id = 1; id <= 30; id++) insert.run(String(id), 'École ＡＢＣ', 'école abc')
  const first = await suggestSources(db, 'École  ａ')
  expect(first).toHaveLength(25) // 24 choices and a lookahead
  const last = first[23]
  const second = await suggestSources(db, 'école a', [last.lookup, last.id])
  expect([...first.slice(0, 24), ...second].map(row => row.id)).toEqual(Array.from({ length: 30 }, (_, i) => i + 1))
  expect(await suggestSources(db, 'absent', [last.lookup, last.id])).toEqual([])
})

test('an alias follows its original citation through removal and re-use', async () => {
  const original = seen({ title: 'École　Ａ', author: 'Editor' })
  const entry = await createEntry(db, fields(), original, [], who)
  const sighting = (await getEntry(db, entry))!.sightings[0].id
  const [source] = await suggestSources(db, 'école a')
  expect(await editSourceAlias(db, source.id, 'School A', false, who.actor)).toBe(true)
  await editSighting(db, sighting, 1, seen({ title: 'Different work' }), null, who, null, entry)
  expect(await suggestSources(db, 'School')).toEqual([])
  await editSighting(db, sighting, 2, original, null, who, null, entry)
  expect((await suggestSources(db, 'School')).map(row => row.id)).toEqual([source.id])
  expect(await editSourceAlias(db, source.id, 'school a', true, who.actor)).toBe(true)
  expect(raw.query('SELECT spelling, removed, actor FROM source_alias_changes ORDER BY id').all()).toEqual(
    [0, 1].map(removed => ({ spelling: 'School A', removed, actor: who.actor })))
})

test('each citation occupies one suggestion even with many matching aliases', async () => {
  const entry = await createEntry(db, fields(), seen({ url: 'https://example.org/book' }), [], who)
  await createEntry(db, fields(), seen({ title: 'Dic Z' }), [], who)
  const [source] = await suggestSources(db, 'example.org')
  expect(source.url).toBe('https://example.org/book')
  expect((await sourceList(db, 'new', null, null, 'example.org')).sources[0].id).toBe(source.id)
  expect((await getEntry(db, entry))!.sightings[0].source_id).toBe(source.id)
  for (let i = 0; i < 26; i++) await editSourceAlias(db, source.id, `Dic ${i}`, false, who.actor)
  expect((await suggestSources(db, 'Dic')).map(row => row.title)).toEqual([null, 'Dic Z'])
})

test('source suggestions show evidence from the matching public sighting', async () => {
  const title = 'Primer'
  await createEntry(db, fields(), seen({ title, page: 'i' }), [], who)
  const illustrated = await createEntry(db, fields(), seen({ title, page: '12', vias: [via({ title: 'Reprint' })] }), [image], who)
  const preview = async (name: string) => (await suggestSources(db, name))[0]
  expect(await preview(title)).toMatchObject({ records: 2, evidence: { entry: illustrated, page: '12', thumb: image.thumb_key, via: 0 } })
  expect(await preview('Reprint')).toMatchObject({ records: 1, evidence: { entry: illustrated, thumb: image.thumb_key, via: 1 } })
  const sighting = (await getEntry(db, illustrated))!.sightings[0].id
  await setHidden(db, { entry: illustrated, sighting }, true, who, null)
  expect((await preview(title)).evidence).toMatchObject({ page: 'i', thumb: null })
  expect(await preview('Reprint')).toBeUndefined()
  await setHidden(db, { entry: illustrated, sighting }, false, who, null)
  await setHidden(db, { entry: illustrated }, true, who, null)
  expect((await preview(title)).evidence).toMatchObject({ page: 'i', thumb: null })
})

describe('digitized copy filter', () => {
  const slug = 'ntcu-848', title = '彙音字典'
  const prefix = 'http://ip194097.ntcu.edu.tw/memory/TGB/thak.asp?id=848&page='

  test('shared readings find the book, its page citations and printed editions', async () => {
    const book = await createEntry(db, fields(), seen({ title, url: prefix + '801' }), [], who)
    const print = await createEntry(db, fields(), seen({ title, publisher: 'Print' }), [], who)
    await createEntry(db, fields(), seen({ title: 'A chapter', url: prefix + '802' }), [], who)
    await createEntry(db, fields(), seen({ title: 'Another book', author: title }), [], who)
    const queries = [title, '汇音字典', 'Huiyinzidian', 'Huì-yīn Zìdiǎn', 'HUI4 YIN1 ZI4 DIAN3',
      'Huiyin Dictionary', 'Ionjiten', 'ＩＯＮ　ＪＩＴＥＮ', 'いおんじてん', 'ｲｵﾝｼﾞﾃﾝ',
      '휘음자전', '휘음자전'.normalize('NFD'), 'hwieumjajoen', 'Hwi-eum Jajeon', '《汇音字典》', 'huì yī']
    for (const q of queries) {
      const matches = await suggestSources(db, q)
      expect(matches.map(row => row.title)).toEqual([title, title])
      expect(new Set(matches.map(row => row.evidence?.entry))).toEqual(new Set([book, print]))
      // A source is found by its author as written; only a title has readings.
      expect((await sourceList(db, 'new', null, null, q)).sources.map(row => row.title)).toEqual(q === title ? ['Another book', title, title] : [title, title])
      expect((await matchingCopies(db, q)).map(copy => copy.slug)).toEqual([slug])
    }
    const [edition] = await suggestSources(db, '汇音字典')
    await editSourceAlias(db, edition.id, '汇音字典', false, who.actor)
    await editSourceAlias(db, edition.id, '汇音字典', true, who.actor)
    expect((await suggestSources(db, '汇音字典')).find(s => s.id === edition.id)).toMatchObject({
      alias: null, reading: '汇音字典', title,
    })
    for (const q of ['-', 'No such reading']) expect(await suggestSources(db, q)).toEqual([])
    await setHidden(db, { entry: book }, true, who, null)
    expect(await matchingCopies(db, 'いおんじてん')).toEqual([])
    expect((await suggestSources(db, 'ionjiten')).map(row => row.publisher)).toEqual(['Print'])
  })

  test('paging a reading keeps literal titles and returns each citation once', async () => {
    const put = raw.prepare('INSERT INTO sources(hash, title, name_lookup, records) VALUES (?, ?, ?, 1)')
    for (let i = 0; i < 30; i++) put.run(String(i), title, title)
    put.run('other', 'Hui Yin studies', 'hui yin studies')
    const all = []
    let cursor: [string, number] | null = null
    for (;;) {
      const page = await suggestSources(db, 'Hui Yin', cursor)
      all.push(...page.slice(0, 24))
      if (page.length <= 24) break
      cursor = [page[23].lookup, page[23].id]
    }
    expect(all).toHaveLength(31)
    expect(new Set(all.map(row => row.id)).size).toBe(31)
    expect(all.some(row => row.title === 'Hui Yin studies')).toBe(true)
  })

  test('both spellings find the same copy, with separate scan and recorded page', async () => {
    const one = { title, url: prefix + '801' }
    const two = { title, url: prefix.replace('http:', 'https:') + '802' }
    const entry = await createEntry(db, fields(), seen({ ...one, page: '卷二葉九', vias: [via(two)] }), [image], who)
    const sighting = (await getEntry(db, entry))!.sightings[0].id
    const original = (await copyPage(db, slug, 0))!
    const [direct, indirect] = original.sightings[0].citations
    await editSourceAlias(db, direct.source, '汇音字典', false, who.actor)
    expect(original.totals).toEqual({ sightings: 1, records: 1 })
    expect(original.sightings[0]).toMatchObject({ sighting, entry_id: entry, thumb: image.thumb_key, page: '卷二葉九' })
    expect(direct).toMatchObject({ url: one.url, scan: '801', via: 0 })
    expect(indirect).toMatchObject({ url: two.url, scan: '802', via: 1 })
    for (const text of [title, '汇音字典']) expect(await matchingCopies(db, text)).toEqual([original.copy])
    expect(await copyOfSource(db, direct.source)).toEqual(original.copy)
    expect(await copyOfSource(db, indirect.source)).toEqual(original.copy)
    for (const url of [prefix, prefix.replace('848', '849') + '801', prefix.replace('edu.tw', 'example.com') + '801', prefix + '801&x=1']) {
      await createEntry(db, fields(), seen({ title, url }), [], who)
    }
    expect((await copyPage(db, slug, 0))!.totals).toEqual(original.totals)
    await setHidden(db, { entry, sighting }, true, who, null)
    expect(await copyPage(db, slug, 0)).toBeNull()
    expect(await matchingCopies(db, title)).toEqual([])
  })

  test('new Commons page citations inherit the book alias and keep their printed locator', async () => {
    const editions = [
      ['commons-nlc-40050', '大數小數命名標準研究意見書', '大数小数命名标准研究意见书', 'NLC416-08jh009205-40050_'],
      ['commons-nlc-71313', '中等算術教科書', '中等算术教科书', 'NLC416-14jh005564-71313_'],
    ]
    for (const [slug, title, alias, file] of editions) {
      const prefix = 'https://commons.wikimedia.org/wiki/File:' + file
      const pageURL = (name: string) => prefix + name + '.pdf?page=121'
      for (const name of [title, encodeURIComponent(title)]) {
        await createEntry(db, fields(), seen({ title, url: pageURL(name), page: '104' }), [], who)
      }
      await createEntry(db, fields(), seen({ title, url: pageURL(title).replace(file, 'Other_') }), [], who)
      await createEntry(db, fields(), seen({ title: 'A chapter', url: pageURL(title) }), [], who)
      const page = (await copyPage(db, slug, 0))!
      expect(page.totals).toEqual({ sightings: 3, records: 3 })
      const matches = await suggestSources(db, alias)
      expect(matches).toHaveLength(2)
      for (const row of page.sightings.filter(row => row.page === '104')) {
        expect(row.citations[0].scan).toBe('121')
        expect(matches.some(source => source.id === row.citations[0].source)).toBe(true)
      }
      expect(await matchingCopies(db, alias)).toEqual([page.copy])
      const first = matches[0].id
      await editSourceAlias(db, first, alias, true, who.actor)
      expect(await sourceAliases(db, first)).toEqual([])
    }
  })

  test('a copy used twice as an intermediary counts once and has no printed locator of its own', async () => {
    const intermediary = via({ title, url: prefix + '803' })
    const entry = await createEntry(db, fields(), seen({ title: 'Original', page: '葉五', vias: [intermediary] }), [], who)
    const first = (await getEntry(db, entry))!.sightings[0].id
    raw.run('INSERT INTO sighting_vias(sighting_id, position, source_id) SELECT sighting_id, 1, source_id FROM sighting_vias WHERE sighting_id = ?', [first])
    const original = (await copyPage(db, slug, 0))!
    expect(original.sightings[0].citations).toHaveLength(1)
    expect(original.sightings[0].page).toBeNull()
    expect(original.sightings[0].citations[0].via).toBe(1)
    // Another 50 public sightings of this one record cross the copy page boundary.
    for (let i = 0; i < 50; i++) raw.run(`INSERT INTO sightings(entry_id,first_entry,source_id,place,created_by,created_at,updated_at)
      VALUES (?, ?, ?, 'p', ?, 'now', 'now')`, [entry, entry, original.sightings[0].citations[0].source, who.actor])
    const page = (await copyPage(db, slug, 0))!
    expect(page.totals).toEqual({ sightings: 51, records: 1 })
    expect(page.sightings).toHaveLength(50)
    const next = (await copyPage(db, slug, page.next!))!
    expect(next.cardVersion).toBe(page.cardVersion)
    expect(next.sightings).toHaveLength(1)
    expect(next.sightings[0].sighting).toBeGreaterThan(page.next!)
    expect(next.next).toBeNull()
    expect(await copyPage(db, slug, next.sightings[0].sighting)).toBeNull()
    await setHidden(db, { entry }, true, who, null)
    expect(await copyPage(db, slug, 0)).toBeNull()
  })
})

describe('personal communications', () => {
  const letter = (more: Partial<Via> = {}) => via({ author: '甲', publisher: 'QQ', report_date: '2026-11-14', source_kind: 'personal', quote: 'as told', ...more })

  test('a private message is a source of its own, apart from the same citation without the kind', async () => {
    const id = await createEntry(db, fields(), seen({ title: 'A book', vias: [letter(), letter({ source_kind: null })] }), [], who)
    const { vias } = (await getEntry(db, id))!.sightings[0]
    expect(vias.map(via => via.source_kind)).toEqual(['personal', null])
    expect(vias[0].id).not.toBe(vias[1].id)
  })

  test('a citation is keyed by its fields up to the last one given', async () => {
    const key = (author: string) => (raw.query('SELECT hash FROM sources WHERE author = ?').get(author) as { hash: string }).hash
    await createEntry(db, fields(), seen({ title: 'A book', vias: [letter({ author: 'a' }), letter({ author: 'b', source_kind: null, container: 'group' })] }), [], who)
    expect(key('a')).toBe(await hashHex(JSON.stringify([null, null, 'a', 'QQ', '2026-11-14', null, 'personal'])))
    expect(key('b')).toBe(await hashHex(JSON.stringify([null, null, 'b', 'QQ', '2026-11-14', 'group'])))
  })

  test('the form sends a kind for the source and each via, and a kind alone names no source', () => {
    const form = new FormData()
    for (const [name, value] of [['place', 'A scan'], ['author', 'x'], ['source_kind', 'personal']]) form.append(name, value)
    for (const [author, kind] of [['甲', ''], ['乙', 'personal'], ['丙', 'other'], ['', 'personal']]) { form.append('via_author', author); form.append('via_source_kind', kind) }
    const read = readSightingFields(form)
    expect(read.source_kind).toBe('personal')
    expect(read.vias.map(via => [via.author, via.source_kind])).toEqual([['甲', null], ['乙', 'personal'], ['丙', null]])
  })

  test('a kind alone stores no source', async () => {
    const form = new FormData()
    for (const [name, value] of [['place', 'A scan'], ['source_kind', 'personal']]) form.append(name, value)
    expect(readSightingFields(form).source_kind).toBeNull()
    const id = await createEntry(db, fields(), seen({ url: null, title: null, source_kind: 'personal' }), [], who)
    expect((await getEntry(db, id))!.sightings[0].source_id).toBeNull()
  })
})

describe('authors', () => {
  const message = (author: string, quote: string) => via({ author, report_date: '2026-11-17', container: '某討論羣（7654321）', publisher: 'QQ', quote })
  const labels = async (query: string) => (await authorSuggestions(db, query)).map(row => row.label)

  test('an author is offered once, by name, account or number, as the first source spells them', async () => {
    const entry = await createEntry(db, fields(), seen({ title: '某字典', author: '乙、丙', vias: [message('甲（10001）', 'one'), message('甲(10001)', 'two'), message('乙（@yi）', 'three')] }), [], who)
    for (const query of ['甲', '甲（1', '１０００', '10001']) expect(await labels(query)).toEqual(['甲（10001）'])
    for (const query of ['@Y', 'yi', '乙（@']) expect(await labels(query)).toEqual(['乙（@yi）'])
    expect(await labels('乙')).toEqual(['乙', '乙（@yi）', '乙、丙'])
    expect(await labels('丙')).toEqual(['丙'])
    // What a source appeared in, a publisher and the middle of a name are no author.
    for (const query of ['', ' ', '某討論', '7654321', 'QQ', '0001']) expect(await labels(query)).toEqual([])
    await setHidden(db, { entry }, true, who, null)
    for (const query of ['甲', 'yi', '乙']) expect(await labels(query)).toEqual([])
    await setHidden(db, { entry }, false, who, null)
    expect(await labels('yi')).toEqual(['乙（@yi）'])
  })

  test('the keys of hidden sources leave the index the walk reads', async () => {
    const insert = raw.prepare('INSERT INTO sources(hash, author, name_lookup, records) VALUES (?, ?, ?, 1)'), key = raw.prepare('INSERT INTO source_keys(lookup, source_id, author) VALUES (?, ?, 1)')
    raw.transaction(() => { for (let id = 1; id <= 2000; id++) { insert.run(String(id), `甲${id}`, `甲${id}`); key.run('甲', id) } })()
    raw.exec('UPDATE sources SET author = \'甲\' WHERE id = 2000; UPDATE sources SET records = 0 WHERE id < 2000')
    expect(raw.query('SELECT source_id FROM source_keys INDEXED BY source_keys_by_author WHERE author = 1').all()).toEqual([{ source_id: 2000 }])
    expect(await labels('甲')).toEqual(['甲'])
    raw.exec('UPDATE sources SET records = 1 WHERE id = 1')
    expect(raw.query('SELECT source_id FROM source_keys WHERE author = 1 ORDER BY source_id').all()).toEqual([{ source_id: 1 }, { source_id: 2000 }])
  })

  test('each step of the walk is a seek in the author keys', async () => {
    const insert = raw.prepare('INSERT INTO sources(hash, author, name_lookup, records) VALUES (?, ?, ?, 1)'), key = raw.prepare('INSERT INTO source_keys(lookup, source_id, author) VALUES (?, ?, ?)')
    raw.transaction(() => { for (let id = 1; id <= 2000; id++) { insert.run(String(id), `甲${id % 40}`, `甲${id % 40}`); key.run(`甲${id % 40}`, id, 1); key.run('甲羣', id, 0) } })()
    const statements: { sql: string; values: unknown[] }[] = []
    const traced = { prepare(sql: string) {
      const statement = db.prepare(sql)
      return { bind(...values: unknown[]) { statements.push({ sql, values }); return statement.bind(...values) } }
    } } as D1Database
    expect(await authorSuggestions(traced, '甲')).toHaveLength(25)
    const [{ sql, values }] = statements
    const plan = (raw.query(`EXPLAIN QUERY PLAN ${sql}`).all(...(values as never[])) as { detail: string }[]).map(row => row.detail)
    expect(plan.filter(detail => /USING (COVERING )?INDEX source_keys_by_author/.test(detail)).length).toBe(3)
    expect(plan.filter(detail => /^SCAN (?!(keys|k)$)|TEMP B-TREE/.test(detail))).toEqual([])
  })
})

describe('containers', () => {
  const message = (author: string, report_date: string, quote: string) => via({ author, report_date, container: 'zi.tools討論羣', publisher: 'QQ', quote })

  test('each message in a group is its own source and the group is suggested once', async () => {
    const first = await createEntry(db, fields(), seen({ title: 'A book', vias: [message('玄晖allen', '2026-11-18', 'one')] }), [], who)
    await createEntry(db, fields(), seen({ title: 'Another book', vias: [message('雲九', '2026-11-17', 'two')] }), [], who)
    await createEntry(db, fields(), seen({ title: 'An article', container: '中國語文 1955年第3期' }), [], who)
    const [link] = (await getEntry(db, first))!.sightings[0].vias
    expect(link).toMatchObject({ title: null, author: '玄晖allen', report_date: '2026-11-18', container: 'zi.tools討論羣', publisher: 'QQ', quote: 'one' })
    const messages = raw.query("SELECT author, report_date FROM sources WHERE container_lookup = 'zi.tools討論羣' ORDER BY id").all()
    expect(messages).toEqual([{ author: '玄晖allen', report_date: '2026-11-18' }, { author: '雲九', report_date: '2026-11-17' }])
    expect(await containerSuggestions(db, '')).toEqual([{ label: 'zi.tools討論羣', publisher: 'QQ' }, { label: '中國語文 1955年第3期', publisher: null }])
    expect(await containerSuggestions(db, 'ZI.')).toEqual([{ label: 'zi.tools討論羣', publisher: 'QQ' }])
    expect(await containerSuggestions(db, '羣')).toEqual([])
  })

  test('a group named only by hidden records is not suggested', async () => {
    const id = await createEntry(db, fields(), seen({ title: 'A book', vias: [message('貓村', '2026-11-14', 'one')] }), [], who)
    expect(await containerSuggestions(db, 'zi')).toHaveLength(1)
    raw.exec('UPDATE sources SET records = 0')
    expect(await containerSuggestions(db, 'zi')).toEqual([])
    expect(id).toBeGreaterThan(0)
  })

  test('two messages one person sent to a group on one day are two links', () => {
    const form = new FormData()
    for (const quote of ['first words', 'second words', 'second words']) for (const [name, value] of [['via_author', '貓村'], ['via_container', 'zi.tools討論羣'], ['via_report_date', '2026-11-14'], ['via_quote', quote]]) form.append(name, value)
    form.append('place', 'A scan')
    expect(readSightingFields(form).vias.map(via => via.quote)).toEqual(['first words', 'second words'])
  })

  test('both links are kept on the record and share one source', async () => {
    const id = await createEntry(db, fields(), seen({ title: 'A book', vias: [message('貓村', '2026-11-14', 'first words'), message('貓村', '2026-11-14', 'second words')] }), [], who)
    const { vias } = (await getEntry(db, id))!.sightings[0]
    expect(vias.map(via => via.quote)).toEqual(['first words', 'second words'])
    expect(vias[0].id).toBe(vias[1].id)
  })

  test('a citation without a container keeps the key it had before sources had one', async () => {
    await createEntry(db, fields(), seen({ title: 'A book', author: 'Someone' }), [], who)
    const { hash } = raw.query("SELECT hash FROM sources WHERE title = 'A book'").get() as { hash: string }
    expect(hash).toBe(await hashHex(JSON.stringify([null, 'A book', 'Someone', null, null])))
  })

  test('the form sends a container for the source and for each via', () => {
    const form = new FormData()
    for (const [name, value] of [['place', 'A scan'], ['container', '集刊 第六本'], ['via_author', '貓村'], ['via_container', 'zi.tools討論羣'], ['via_publisher', 'QQ']]) form.append(name, value)
    expect(readSightingFields(form)).toMatchObject({ container: '集刊 第六本', vias: [{ author: '貓村', container: 'zi.tools討論羣', publisher: 'QQ', title: null }] })
  })
})

test('a numbered page starts where the pages before it end', async () => {
  for (let i = 0; i < 200; i++) await createEntry(db, fields({ claims: [newClaim('ids', `⿰山${String.fromCodePoint(0x4e00 + i)}`)] }), seen(), [], who)
  for (const order of ['new', 'old', 'most', 'fewest'] as const) {
    const whole = (await list(db, { order, limit: 500 }))!.tiles.map(tile => tile.id)
    for (const number of [2, 3]) {
      const after = await pageCursor(db, { order }, number)
      expect((await list(db, { order, after }))!.tiles.map(tile => tile.id)).toEqual(whole.slice((number - 1) * PAGE, number * PAGE))
    }
    expect(await pageCount(db, { order })).toEqual({ records: whole.length, pages: Math.ceil(whole.length / PAGE), floor: false })
    // A chosen page size moves where each page starts.
    for (const limit of PAGE_SIZES) {
      const after = await pageCursor(db, { order, limit }, 2)
      if (limit < whole.length) expect((await list(db, { order, limit, after }))!.tiles.map(tile => tile.id)).toEqual(whole.slice(limit, 2 * limit))
      else expect(after).toBeUndefined()
      expect((await pageCount(db, { order, limit }))!.pages).toBe(Math.ceil(whole.length / limit))
    }
    expect(await pageCursor(db, { order }, Math.ceil(whole.length / PAGE) + 1)).toBeUndefined()
  }
  expect(await pageCursor(db, {}, 1)).toBeNull()
  // A list that ends on a page boundary has no page after it.
  const full = (await list(db, { limit: 500 }))!.tiles.length
  for (let i = full; i % PAGE; i++) await createEntry(db, fields({ claims: [newClaim('ids', `⿰水${String.fromCodePoint(0x5000 + i)}`)] }), seen(), [], who)
  const even = (await list(db, { limit: 500 }))!.tiles.length
  expect(even % PAGE).toBe(0)
  expect(await pageCursor(db, {}, even / PAGE)).toBeString()
  expect(await pageCursor(db, {}, even / PAGE + 1)).toBeUndefined()
  expect(await pageCursor(db, { query: 'x' }, 2)).toBeUndefined()
  expect(await pageCursor(db, { order: 'random', seed: 1 }, 2)).toBeUndefined()
  expect(await pageCount(db, { query: 'x' })).toBeNull()
  expect(await pageCount(db, { order: 'earliest' })).toEqual({ records: 0, pages: 0, floor: false })
  expect(pageOf('0')).toBeNull()
  expect(pageOf('2')).toBe(2)
  expect(pageOf(String(PAGES_MAX + 1))).toBeNull()
  // A page past the bound is refused without a read.
  const unread = { prepare() { throw new Error('read') } } as unknown as D1Database
  for (const limit of PAGE_SIZES) expect(await pageCursor(unread, { limit }, Math.ceil(PAGED_MAX / limit) + 1)).toBeUndefined()
  // Every size fits in one read of a search.
  for (const limit of PAGE_SIZES) expect(limit).toBeLessThan(SEARCH_WINDOW)
  expect([null, '24', '96', '192', '48', '25', '024', '193'].map(pageSizeOf)).toEqual([PAGE, 24, 96, 192, null, null, null, null])
})
