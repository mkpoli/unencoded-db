import { beforeEach, expect, test } from 'bun:test'
import { ARCHIVES_MAX, archiveUrl } from '$lib/source-archives'
import { createEntry, editSighting, getEntry, setHidden, type EntryFields, type SightingFields } from './entries'
import { createPerson } from './people'
import { archivesOfSources, editSourceArchive, sourceArchiveChanges, sourceArchives } from './source-archives'
import { openTestDb } from './testdb'

const fields: EntryFields = { description: null, radical: null, strokes: null, claims: [] }
const seen = (over: Partial<SightingFields> = {}): SightingFields => ({ place: '甲', url: null, title: null, author: null, publisher: null, report_date: null, container: null, source_kind: null, vias: [], original_date: null, page: null, contexts: null, style: null, types: null, quotes: null, note: null, ...over })
const copy = 'https://web.archive.org/web/20240101000000/https://example.org/post/1'

let db: D1Database, raw: ReturnType<typeof openTestDb>['raw'], who: { actor: string; ip: null }
beforeEach(async () => {
  ({ db, raw } = openTestDb())
  who = { actor: (await createPerson(db)).id, ip: null }
})

const sourceOf = (title: string) => (raw.query('SELECT id FROM sources WHERE title = ?').get(title) as { id: number }).id
const plan = (sql: string, values: unknown[]) => (raw.query(`EXPLAIN QUERY PLAN ${sql}`).all(...(values as never[])) as { detail: string }[]).map(row => row.detail).join('\n')

test('only http and https addresses are kept, in the spelling the URL parser writes', () => {
  expect(archiveUrl(' HTTPS://Archive.PH/AbCd ')).toBe('https://archive.ph/AbCd')
  expect(archiveUrl(copy)).toBe(copy)
  for (const text of ['', 'archive.ph/AbCd', 'ftp://example.org/a', 'javascript:alert(1)', 'data:text/html,x', 'https://web.archive.org@example.org/', `https://example.org/${'a'.repeat(2000)}`])
    expect(archiveUrl(text)).toBeNull()
})

test('a copy is added and removed with who did it, and the source row stays as cited', async () => {
  const entry = await createEntry(db, fields, seen({ title: '乙', url: 'https://example.org/post/1' }), [], who)
  const id = sourceOf('乙'), row = raw.query('SELECT * FROM sources WHERE id = ?').get(id)
  expect(await editSourceArchive(db, id, copy, false, who.actor)).toBe('ok')
  expect(await editSourceArchive(db, id, 'https://ARCHIVE.ph/AbCd', false, who.actor)).toBe('ok')
  expect(await sourceArchives(db, id)).toEqual(['https://archive.ph/AbCd', copy])
  // The same address in another spelling is the same copy.
  expect(await editSourceArchive(db, id, 'HTTPS://archive.ph/AbCd', false, who.actor)).toBe('duplicate')
  expect(await editSourceArchive(db, id, 'ftp://example.org/a', false, who.actor)).toBe('invalid')
  expect(await editSourceArchive(db, id, copy, true, who.actor)).toBe('ok')
  expect(await editSourceArchive(db, id, copy, true, who.actor)).toBe('missing')
  expect(await sourceArchives(db, id)).toEqual(['https://archive.ph/AbCd'])
  expect(raw.query('SELECT * FROM sources WHERE id = ?').get(id)).toEqual(row)
  const { changes, older } = await sourceArchiveChanges(db, id, null)
  expect(changes.map(({ url, removed, actor }) => ({ url, removed, actor }))).toEqual([
    { url: copy, removed: 1, actor: who.actor }, { url: 'https://archive.ph/AbCd', removed: 0, actor: who.actor }, { url: copy, removed: 0, actor: who.actor },
  ])
  expect(older).toBeNull()
  expect((await getEntry(db, entry))!.sightings[0].source_id).toBe(id)
})

test(`a source holds at most ${ARCHIVES_MAX} copies`, async () => {
  await createEntry(db, fields, seen({ title: '丙' }), [], who)
  const id = sourceOf('丙')
  for (let n = 0; n < ARCHIVES_MAX; n++) expect(await editSourceArchive(db, id, `https://archive.ph/${n}`, false, who.actor)).toBe('ok')
  expect(await editSourceArchive(db, id, 'https://archive.ph/more', false, who.actor)).toBe('full')
  expect(await sourceArchives(db, id)).toHaveLength(ARCHIVES_MAX)
  expect(raw.query('SELECT count(*) AS n FROM source_archive_changes').get()).toEqual({ n: ARCHIVES_MAX })
})

test('a hidden source takes no copies and gives none up', async () => {
  const entry = await createEntry(db, fields, seen({ title: '丁' }), [], who)
  const id = sourceOf('丁')
  expect(await editSourceArchive(db, id, copy, false, who.actor)).toBe('ok')
  await setHidden(db, { entry }, true, who, null)
  expect(raw.query('SELECT records FROM sources WHERE id = ?').get(id)).toEqual({ records: 0 })
  expect(await editSourceArchive(db, id, 'https://archive.ph/AbCd', false, who.actor)).toBe('missing')
  expect(await editSourceArchive(db, id, copy, true, who.actor)).toBe('missing')
  expect(await editSourceArchive(db, 999, copy, false, who.actor)).toBe('missing')
  expect(await sourceArchives(db, id)).toEqual([copy])
  expect(raw.query('SELECT count(*) AS n FROM source_archive_changes').get()).toEqual({ n: 1 })
})

test('copies follow their citation through removal and re-use', async () => {
  const original = seen({ title: '戊' })
  const entry = await createEntry(db, fields, original, [], who)
  const sighting = (await getEntry(db, entry))!.sightings[0].id
  const id = sourceOf('戊')
  expect(await editSourceArchive(db, id, copy, false, who.actor)).toBe('ok')
  await editSighting(db, sighting, 1, seen({ title: '己' }), null, who, null, entry)
  expect(raw.query('SELECT records FROM sources WHERE id = ?').get(id)).toEqual({ records: 0 })
  await editSighting(db, sighting, 2, original, null, who, null, entry)
  expect((await getEntry(db, entry))!.sightings[0].source_id).toBe(id)
  expect(await sourceArchives(db, id)).toEqual([copy])
})

test('reading and writing copies use the indexes on the source', async () => {
  const entry = await createEntry(db, fields, seen({ title: '庚' }), [], who)
  const sighting = (await getEntry(db, entry))!.sightings[0].id
  const id = sourceOf('庚')
  const sent: { sql: string; values: unknown[] }[] = []
  const traced = { prepare(sql: string) {
    const statement = db.prepare(sql)
    return { bind(...values: unknown[]) { sent.push({ sql, values }); return statement.bind(...values) } }
  }, batch: (list: D1PreparedStatement[]) => db.batch(list) } as D1Database
  await editSourceArchive(traced, id, copy, false, who.actor)
  await editSourceArchive(traced, id, copy, false, who.actor)
  await editSourceArchive(traced, id, copy, true, who.actor)
  await sourceArchives(traced, id)
  await sourceArchiveChanges(traced, id, null)
  await editSighting(traced, sighting, 1, seen({ title: '辛' }), null, who, null, entry)
  const archives = sent.filter(statement => /source_archive/.test(statement.sql))
  expect(archives.length).toBeGreaterThanOrEqual(8)
  for (const { sql, values } of archives) {
    const details = plan(sql, values)
    expect(`${sql}: ${details}`).not.toMatch(/SCAN (?!CONSTANT ROW)|TEMP B-TREE|AUTOMATIC/)
  }
  const read = (name: string) => archives.find(statement => statement.sql.startsWith(name))!
  expect(plan(read('SELECT url FROM source_archives').sql, [id])).toMatch(/^SEARCH source_archives USING PRIMARY KEY \(source_id=\?\)$/)
  expect(plan(read('SELECT h.id, h.url').sql, [id, Number.MAX_SAFE_INTEGER])).toMatch(/SEARCH h USING INDEX source_archive_changes_by_source \(source_id=\? AND id<\?\)/)
  expect(plan(read('INSERT INTO source_archives').sql, [id, copy])).toMatch(/SEARCH source_archives USING PRIMARY KEY \(source_id=\?\)/)
  expect(plan(read('DELETE FROM source_archives').sql, [id, copy])).toMatch(/^SEARCH source_archives USING PRIMARY KEY \(source_id=\? AND url=\?\)$/)
  expect(plan(read('DELETE FROM sources').sql, [id])).toMatch(/SEARCH source_archive_changes USING COVERING INDEX source_archive_changes_by_source \(source_id=\?\)/)
})

const via = (title: string) => ({ url: `https://example.org/${title}`, title, author: null, publisher: null, report_date: null, container: null, source_kind: null, quote: null, quote_locator: null }) as never

test('a record page reads the copies of the public sources it cites, works and go-betweens, in one index-served statement', async () => {
  const entry = await createEntry(db, fields, seen({ title: '壬', vias: [via('癸'), via('子')] }), [], who)
  const hidden = await createEntry(db, fields, seen({ title: '丑' }), [], who)
  const [work, first, second, gone] = ['壬', '癸', '子', '丑'].map(sourceOf)
  for (const [id, url] of [[work, copy], [work, 'https://archive.ph/AbCd'], [second, 'https://archive.ph/Zz'], [gone, copy]] as const)
    expect(await editSourceArchive(db, id, url, false, who.actor)).toBe('ok')
  await setHidden(db, { entry: hidden }, true, who, null)
  const sent: { sql: string; values: unknown[] }[] = []
  const traced = { prepare(sql: string) {
    const statement = db.prepare(sql)
    return { bind(...values: unknown[]) { sent.push({ sql, values }); return statement.bind(...values) } }
  } } as D1Database
  const found = await archivesOfSources(traced, [work, first, second, work, gone, 999])
  expect([...found]).toEqual([[work, ['https://archive.ph/AbCd', copy]], [second, ['https://archive.ph/Zz']]])
  expect(sent).toHaveLength(1)
  expect(plan(sent[0].sql, sent[0].values).split('\n')).toEqual([
    expect.stringMatching(/^SCAN j VIRTUAL TABLE INDEX \d+:/),
    'SEARCH c USING INTEGER PRIMARY KEY (rowid=?)',
    'SEARCH a USING PRIMARY KEY (source_id=?)',
  ])
  expect(await archivesOfSources(traced, [])).toEqual(new Map())
  expect(sent).toHaveLength(1)
  // The record page passes every source its visible evidence cites.
  const { load } = await import('../../routes/[locale]/entry/[id]/+page.server')
  const page = await load({ params: { locale: 'en', id: String(entry) }, url: new URL(`https://example.test/en/entry/${entry}`), locals: { person: null }, platform: { env: { DB: db } } } as never) as { archives: Map<number, string[]> }
  expect([...page.archives]).toEqual([[work, ['https://archive.ph/AbCd', copy]], [second, ['https://archive.ph/Zz']]])
})
