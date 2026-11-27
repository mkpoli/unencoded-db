import { beforeEach, describe, expect, test } from 'bun:test'
import { newClaim, type Claim } from '$lib/claims'
import { addSighting, createEntry, mergeEntry, setHidden, type EntryFields, type SightingFields } from './entries'
import { createPerson } from './people'
import { SOURCE_TAG_LIMIT, SOURCE_TAG_READ, sourceTagHints, sourceTagStatement } from './source-tags'
import { openTestDb } from './testdb'
import { GET as sourceTagsEndpoint } from '../../routes/api/sources/tags/+server'

const fields = (tags: string[] = []): EntryFields => ({
  script: 'han',
  script_other: null,
  description: null,
  radical: null,
  strokes: null,
  claims: tags.map((tag): Claim => newClaim('tag', tag)),
})

const seen = (over: Partial<SightingFields> = {}): SightingFields => ({
  place: 'Page 1',
  url: null,
  title: null,
  author: null,
  publisher: null,
  report_date: null,
  container: null,
  source_kind: null,
  vias: [],
  original_date: null,
  page: null,
  contexts: null,
  style: null,
  types: null,
  quotes: null,
  note: null,
  ...over,
})

let db: D1Database, raw: ReturnType<typeof openTestDb>['raw'], who: { actor: string; ip: null }
beforeEach(async () => {
  ({ db, raw } = openTestDb())
  who = { actor: (await createPerson(db)).id, ip: null }
})

const sourceIdOf = (entryId: number) =>
  (raw.query('SELECT source_id FROM sightings WHERE entry_id = ? LIMIT 1').get(entryId) as { source_id: number }).source_id

describe('source tag hints', () => {
  test('returns tags on at least half of other visible records citing a source, capped at five', async () => {
    const book = { title: '彙音字典' }
    const e1 = await createEntry(db, fields(['minnan', 'dialect', '臺灣', 'music', 'medicine', 'chemistry']), seen(book), [], who)
    const e2 = await createEntry(db, fields(['minnan', 'dialect', '臺灣', 'music', 'medicine', 'chemistry']), seen(book), [], who)
    const e3 = await createEntry(db, fields(['minnan', 'hakka']), seen(book), [], who)
    const e4 = await createEntry(db, fields([]), seen(book), [], who) // untagged record still counts toward denominator
    const sourceId = sourceIdOf(e1)

    // For a new record (no exclusion): total = 4.
    // minnan: 3/4, dialect: 2/4, 臺灣: 2/4, music: 2/4, medicine: 2/4, chemistry: 2/4, hakka: 1/4 (< half).
    // Capped at 5: minnan first, then 4 tied at 2/4 sorted by tag name.
    const forNew = await sourceTagHints(db, sourceId)
    expect(forNew).toHaveLength(SOURCE_TAG_LIMIT)
    expect(forNew[0]).toBe('minnan')
    expect(forNew).not.toContain('hakka')

    // Editing e4 (excluding e4): remaining records are e1, e2, e3 (total = 3).
    // Tags with >= 2/3 are minnan (3), dialect (2), 臺灣 (2), music (2), medicine (2), chemistry (2).
    const forE4 = await sourceTagHints(db, sourceId, e4)
    expect(forE4).toHaveLength(SOURCE_TAG_LIMIT)
    expect(forE4[0]).toBe('minnan')

    // Editing e1 (excluding e1): remaining are e2, e3, e4 (total = 3).
    // minnan: 2/3 (>= half), dialect: 1/3 (< half), 臺灣: 1/3 (< half), hakka: 1/3.
    expect(await sourceTagHints(db, sourceId, e1)).toEqual(['minnan'])
    expect(e2).toBeGreaterThan(0)
    expect(e3).toBeGreaterThan(0)
  })

  test('counts distinct records rather than repeated sightings, and ignores hidden, merged and via-only records', async () => {
    const book = { title: '集韻' }
    const e1 = await createEntry(db, fields(['nom']), seen({ ...book, page: '1' }), [], who)
    // Two more sightings on e1 citing the same book must not inflate nom's record count.
    await addSighting(db, e1, seen({ ...book, page: '2' }), [], who)
    await addSighting(db, e1, seen({ ...book, page: '3' }), [], who)
    const e2 = await createEntry(db, fields(['hakka']), seen({ ...book, page: '4' }), [], who)
    const e3 = await createEntry(db, fields(['wu']), seen({ ...book, page: '5' }), [], who)
    const hiddenEntry = await createEntry(db, fields(['music']), seen({ ...book, page: '6' }), [], who)
    const mergedEntry = await createEntry(db, fields(['music']), seen({ ...book, page: '7' }), [], who)
    const hiddenSightingEntry = await createEntry(db, fields(['music']), seen({ ...book, page: '8' }), [], who)
    await setHidden(db, { entry: hiddenEntry }, true, who, null)
    await mergeEntry(db, mergedEntry, e3, who, null)
    const hiddenSightingId = (raw.query('SELECT id FROM sightings WHERE entry_id = ?').get(hiddenSightingEntry) as { id: number }).id
    await setHidden(db, { entry: hiddenSightingEntry, sighting: hiddenSightingId }, true, who, null)
    // A via-only sighting does not join through sightings.source_id.
    await createEntry(db, fields(['music']), seen({ place: 'Elsewhere', vias: [{ url: null, title: '集韻', author: null, publisher: null, report_date: null, container: null, source_kind: null, quote: null, quote_locator: null } as never] }), [], who)

    const sourceId = sourceIdOf(e1)
    // Visible live records with sightings.source_id = sourceId: e1 (nom), e2 (hakka), e3 (wu).
    // Each tag is on 1/3 (< half), so none should be returned.
    expect(await sourceTagHints(db, sourceId)).toEqual([])
    expect(e2).toBeGreaterThan(0)
  })

  test('combines suggestions across multiple sources on an edit page and excludes sole-record self-tags', async () => {
    const sole = await createEntry(db, fields(['nom']), seen({ title: 'Sole Book' }), [], who)
    const soleSource = sourceIdOf(sole)
    expect(await sourceTagHints(db, soleSource, sole)).toEqual([])
    expect(await sourceTagHints(db, soleSource)).toEqual(['nom'])

    const a1 = await createEntry(db, fields(['kokuji', '日本']), seen({ title: 'Book A' }), [], who)
    const b1 = await createEntry(db, fields(['buddhism']), seen({ title: 'Book B' }), [], who)
    const b2 = await createEntry(db, fields(['buddhism']), seen({ title: 'Book B' }), [], who)
    expect(await sourceTagHints(db, [sourceIdOf(a1), sourceIdOf(b1)], sole)).toEqual(['buddhism', 'kokuji', '日本'])
    expect(b2).toBeGreaterThan(0)
  })

  test('reads at most SOURCE_TAG_READ sightings and uses indexed lookups with no table scan or temp B-tree', async () => {
    const first = await createEntry(db, fields(['nom']), seen({ title: 'Huge Book' }), [], who)
    const sourceId = sourceIdOf(first)
    const insertEntry = raw.prepare("INSERT INTO entries(script, created_by, created_at, updated_at) VALUES ('han', ?, '2026', '2026')")
    const insertSighting = raw.prepare("INSERT INTO sightings(entry_id, first_entry, source_id, place, created_by, created_at, updated_at) VALUES (?, ?, ?, 'p', ?, '2026', '2026')")
    const insertClaim = raw.prepare("INSERT INTO claims(entry_id, position, key, kind, value) VALUES (?, 0, 'tag00001', 'tag', 'hakka')")
    raw.transaction(() => {
      for (let i = 0; i < SOURCE_TAG_READ + 20; i++) {
        const entryId = Number(insertEntry.run(who.actor).lastInsertRowid)
        insertSighting.run(entryId, entryId, sourceId, who.actor)
        insertClaim.run(entryId)
      }
    })()

    // The latest SOURCE_TAG_READ sightings all belong to entries tagged `hakka`; `first` (`nom`) is beyond the read cap.
    expect(await sourceTagHints(db, sourceId)).toEqual(['hakka'])

    const statement = sourceTagStatement(db, sourceId, null) as unknown as { sql: string; values: unknown[] }
    const plan = (raw.query(`EXPLAIN QUERY PLAN ${statement.sql}`).all(...(statement.values as never[])) as { detail: string }[]).map(row => row.detail)
    const joined = plan.join('\n')
    expect(joined).not.toMatch(/TEMP B-TREE/)
    for (const detail of plan) expect(detail).not.toMatch(/^SCAN (?!sample$)/)
    expect(joined).toContain('SEARCH s USING INDEX sightings_by_source (source_id=?)')
    expect(joined).toContain('SEARCH e USING INTEGER PRIMARY KEY (rowid=?)')
    expect(joined).toContain('SEARCH k USING INDEX claims_by_entry (entry_id=?)')
  })

  test('without its indexes the lookup scans or sorts with a temporary tree', async () => {
    const first = await createEntry(db, fields(['nom']), seen({ title: 'Indexed Book' }), [], who)
    const sourceId = sourceIdOf(first)
    const statement = sourceTagStatement(db, sourceId, null) as unknown as { sql: string; values: unknown[] }

    const noSightingIdx = openTestDb().raw
    noSightingIdx.exec('DROP INDEX sightings_by_source')
    const withoutSighting = (noSightingIdx.query(`EXPLAIN QUERY PLAN ${statement.sql.replace('INDEXED BY sightings_by_source', '')}`).all(...(statement.values as never[])) as { detail: string }[]).map(r => r.detail).join('\n')
    expect(withoutSighting).toMatch(/SCAN s|TEMP B-TREE/)

    const noClaimIdx = openTestDb().raw
    noClaimIdx.exec('DROP INDEX claims_by_entry; DROP INDEX claims_by_key')
    const withoutClaim = (noClaimIdx.query(`EXPLAIN QUERY PLAN ${statement.sql}`).all(...(statement.values as never[])) as { detail: string }[]).map(r => r.detail).join('\n')
    expect(withoutClaim).toMatch(/SCAN k|claims_by_value/)
  })

  test('API endpoint validates parameters and returns suggested tags', async () => {
    const e1 = await createEntry(db, fields(['nom', '越南']), seen({ title: 'Annam Book' }), [], who)
    const sourceId = sourceIdOf(e1)
    const call = (query: string) => sourceTagsEndpoint({ url: new URL(`https://example.test/api/sources/tags${query}`), platform: { env: { DB: db } } } as never)

    expect(await (await call('')).json()).toEqual({ tags: [] })
    expect((await call('?source=abc')).status).toBe(400)
    expect((await call('?source=1&exclude=nope')).status).toBe(400)
    expect(await (await call(`?source=${sourceId}`)).json()).toEqual({ tags: ['nom', '越南'] })
    expect(await (await call(`?source=${sourceId}&exclude=${e1}`)).json()).toEqual({ tags: [] })
  })
})

test('a merged tag counts as the tag it was merged into', async () => {
  const book = { title: '方言志' }
  const e1 = await createEntry(db, fields(['minnan']), seen(book), [], who)
  await createEntry(db, fields(['hakka']), seen(book), [], who)
  await createEntry(db, fields(['wu']), seen(book), [], who)
  raw.exec(`INSERT INTO tag_aliases(alias, tag) VALUES ('hakka', 'minnan')`)
  expect(await sourceTagHints(db, sourceIdOf(e1))).toEqual(['minnan'])
})
