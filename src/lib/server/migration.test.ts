import { Database } from 'bun:sqlite'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from 'bun:test'
import { isClaimKey, newClaim, parseClaims, type Claim } from '$lib/claims'
import { createEntry, getEntry, restoreSighting, revertEntry, setHidden } from './entries'
import { entrySnapshot, sightingSnapshot } from './revisions'
import { createPerson } from './people'
import { d1Over, openTestDb } from './testdb'

const migration = (name: string) => readFileSync(join(import.meta.dir, '../../../migrations', name), 'utf8')

test('a sighting snapshot written before 0002 is restorable after it', () => {
  const raw = new Database(':memory:')
  raw.exec(migration('0001_init.sql'))
  raw.exec("INSERT INTO people(id, name, created_at) VALUES ('p', 'Person', '2026')")
  raw.exec("INSERT INTO entries(script, created_by, created_at, updated_at) VALUES ('han', 'p', '2026', '2026')")
  const old = JSON.stringify({ place: 'A shop', url: null, title: 'Book', author: null, publisher: null, report_date: null, original_date: null, page: null, context: null, style: null, types: null, quotes: null, note: null, media: [] })
  expect(sightingSnapshot(old)).toBeNull()
  const insert = raw.prepare("INSERT INTO revisions(entry_id, sighting_id, kind, rev, snapshot, actor, at) VALUES (1, ?, ?, 1, ?, 'p', '2026')")
  raw.exec("INSERT INTO sightings(entry_id, first_entry, place, created_by, created_at, updated_at) VALUES (1, 1, 'A shop', 'p', '2026', '2026')")
  insert.run(1, 'sighting', old)
  insert.run(1, 'sighting_edit', old)
  insert.run(null, 'hide', '{}')
  insert.run(1, 'redact', '{"revision":1}')
  raw.exec(migration('0002_sighting_via.sql'))
  raw.exec(migration('0019_via_chain.sql'))
  raw.exec(migration('0047_sighting_contexts.sql'))
  const rows = raw.query('SELECT kind, snapshot FROM revisions ORDER BY id').all() as { kind: string; snapshot: string }[]
  for (const row of rows.slice(0, 2)) expect(sightingSnapshot(row.snapshot)).toMatchObject({ place: 'A shop', title: 'Book', vias: [] })
  expect(rows.slice(2).map(row => row.snapshot)).toEqual(['{}', '{"revision":1}'])
})

test('0002 and 0003 together give an old sighting snapshot the via fields and array boxes', () => {
  const raw = new Database(':memory:')
  raw.exec(migration('0001_init.sql'))
  raw.exec("INSERT INTO people(id, name, created_at) VALUES ('p', 'Person', '2026')")
  raw.exec("INSERT INTO entries(script, created_by, created_at, updated_at) VALUES ('han', 'p', '2026', '2026')")
  raw.exec("INSERT INTO sightings(entry_id, first_entry, place, created_by, created_at, updated_at) VALUES (1, 1, 'A shop', 'p', '2026', '2026')")
  raw.exec("INSERT INTO sighting_media(sighting_id, position, image_key, image_type, image_w, image_h, thumb_key, box) VALUES (1, 0, 'a.webp', 'image/webp', 100, 80, 't.webp', '[1,2,10,10]'), (1, 1, 'b.webp', 'image/webp', 100, 80, 't2.webp', NULL)")
  const old = JSON.stringify({ place: 'A shop', url: null, title: 'Book', author: null, publisher: null, report_date: null, original_date: null, page: null, context: null, style: null, types: null, quotes: null, note: null, media: [{ image_key: 'a.webp', image_type: 'image/webp', image_w: 100, image_h: 80, thumb_key: 't.webp', box: '[1,2,10,10]' }, { image_key: 'b.webp', image_type: 'image/webp', image_w: 100, image_h: 80, thumb_key: 't2.webp', box: null }] })
  raw.prepare("INSERT INTO revisions(entry_id, sighting_id, kind, rev, snapshot, actor, at) VALUES (1, 1, 'sighting_edit', 1, ?, 'p', '2026')").run(old)
  raw.exec(migration('0002_sighting_via.sql'))
  raw.exec(migration('0003_media_boxes.sql'))
  raw.exec(migration('0019_via_chain.sql'))
  raw.exec(migration('0047_sighting_contexts.sql'))
  const row = raw.query('SELECT snapshot FROM revisions').get() as { snapshot: string }
  expect(sightingSnapshot(row.snapshot)).toMatchObject({ place: 'A shop', vias: [] })
  expect(JSON.parse(row.snapshot).media.map((image: { box: string | null }) => image.box)).toEqual(['[[1,2,10,10]]', null])
  expect((raw.query('SELECT box FROM sighting_media ORDER BY position').all() as { box: string | null }[]).map(image => image.box)).toEqual(['[[1,2,10,10]]', null])
})

test('0004 turns the character to unify with into a relation, in claims and in past versions', () => {
  const raw = new Database(':memory:')
  for (const name of ['0001_init.sql', '0002_sighting_via.sql', '0003_media_boxes.sql']) raw.exec(migration(name))
  raw.exec("INSERT INTO people(id, name, created_at) VALUES ('p', 'Person', '2026')")
  raw.exec("INSERT INTO entries(script, created_by, created_at, updated_at) VALUES ('han', 'p', '2026', '2026')")
  raw.exec(`INSERT INTO claims(entry_id, position, kind, value, data) VALUES (1, 0, 'ids', '⿰山東', NULL), (1, 1, 'normalizes_to', '崠', NULL), (1, 2, 'relation', '崬', '{"relationship":"variant"}')`)
  const claims = [{ kind: 'ids', value: '⿰山東', data: null, sighting_id: null }, { kind: 'normalizes_to', value: '崠', data: null, sighting_id: null }, { kind: 'relation', value: '崬', data: { relationship: 'variant' }, sighting_id: null }]
  const old = JSON.stringify({ script: 'han', script_other: null, description: null, status: 'unchecked', radical: null, strokes: null, claims })
  const insert = raw.prepare("INSERT INTO revisions(entry_id, kind, rev, snapshot, actor, at) VALUES (1, ?, 1, ?, 'p', '2026')")
  insert.run('create', old)
  insert.run('hide', '{}')
  raw.exec(migration('0004_unify_relation.sql'))
  expect(raw.query('SELECT kind, value, data FROM claims ORDER BY position').all()).toEqual([
    { kind: 'ids', value: '⿰山東', data: null },
    { kind: 'relation', value: '崠', data: '{"relationship":"unifiable"}' },
    { kind: 'relation', value: '崬', data: '{"relationship":"variant"}' },
  ])
  const rows = raw.query('SELECT snapshot FROM revisions ORDER BY id').all() as { snapshot: string }[]
  expect(JSON.parse(rows[0].snapshot).claims).toEqual([
    { kind: 'ids', value: '⿰山東', data: null, sighting_id: null },
    { kind: 'relation', value: '崠', data: { relationship: 'unifiable' }, sighting_id: null },
    { kind: 'relation', value: '崬', data: { relationship: 'variant' }, sighting_id: null },
  ])
  expect(rows[1].snapshot).toBe('{}')
  // The next migration brings that version to the form the app reads.
  raw.exec(migration('0005_claim_links.sql'))
  const after = raw.query('SELECT snapshot FROM revisions ORDER BY id').all() as { snapshot: string }[]
  expect(entrySnapshot(after[0].snapshot)?.claims.map(({ key, ...rest }) => rest)).toEqual([
    { kind: 'ids', value: '⿰山東', data: null, sightings: [], under: [] },
    { kind: 'relation', value: '崠', data: { relationship: 'unifiable' }, sightings: [], under: [] },
    { kind: 'relation', value: '崬', data: { relationship: 'variant' }, sightings: [], under: [] },
  ])
  expect(after[1].snapshot).toBe('{}')
})

// A database as 0001–0004 leave it, holding two records whose claims rest on sightings or on none, and
// the journal of the first: three versions, one redacted, and rows that hold no claims.
function before0005() {
  const raw = new Database(':memory:')
  for (const name of ['0001_init.sql', '0002_sighting_via.sql', '0003_media_boxes.sql', '0004_unify_relation.sql']) raw.exec(migration(name))
  raw.exec("INSERT INTO people(id, name, created_at) VALUES ('p', 'Person', '2026')")
  raw.exec("INSERT INTO entries(script, rev, created_by, created_at, updated_at) VALUES ('han', 4, 'p', '2026', '2026'), ('han', 1, 'p', '2026', '2026')")
  raw.exec("INSERT INTO sightings(entry_id, first_entry, place, created_by, created_at, updated_at) VALUES (1, 1, 'A shop', 'p', '2026', '2026'), (1, 1, 'A book', 'p', '2026', '2026'), (2, 2, 'A sign', 'p', '2026', '2026')")
  type Old = { kind: string; value: string; data: Record<string, unknown> | null; sighting_id: number | null }
  const old = (kind: string, value: string, data: Old['data'] = null, sighting_id: number | null = null): Old => ({ kind, value, data, sighting_id })
  const ids = old('ids', '⿰山東'), tung = old('reading', 'tung', null, 1)
  const live = [ids, tung, old('reading', 'ki', { doculect: 'ja' }), old('reading', 'ki', { doculect: 'ko' }, 2), old('meaning', 'east hill'),
    old('encoding', 'A140', { charset: 'big5' }), old('encoding', 'A140', { charset: 'cns11643' }),
    old('relation', '崬', { relationship: 'variant', difference: 'a stroke' }, 2), old('relation', '崬', { relationship: 'similar' }), old('ivd', 'none'), old('tag', 'IRG')]
  const versions = [[ids, tung], [old('ids', '⿱山東'), ids, tung, old('reading', 'ki', { doculect: 'ko' }), old('meaning', 'east')], [ids, old('reading', 'private')], live]
  const other = [ids, old('reading', 'tung', null, 3)]
  const insert = raw.prepare('INSERT INTO claims(entry_id, position, kind, value, data, sighting_id) VALUES (?, ?, ?, ?, ?, ?)')
  for (const [entry, claims] of [[1, live], [2, other]] as const) claims.forEach((claim, position) => insert.run(entry, position, claim.kind, claim.value, claim.data ? JSON.stringify(claim.data) : null, claim.sighting_id))
  const snapshot = (claims: Old[]) => JSON.stringify({ script: 'han', script_other: null, description: null, status: 'unchecked', radical: null, strokes: null, claims })
  const revision = raw.prepare("INSERT INTO revisions(entry_id, sighting_id, kind, rev, snapshot, actor, at, redacted_at) VALUES (?, ?, ?, ?, ?, 'p', '2026', ?)")
  const sighting = JSON.stringify({ place: 'A shop', url: null, title: null, author: null, publisher: null, report_date: null, container: null, source_kind: null, vias: [], original_date: null, page: null, context: null, style: null, types: null, quotes: null, note: null, media: [] })
  revision.run(1, null, 'create', 1, snapshot(versions[0]), null)
  revision.run(1, 1, 'sighting', 1, sighting, null)
  revision.run(1, null, 'edit', 2, snapshot(versions[1]), null)
  revision.run(1, null, 'edit', 3, '{}', '2026')
  revision.run(1, null, 'redact', 3, '{"revision":4}', null)
  revision.run(1, null, 'hide', 0, '{}', null)
  revision.run(1, null, 'merge', 4, '{"from":3}', null)
  revision.run(1, null, 'edit', 4, snapshot(live), null)
  revision.run(2, null, 'create', 1, snapshot(other), null)
  return { raw, sighting }
}

test('0005 gives every claim a key, a list of sightings and a scope, in claims and in past versions', async () => {
  const { raw, sighting } = before0005()
  raw.exec(migration('0005_claim_links.sql'))

  // The table: the old column is gone, and the two indexes it had are back beside the one for keys.
  expect((raw.query("SELECT name FROM pragma_table_info('claims') ORDER BY cid").all() as { name: string }[]).map(column => column.name)).toEqual(['id', 'entry_id', 'position', 'key', 'kind', 'value', 'data', 'sightings', 'under'])
  expect((raw.query("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'claims' ORDER BY name").all() as { name: string }[]).map(index => index.name)).toEqual(['claims_by_entry', 'claims_by_key', 'claims_by_value'])
  expect(raw.query("SELECT name FROM sqlite_master WHERE name IN ('claim_keys', 'claims_linked')").all()).toEqual([])
  expect(raw.query('PRAGMA foreign_key_check').all()).toEqual([])
  expect(() => raw.exec("INSERT INTO claims(entry_id, position, key, kind, value) SELECT 1, 99, key, 'tag', 'again' FROM claims WHERE entry_id = 1 LIMIT 1")).toThrow(/UNIQUE/)

  // The rows a record holds now.
  type Row = { entry_id: number; key: string; kind: string; value: string; data: string | null; sightings: string; under: string }
  const rows = raw.query('SELECT entry_id, key, kind, value, data, sightings, under FROM claims ORDER BY entry_id, position').all() as Row[]
  const claimsOf = (entry: number) => rows.filter(row => row.entry_id === entry).map(row => ({ key: row.key, kind: row.kind, value: row.value, data: row.data ? JSON.parse(row.data) : null, sightings: JSON.parse(row.sightings), under: JSON.parse(row.under) }))
  const live = claimsOf(1)
  expect(live.map(({ key, ...rest }) => rest)).toEqual([
    { kind: 'ids', value: '⿰山東', data: null, sightings: [], under: [] },
    { kind: 'reading', value: 'tung', data: null, sightings: [1], under: [] },
    { kind: 'reading', value: 'ki', data: { doculect: 'ja' }, sightings: [], under: [] },
    { kind: 'reading', value: 'ki', data: { doculect: 'ko' }, sightings: [2], under: [] },
    { kind: 'meaning', value: 'east hill', data: null, sightings: [], under: [] },
    { kind: 'encoding', value: 'A140', data: { charset: 'big5' }, sightings: [], under: [] },
    { kind: 'encoding', value: 'A140', data: { charset: 'cns11643' }, sightings: [], under: [] },
    { kind: 'relation', value: '崬', data: { relationship: 'variant', difference: 'a stroke' }, sightings: [2], under: [] },
    { kind: 'relation', value: '崬', data: { relationship: 'similar' }, sightings: [], under: [] },
    { kind: 'ivd', value: 'none', data: null, sightings: [], under: [] },
    { kind: 'tag', value: 'IRG', data: null, sightings: [], under: [] },
  ])
  for (const entry of [1, 2]) {
    const keys = claimsOf(entry).map(claim => claim.key)
    expect(keys.every(isClaimKey)).toBe(true)
    expect(new Set(keys).size).toBe(keys.length)
  }
  expect(parseClaims(live)).toEqual(live as Claim[])
  expect(claimsOf(2).map(claim => claim.sightings)).toEqual([[], [3]])

  // The journal. Every version of a record parses, and a version that is the record's present state is
  // the rows themselves, key for key.
  const journal = raw.query('SELECT id, entry_id, kind, snapshot FROM revisions ORDER BY id').all() as { id: number; entry_id: number; kind: string; snapshot: string }[]
  const versions = journal.filter(row => ['create', 'edit'].includes(row.kind) && row.snapshot !== '{}').map(row => ({ ...row, claims: entrySnapshot(row.snapshot)!.claims }))
  expect(versions.map(row => row.id)).toEqual([1, 3, 8, 9])
  expect(versions[2].claims).toEqual(live as Claim[])
  expect(versions[3].claims).toEqual(claimsOf(2) as Claim[])
  expect(JSON.parse(versions[2].snapshot).claims.every((claim: object) => !('sighting_id' in claim))).toBe(true)
  for (const version of versions) expect(new Set(version.claims.map(claim => claim.key)).size).toBe(version.claims.length)

  // A statement keeps one key through the versions that make it: the same kind and value, with the
  // doculect of a reading and the character set of a code. One the record no longer makes has a key no
  // present claim has.
  const key = (claims: { key: string; kind: string; value: string; data: Record<string, unknown> | null }[], kind: string, value: string, mark?: string) => claims.find(claim => claim.kind === kind && claim.value === value && (!mark || Object.values(claim.data ?? {}).includes(mark)))!.key
  const [first, second] = versions.map(version => version.claims)
  expect(first.map(claim => [claim.key, claim.sightings])).toEqual([[key(live, 'ids', '⿰山東'), []], [key(live, 'reading', 'tung'), [1]]])
  expect(key(second, 'ids', '⿰山東')).toBe(key(live, 'ids', '⿰山東'))
  expect(key(second, 'reading', 'tung')).toBe(key(live, 'reading', 'tung'))
  expect(key(second, 'reading', 'ki')).toBe(key(live, 'reading', 'ki', 'ko'))
  expect(key(second, 'reading', 'ki')).not.toBe(key(live, 'reading', 'ki', 'ja'))
  for (const gone of [key(second, 'ids', '⿱山東'), key(second, 'meaning', 'east')]) expect(live.map(claim => claim.key)).not.toContain(gone)
  expect(key(live, 'encoding', 'A140', 'big5')).not.toBe(key(live, 'encoding', 'A140', 'cns11643'))
  // The same statement in another record is another claim.
  expect(key(claimsOf(2), 'ids', '⿰山東')).not.toBe(key(live, 'ids', '⿰山東'))

  // Rows that hold no claims are as they were.
  expect(journal.filter(row => !versions.some(version => version.id === row.id)).map(row => row.snapshot)).toEqual([sighting, '{}', '{"revision":4}', '{}', '{"from":3}'])

  // An old version is restored through the store, with its keys and the sighting it rested on.
  for (const name of ['0006_registry_tags.sql', '0007_entry_marks.sql', '0010_entry_layout.sql', '0011_no_default_status.sql', '0012_tag_sightings.sql', '0013_tag_shuffle.sql', '0014_source_order.sql', '0019_via_chain.sql', '0016_tag_year.sql', '0018_first_sighting.sql', '0023_categories.sql', '0024_category_rows.sql', '0026_typed_tags.sql', '0027_date_readings.sql', '0028_publishers.sql', '0029_via_quote.sql', '0031_sighting_quotations.sql', '0041_source_container.sql', '0048_source_kind.sql', '0045_tag_aliases.sql', '0056_forms.sql', '0055_via_pictures.sql', '0058_agent_attribution.sql', '0060_agent_model.sql', '0065_sighting_cites.sql']) raw.exec(migration(name))
  const db = d1Over(raw)
  expect(await revertEntry(db, 1, 1, { actor: 'p', ip: null })).toEqual({ ok: true, rev: 5 })
  expect((await getEntry(db, 1))!.claims).toEqual(first)
  expect(await revertEntry(db, 1, 4, { actor: 'p', ip: null })).toEqual({ ok: false, code: 'missing' })
})

test('0005 leaves a database without claims with the new table', () => {
  const raw = new Database(':memory:')
  for (const name of ['0001_init.sql', '0002_sighting_via.sql', '0003_media_boxes.sql', '0004_unify_relation.sql', '0005_claim_links.sql']) raw.exec(migration(name))
  expect(raw.query('SELECT count(*) AS n FROM claims').get()).toEqual({ n: 0 })
  raw.exec("INSERT INTO people(id, name, created_at) VALUES ('p', 'Person', '2026')")
  raw.exec("INSERT INTO entries(script, created_by, created_at, updated_at) VALUES ('han', 'p', '2026', '2026')")
  expect(() => raw.exec("INSERT INTO claims(entry_id, position, key, kind, value, sightings) VALUES (1, 0, 'abcd1234', 'tag', 'a', '7')")).toThrow(/CHECK/)
  raw.exec("INSERT INTO claims(entry_id, position, key, kind, value) VALUES (1, 0, 'abcd1234', 'tag', 'a')")
  expect(raw.query('SELECT sightings, under FROM claims').get()).toEqual({ sightings: '[]', under: '[]' })
})

test('0006 counts every listed record in or out of each marked work, as the app does', async () => {
  const { db, raw } = openTestDb()
  const who = { actor: (await createPerson(db)).id, ip: null }
  const seen = { place: 'A shop sign in Tainan', url: null, title: null, author: null, publisher: null, report_date: null, container: null, source_kind: null, vias: [], original_date: null, page: null, contexts: null, style: null, types: null, quotes: null, note: null }
  const codes = [
    [['unicode', 'U+2D6DD']], [['unicode', 'u+5d20']], [['unicode', 'U+004E00']], [['unicode', 'U+FA0E']], [['unicode', 'U+3042']], [['unicode', 'U+1B000']], [['unicode', 'pending']],
    [['unicode', 'U+4E00 U+E0100']], [['unicode', 'U+5650 (compat)']], [['unicode', 'U+2A6D6,U+2A6D7']], [['unicode', 'U+4E00g']], [['unicode', 'U+4E00000']], [['unicode', 'U+0000']], [['unicode', 'U+D800']], [['unicode', 'U+110000']], [['unicode', 'U+10FFFF']], [['unicode', 'U+001F']], [['unicode', 'U+0020']], [['unicode', 'U+2FFFD']],
    [['zitools', '⿰魚它'], ['mj', 'MJ059588']], [['glyphwiki', 'irg2021-03300'], ['big5', 'A140']], [['unicode', 'U+3042'], ['unicode', 'U+4E00'], ['yedict', 'U04E00']], [],
  ]
  let last = 0
  for (const rows of codes) last = await createEntry(db, { description: null, radical: null, strokes: null, claims: rows.map(([charset, code]) => newClaim('encoding', code, { charset })) }, seen, [], who)
  await setHidden(db, { entry: last }, true, who, null)
  const marks = () => ({
    tags: raw.query("SELECT tag, entry_id FROM entry_tags WHERE tag GLOB 'r:*' OR tag GLOB 'x:*' ORDER BY tag, entry_id").all(),
    counts: raw.query("SELECT tag, n FROM tag_counts WHERE (tag GLOB 'r:*' OR tag GLOB 'x:*') AND n > 0 ORDER BY tag").all(),
  })
  const written = marks()
  expect(written.tags).toHaveLength((codes.length - 1) * 5)
  raw.exec("DELETE FROM entry_tags WHERE tag GLOB 'r:*' OR tag GLOB 'x:*'; DELETE FROM tag_counts WHERE tag GLOB 'r:*' OR tag GLOB 'x:*'")
  raw.exec(migration('0006_registry_tags.sql'))
  expect(marks()).toEqual(written)
})

test('0007 gives each record the marked works it is in, as the app writes them', async () => {
  const { db, raw } = openTestDb()
  const who = { actor: (await createPerson(db)).id, ip: null }
  const seen = { place: 'A shop sign in Tainan', url: null, title: null, author: null, publisher: null, report_date: null, container: null, source_kind: null, vias: [], original_date: null, page: null, contexts: null, style: null, types: null, quotes: null, note: null }
  const codes = [[['unicode', 'U+2D6DD'], ['mj', 'MJ059588']], [['mj', 'MJ059588'], ['glyphwiki', 'irg2021-03300'], ['zitools', '⿰魚它']], [['unicode', 'U+3042']], [['big5', 'A140']], []]
  for (const rows of codes) await createEntry(db, { description: null, radical: null, strokes: null, claims: rows.map(([charset, code]) => newClaim('encoding', code, { charset })) }, seen, [], who)
  const marks = () => (raw.query('SELECT marks FROM entries ORDER BY id').all() as { marks: string | null }[]).map(row => row.marks)
  const written = marks()
  expect(written).toEqual(['["unicode","zitools","yedict","glyphwiki","mj"]', '["zitools","glyphwiki","mj"]', '["unicode"]', null, null])
  raw.exec('ALTER TABLE entries DROP COLUMN marks')
  raw.exec(migration('0007_entry_marks.sql'))
  expect(marks()).toEqual(written)
})

test('0008 derives every record\'s status from its claims, with its tags, counts and past versions', () => {
  const raw = new Database(':memory:')
  for (const name of ['0001_init.sql', '0002_sighting_via.sql', '0003_media_boxes.sql', '0004_unify_relation.sql', '0005_claim_links.sql', '0006_registry_tags.sql', '0007_entry_marks.sql']) raw.exec(migration(name))
  raw.exec("INSERT INTO people(id, name, created_at) VALUES ('p', 'Person', '2026')")
  const entry = raw.prepare("INSERT INTO entries(script, status, hidden_at, created_by, created_at, updated_at) VALUES ('han', ?, ?, 'p', '2026', '2026')")
  // Encoded, homograph, an IDS relation, a private use relation, none, and one that is hidden.
  for (const [status, hidden] of [['unencoded', null], ['doubtful', null], ['unchecked', null], ['variant', null], ['unchecked', null], ['encoded', '2026']] as const) entry.run(status, hidden)
  const claim = raw.prepare('INSERT INTO claims(entry_id, position, key, kind, value, data) VALUES (?, 0, ?, ?, ?, ?)')
  claim.run(1, 'aaaaaaaa', 'encoding', 'U+4E00', '{"charset":"unicode"}')
  claim.run(2, 'bbbbbbbb', 'relation', '哦', '{"relationship":"homograph"}')
  claim.run(3, 'cccccccc', 'relation', '⿰乂也', '{"relationship":"variant"}')
  claim.run(4, 'dddddddd', 'relation', '', '{"relationship":"homograph"}')
  claim.run(6, 'ffffffff', 'encoding', 'U+4E00', '{"charset":"unicode"}')
  const tag = raw.prepare('INSERT INTO entry_tags(tag, entry_id) VALUES (?, ?)')
  for (const [id, status] of [[1, 'unencoded'], [2, 'doubtful'], [3, 'unchecked'], [4, 'variant'], [5, 'unchecked']] as const) for (const t of [`f:${status}`, `s:han|f:${status}`, 'n:image', 's:han|n:image', 'all', 's:han', 'w:一']) tag.run(t, id)
  const count = raw.prepare('INSERT INTO tag_counts(tag, n) VALUES (?, ?)')
  for (const [t, n] of [['f:unencoded', 1], ['s:han|f:unencoded', 1], ['f:doubtful', 1], ['f:unchecked', 2], ['s:han|f:unchecked', 2], ['f:variant', 1], ['n:image', 5], ['s:han|n:image', 5], ['all', 5]] as const) count.run(t, n)
  const snapshot = (status?: string) => JSON.stringify({ script: 'han', script_other: null, description: null, ...(status ? { status } : {}), radical: null, strokes: null, claims: [] })
  const revision = raw.prepare("INSERT INTO revisions(entry_id, sighting_id, kind, rev, snapshot, actor, at) VALUES (1, ?, ?, 1, ?, 'p', '2026')")
  revision.run(null, 'create', snapshot('unencoded'))
  revision.run(null, 'hide', '{}')

  raw.exec(migration('0008_derived_status.sql'))

  expect(raw.query('SELECT id, status FROM entries ORDER BY id').all()).toEqual([
    { id: 1, status: 'encoded' }, { id: 2, status: 'homograph' }, { id: 3, status: 'unchecked' }, { id: 4, status: 'unchecked' }, { id: 5, status: 'unchecked' }, { id: 6, status: 'encoded' },
  ])
  expect(() => raw.exec("UPDATE entries SET status = 'doubtful' WHERE id = 1")).toThrow(/CHECK/)
  const facets = raw.query("SELECT entry_id, tag FROM entry_tags WHERE tag LIKE '%f:%' ORDER BY entry_id, tag").all()
  expect(facets).toEqual([
    { entry_id: 1, tag: 'f:encoded' }, { entry_id: 1, tag: 's:han|f:encoded' },
    { entry_id: 2, tag: 'f:homograph' }, { entry_id: 2, tag: 's:han|f:homograph' },
    { entry_id: 3, tag: 'f:unchecked' }, { entry_id: 3, tag: 's:han|f:unchecked' },
    { entry_id: 4, tag: 'f:unchecked' }, { entry_id: 4, tag: 's:han|f:unchecked' },
    { entry_id: 5, tag: 'f:unchecked' }, { entry_id: 5, tag: 's:han|f:unchecked' },
  ])
  // The other tags stay.
  expect(raw.query("SELECT count(*) AS n FROM entry_tags WHERE tag NOT LIKE '%f:%'").get()).toEqual({ n: 25 })
  expect(raw.query('SELECT tag, n FROM tag_counts ORDER BY tag').all()).toEqual([
    { tag: 'all', n: 5 }, { tag: 'f:encoded', n: 1 }, { tag: 'f:homograph', n: 1 }, { tag: 'f:unchecked', n: 3 }, { tag: 'n:image', n: 5 },
    { tag: 's:han|f:encoded', n: 1 }, { tag: 's:han|f:homograph', n: 1 }, { tag: 's:han|f:unchecked', n: 3 }, { tag: 's:han|n:image', n: 5 },
  ])
  const rows = raw.query('SELECT snapshot FROM revisions ORDER BY id').all() as { snapshot: string }[]
  expect(JSON.parse(rows[0].snapshot)).not.toHaveProperty('status')
  expect(rows[1].snapshot).toBe('{}')
})

test('0011 leaves a record that no status rule matches without a status, tag or count', () => {
  const raw = new Database(':memory:')
  for (const name of ['0001_init.sql', '0002_sighting_via.sql', '0003_media_boxes.sql', '0004_unify_relation.sql', '0005_claim_links.sql', '0006_registry_tags.sql', '0007_entry_marks.sql', '0008_derived_status.sql', '0009_custom_scripts.sql', '0010_entry_layout.sql']) raw.exec(migration(name))
  raw.exec("INSERT INTO people(id, name, created_at) VALUES ('p', 'Person', '2026')")
  const entry = raw.prepare("INSERT INTO entries(script, status, created_by, created_at, updated_at) VALUES ('han', ?, 'p', '2026', '2026')")
  for (const status of ['unchecked', 'variant']) entry.run(status)
  const tag = raw.prepare('INSERT INTO entry_tags(tag, entry_id) VALUES (?, ?)')
  for (const [id, status] of [[1, 'unchecked'], [2, 'variant']] as const) for (const t of [`f:${status}`, `s:han|f:${status}`, 'all']) tag.run(t, id)
  const count = raw.prepare('INSERT INTO tag_counts(tag, n) VALUES (?, ?)')
  for (const [t, n] of [['f:unchecked', 1], ['s:han|f:unchecked', 1], ['f:variant', 1], ['s:han|f:variant', 1], ['all', 2]] as const) count.run(t, n)

  raw.exec(migration('0011_no_default_status.sql'))

  expect(raw.query('SELECT id, status FROM entries ORDER BY id').all()).toEqual([{ id: 1, status: null }, { id: 2, status: 'variant' }])
  expect(() => raw.exec("UPDATE entries SET status = 'unchecked' WHERE id = 1")).toThrow(/CHECK/)
  expect(raw.query('SELECT entry_id, tag FROM entry_tags ORDER BY entry_id, tag').all()).toEqual([
    { entry_id: 1, tag: 'all' }, { entry_id: 2, tag: 'all' }, { entry_id: 2, tag: 'f:variant' }, { entry_id: 2, tag: 's:han|f:variant' },
  ])
  expect(raw.query('SELECT tag, n FROM tag_counts ORDER BY tag').all()).toEqual([{ tag: 'all', n: 2 }, { tag: 'f:variant', n: 1 }, { tag: 's:han|f:variant', n: 1 }])
})

test('0012 gives every listed row its record\'s count of sources, under an index read by count', () => {
  const raw = new Database(':memory:')
  for (const name of ['0001_init.sql', '0002_sighting_via.sql', '0003_media_boxes.sql', '0004_unify_relation.sql', '0005_claim_links.sql', '0006_registry_tags.sql', '0007_entry_marks.sql', '0008_derived_status.sql', '0009_custom_scripts.sql', '0010_entry_layout.sql', '0011_no_default_status.sql']) raw.exec(migration(name))
  raw.exec("INSERT INTO people(id, name, created_at) VALUES ('p', 'Person', '2026')")
  raw.exec("INSERT INTO entries(script, sightings, created_by, created_at, updated_at) VALUES ('han', 3, 'p', '2026', '2026'), ('han', 0, 'p', '2026', '2026')")
  raw.exec("INSERT INTO entry_tags(tag, entry_id) VALUES ('all', 1), ('s:han', 1), ('all', 2)")

  raw.exec(migration('0012_tag_sightings.sql'))

  expect(raw.query('SELECT tag, entry_id, sightings FROM entry_tags ORDER BY entry_id, tag').all()).toEqual([
    { tag: 'all', entry_id: 1, sightings: 3 }, { tag: 's:han', entry_id: 1, sightings: 3 }, { tag: 'all', entry_id: 2, sightings: 0 },
  ])
  const plan = (raw.query("EXPLAIN QUERY PLAN SELECT entry_id FROM entry_tags WHERE tag = ? AND (sightings, entry_id) < (?, ?) AND tag NOT GLOB 'w:*' ORDER BY sightings DESC, entry_id DESC LIMIT 5").all('all', 9, 9) as { detail: string }[]).map(row => row.detail).join('\n')
  expect(plan).toMatch(/USING COVERING INDEX entry_tags_by_sightings/)
  expect(plan).not.toMatch(/TEMP B-TREE/)
})

test('0016 gives every listed row its record\'s first year, under an index of the dated rows', () => {
  const raw = new Database(':memory:')
  for (const name of ['0001_init.sql', '0002_sighting_via.sql', '0003_media_boxes.sql', '0004_unify_relation.sql', '0005_claim_links.sql', '0006_registry_tags.sql', '0007_entry_marks.sql', '0008_derived_status.sql', '0009_custom_scripts.sql', '0010_entry_layout.sql', '0011_no_default_status.sql', '0012_tag_sightings.sql', '0013_tag_shuffle.sql']) raw.exec(migration(name))
  raw.exec("INSERT INTO people(id, name, created_at) VALUES ('p', 'Person', '2026')")
  raw.exec("INSERT INTO entries(script, first_year, created_by, created_at, updated_at) VALUES ('han', '1935', 'p', '2026', '2026'), ('han', '980', 'p', '2026', '2026'), ('han', NULL, 'p', '2026', '2026')")
  raw.exec("INSERT INTO entry_tags(tag, entry_id) VALUES ('all', 1), ('w:木', 1), ('all', 2), ('all', 3)")

  raw.exec(migration('0016_tag_year.sql'))

  expect(raw.query('SELECT tag, entry_id, year FROM entry_tags ORDER BY entry_id, tag').all()).toEqual([
    { tag: 'all', entry_id: 1, year: 1935 }, { tag: 'w:木', entry_id: 1, year: null }, { tag: 'all', entry_id: 2, year: 980 }, { tag: 'all', entry_id: 3, year: null },
  ])
  const plan = (raw.query("EXPLAIN QUERY PLAN SELECT entry_id FROM entry_tags WHERE tag = ? AND (year, entry_id) > (?, ?) AND year IS NOT NULL AND tag NOT GLOB 'w:*' ORDER BY year, entry_id LIMIT 5").all('all', -1, 0) as { detail: string }[]).map(row => row.detail).join('\n')
  expect(plan).toMatch(/USING COVERING INDEX entry_tags_by_year/)
  expect(plan).not.toMatch(/TEMP B-TREE/)
})

test('0017 lists every visible dated record under its decade, with its count and year, and counts each decade', () => {
  const raw = new Database(':memory:')
  for (const name of ['0001_init.sql', '0002_sighting_via.sql', '0003_media_boxes.sql', '0004_unify_relation.sql', '0005_claim_links.sql', '0006_registry_tags.sql', '0007_entry_marks.sql', '0008_derived_status.sql', '0009_custom_scripts.sql', '0010_entry_layout.sql', '0011_no_default_status.sql', '0012_tag_sightings.sql', '0013_tag_shuffle.sql', '0016_tag_year.sql']) raw.exec(migration(name))
  raw.exec("INSERT INTO people(id, name, created_at) VALUES ('p', 'Person', '2026')")
  raw.exec(`INSERT INTO entries(script, first_year, sightings, hidden_at, merged_into, created_by, created_at, updated_at) VALUES
    ('han', '1935', 2, NULL, NULL, 'p', '2026', '2026'), ('han', '1939', 1, NULL, NULL, 'p', '2026', '2026'), ('han', '980', 1, NULL, NULL, 'p', '2026', '2026'),
    ('han', NULL, 1, NULL, NULL, 'p', '2026', '2026'), ('han', '1931', 1, 'hidden', NULL, 'p', '2026', '2026'), ('han', '1932', 1, NULL, 1, 'p', '2026', '2026')`)

  raw.exec(migration('0017_decade_tags.sql'))

  expect(raw.query("SELECT tag, entry_id, sightings, year FROM entry_tags WHERE tag GLOB 'y:*' ORDER BY entry_id").all()).toEqual([
    { tag: 'y:1930', entry_id: 1, sightings: 2, year: 1935 }, { tag: 'y:1930', entry_id: 2, sightings: 1, year: 1939 }, { tag: 'y:980', entry_id: 3, sightings: 1, year: 980 },
  ])
  expect(raw.query("SELECT tag, n FROM tag_counts WHERE tag GLOB 'y:*' ORDER BY tag").all()).toEqual([{ tag: 'y:1930', n: 2 }, { tag: 'y:980', n: 1 }])
})

test('0018 names the visible sighting that holds each record\'s earliest year, the first added on a tie', () => {
  const raw = new Database(':memory:')
  for (const name of ['0001_init.sql', '0002_sighting_via.sql', '0003_media_boxes.sql', '0004_unify_relation.sql', '0005_claim_links.sql', '0006_registry_tags.sql', '0007_entry_marks.sql', '0008_derived_status.sql', '0009_custom_scripts.sql', '0010_entry_layout.sql', '0011_no_default_status.sql', '0012_tag_sightings.sql', '0013_tag_shuffle.sql', '0014_source_order.sql']) raw.exec(migration(name))
  raw.exec("INSERT INTO people(id, name, created_at) VALUES ('p', 'Person', '2026')")
  raw.exec("INSERT INTO entries(script, created_by, created_at, updated_at) VALUES ('han', 'p', '2026', '2026'), ('han', 'p', '2026', '2026'), ('han', 'p', '2026', '2026'), ('han', 'p', '2026', '2026')")
  raw.exec("INSERT INTO sources(hash, title, report_date, year) VALUES ('a', 'Recent', '2017-03-01', 2017), ('b', 'Old print', '1999', 1999), ('c', 'Early', '1920', 1920)")
  const sighting = raw.prepare("INSERT INTO sightings(entry_id, first_entry, source_id, place, original_date, hidden_at, created_by, created_at, updated_at) VALUES (?, ?, ?, 'here', ?, ?, 'p', '2026', '2026')")
  // 1: a sign from 2017 and a 1999 reprint of a 1935年 work; the 1935 one holds the year.
  sighting.run(1, 1, 1, null, null); sighting.run(1, 1, 2, '1935年5月', null)
  // 2: a 1920 report of a 1950 work dates by the report; a hidden 1800 sighting does not count.
  sighting.run(2, 2, 3, '1950', null); sighting.run(2, 2, 3, '1800', 'hidden')
  // 3: two sightings of one year; the first added holds it. 4: no year at all.
  sighting.run(3, 3, 2, null, null); sighting.run(3, 3, 2, null, null)
  sighting.run(4, 4, null, '明治', null)

  raw.exec(migration('0018_first_sighting.sql'))

  expect(raw.query('SELECT id, first_sighting FROM entries ORDER BY id').all()).toEqual([
    { id: 1, first_sighting: 2 }, { id: 2, first_sighting: 3 }, { id: 3, first_sighting: 5 }, { id: 4, first_sighting: null },
  ])
})

test('0014 reads each source\'s year as a record\'s first year is read, and counts the visible records that cite it', () => {
  const raw = new Database(':memory:')
  for (const name of ['0001_init.sql', '0002_sighting_via.sql', '0003_media_boxes.sql', '0004_unify_relation.sql', '0005_claim_links.sql', '0006_registry_tags.sql', '0007_entry_marks.sql', '0008_derived_status.sql', '0009_custom_scripts.sql', '0010_entry_layout.sql', '0011_no_default_status.sql', '0012_tag_sightings.sql', '0013_tag_shuffle.sql']) raw.exec(migration(name))
  raw.exec("INSERT INTO people(id, name, created_at) VALUES ('p', 'Person', '2026')")
  const dates = ['1850-03-01', 'c. 980', '令和2年 (2020)', '05/01/1999', '20260501', '12345', 'ab12cd345', '明治', '', null]
  const source = raw.prepare("INSERT INTO sources(hash, title, report_date) VALUES (?, ?, ?)")
  dates.forEach((date, i) => source.run(`h${i}`, `S${i}`, date))
  const entry = raw.prepare("INSERT INTO entries(script, hidden_at, merged_into, created_by, created_at, updated_at) VALUES ('han', ?, ?, 'p', '2026', '2026')")
  entry.run(null, null); entry.run(null, null); entry.run('2026', null); entry.run(null, 1)
  const sighting = raw.prepare("INSERT INTO sightings(entry_id, first_entry, source_id, via_id, hidden_at, place, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'x', 'p', '2026', '2026')")
  // Source 1: two records, one of them twice and once through it. Source 2: only a hidden sighting, a
  // hidden record and a merged one. Source 3: found through it by record 2.
  for (const [entryId, sourceId, viaId, hidden] of [[1, 1, null, null], [1, 1, 1, null], [2, 1, null, null], [2, 2, null, '2026'], [3, 2, null, null], [4, 2, null, null], [2, 4, 3, null]] as const) sighting.run(entryId, entryId, sourceId, viaId, hidden)

  raw.exec(migration('0014_source_order.sql'))

  const rows = raw.query('SELECT report_date, year, records FROM sources ORDER BY id').all() as { report_date: string | null; year: number | null; records: number }[]
  expect(rows.map(row => row.year)).toEqual(dates.map(date => { const match = date?.match(/\d{3,4}/); return match ? Number(match[0]) : null }))
  expect(rows.slice(0, 4).map(row => row.records)).toEqual([2, 0, 1, 1])
})

test('0019 turns each via into the first link of a chain, in the rows and in past versions', async () => {
  const raw = new Database(':memory:')
  for (const name of readdirSync(join(import.meta.dir, '../../../migrations')).sort().filter(name => name < '0019')) raw.exec(migration(name))
  raw.exec("INSERT INTO people(id, name, created_at) VALUES ('p', 'Person', '2026')")
  raw.exec("INSERT INTO entries(script, created_by, created_at, updated_at) VALUES ('han', 'p', '2026', '2026')")
  raw.exec("INSERT INTO sources(hash, title) VALUES ('a', 'Book'), ('b', 'A post')")
  raw.exec("INSERT INTO sightings(entry_id, first_entry, source_id, via_id, place, created_by, created_at, updated_at) VALUES (1, 1, 1, 2, 'with a via', 'p', '2026', '2026'), (1, 1, 1, NULL, 'without', 'p', '2026', '2026')")
  const flat = { place: 'x', url: null, title: 'Book', author: null, publisher: null, report_date: null, original_date: null, page: null, context: null, style: null, types: null, quotes: null, note: null, media: [] }
  const withVia = JSON.stringify({ ...flat, via_url: 'https://example.test/post', via_title: 'A post', via_author: null, via_publisher: null, via_report_date: '2026-05-01' })
  const withoutVia = JSON.stringify({ ...flat, via_url: null, via_title: null, via_author: null, via_publisher: null, via_report_date: null })
  const insert = raw.prepare("INSERT INTO revisions(entry_id, sighting_id, kind, rev, snapshot, actor, at, redacted_at) VALUES (1, ?, ?, 1, ?, 'p', '2026', ?)")
  insert.run(1, 'sighting', withVia, null); insert.run(1, 'sighting_edit', withoutVia, null); insert.run(1, 'sighting_edit', withVia, '2026'); insert.run(null, 'hide', '{}', null)
  raw.exec(migration('0019_via_chain.sql'))

  expect(raw.query('SELECT sighting_id, position, source_id FROM sighting_vias').all()).toEqual([{ sighting_id: 1, position: 0, source_id: 2 }])
  expect((raw.query("SELECT name FROM pragma_table_info('sightings')").all() as { name: string }[]).map(column => column.name)).not.toContain('via_id')
  expect(raw.query("SELECT name FROM sqlite_master WHERE name IN ('sightings_by_via', 'sighting_vias_by_source') ORDER BY name").all()).toEqual([{ name: 'sighting_vias_by_source' }])
  expect(raw.query('PRAGMA foreign_key_check').all()).toEqual([])
  const rows = raw.query('SELECT snapshot FROM revisions ORDER BY id').all() as { snapshot: string }[]
  const post = { url: 'https://example.test/post', title: 'A post', author: null, publisher: null, report_date: '2026-05-01' }
  expect(JSON.parse(rows[0].snapshot).vias).toEqual([post])
  expect(JSON.parse(rows[1].snapshot).vias).toEqual([])
  for (const row of rows.slice(0, 2)) expect(Object.keys(JSON.parse(row.snapshot)).filter(key => key.startsWith('via_'))).toEqual([])
  expect(rows[2].snapshot).toBe(withVia)
  expect(rows[3].snapshot).toBe('{}')

  // The old version is restorable: the chain is written back as a row of the new table, on the schema every migration leaves.
  for (const name of readdirSync(join(import.meta.dir, '../../../migrations')).sort().filter(name => name.slice(0, 4) > '0019')) raw.exec(migration(name))
  const kept = (raw.query('SELECT snapshot FROM revisions ORDER BY id LIMIT 2').all() as { snapshot: string }[]).map(row => sightingSnapshot(row.snapshot)!)
  // A chain written before quotes and containers were kept reads as one with neither.
  expect(kept.map(fields => fields.vias)).toEqual([[{ ...post, container: null, source_kind: null, quote: null }], []])
  const db = d1Over(raw)
  expect(await restoreSighting(db, 1, 2, 1, kept[0], { actor: 'p', ip: null }, 1)).toEqual({ ok: true, rev: 2 })
  expect(raw.query('SELECT v.position, c.title, c.records FROM sighting_vias v JOIN sources c ON c.id = v.source_id WHERE v.sighting_id = 2').all()).toEqual([{ position: 0, title: 'A post', records: 1 }])
})

test('0022 dates each agent client by its latest token or code, so pruning a client leaves no row pointing at it', async () => {
  const raw = new Database(':memory:')
  raw.exec('PRAGMA foreign_keys = ON')
  const migrations = join(import.meta.dir, '../../../migrations')
  const names = readdirSync(migrations).sort()
  for (const name of names.filter(name => name < '0022')) raw.exec(readFileSync(join(migrations, name), 'utf8'))
  const old = '2026-01-01T00:00:00.000Z'
  raw.exec(`INSERT INTO people(id, name, created_at) VALUES ('p', 'Person', '${old}')`)
  raw.exec(`INSERT INTO agent_clients(id, name, redirect_uris, created_at) VALUES ('token', null, '[]', '${old}'), ('code', null, '[]', '${old}'), ('neither', null, '[]', '${old}')`)
  raw.exec(`INSERT INTO agent_tokens(token_hash, client, person, created_at) VALUES ('a', 'token', 'p', '2026-01-02T00:00:00.000Z'), ('b', 'token', 'p', '2026-01-03T00:00:00.000Z')`)
  // Allowed, and the code never traded.
  raw.exec(`INSERT INTO agent_codes(code_hash, client, person, redirect_uri, challenge, created_at) VALUES ('c', 'code', 'p', 'https://example.test/cb', 'x', '2026-01-04T00:00:00.000Z')`)
  raw.exec(migration('0022_agent_client_use.sql'))
  expect(raw.query('SELECT id, used_at FROM agent_clients ORDER BY id').all()).toEqual([{ id: 'code', used_at: '2026-01-04T00:00:00.000Z' }, { id: 'neither', used_at: null }, { id: 'token', used_at: '2026-01-03T00:00:00.000Z' }])
  // A registration long after: the client nobody allowed goes, and the two that were allowed go with their rows.
  const { registerClient, CLIENT_LIFE } = await import('./agents')
  raw.exec(`UPDATE agent_clients SET used_at = '${new Date(Date.now() - CLIENT_LIFE - 1000).toISOString()}' WHERE used_at IS NOT NULL`)
  expect(await registerClient(d1Over(raw), { redirect_uris: ['https://example.test/cb'] })).toMatchObject({ redirect_uris: ['https://example.test/cb'] })
  expect(raw.query('SELECT count(*) AS n FROM agent_clients').get()).toEqual({ n: 1 })
  expect(raw.query('SELECT (SELECT count(*) FROM agent_tokens) + (SELECT count(*) FROM agent_codes) AS n').get()).toEqual({ n: 0 })
})

test('0026 unifies categories and #tags into typed tags with seeded implications and rebuilds tag facets', () => {
  const raw = new Database(':memory:')
  raw.exec('PRAGMA foreign_keys = ON')
  const migrations = join(import.meta.dir, '../../../migrations')
  for (const name of readdirSync(migrations).sort().filter(name => name < '0026')) raw.exec(readFileSync(join(migrations, name), 'utf8'))
  raw.exec("INSERT INTO people(id, name, created_at) VALUES ('p', 'Person', '2026')")
  raw.exec("INSERT INTO entries(id, script, hidden_at, merged_into, sightings, created_by, created_at, updated_at) VALUES (1, 'han', NULL, NULL, 1, 'p', '2026', '2026'), (2, 'han', NULL, NULL, 1, 'p', '2026', '2026'), (3, 'han', '2026', NULL, 1, 'p', '2026', '2026'), (4, 'han', NULL, 1, 1, 'p', '2026', '2026')")
  raw.exec("UPDATE categories SET rev = 9 WHERE name = 'nom'")
  raw.exec("INSERT INTO category_changes(id, name, kind, before, after, actor, at) VALUES (4, 'nom', 'rename', '{\"label\":\"nom\"}', '{\"label\":\"喃字\"}', 'p', '2026')")
  // Entry 1: genre `nom` (plus legacy label `'喃字'` and freeform tag `'IRG'`); Entry 2: kokuji; Entry 3 hidden; Entry 4 merged.
  raw.exec(`INSERT INTO claims(entry_id, position, key, kind, value, data, sightings, under) VALUES
    (1, 0, 'genr0001', 'genre', 'nom', NULL, '[]', '[]'),
    (1, 1, 'tag00001', 'tag', '喃字', NULL, '[]', '[]'),
    (1, 2, 'tag00002', 'tag', 'IRG', NULL, '[]', '[]'),
    (2, 0, 'genr0002', 'genre', 'kokuji', NULL, '[]', '[]'),
    (3, 0, 'genr0003', 'genre', 'kokuji', NULL, '[]', '[]'),
    (4, 0, 'genr0004', 'genre', 'nom', NULL, '[]', '[]')`)
  raw.exec("INSERT INTO entry_tags(tag, entry_id, sightings) VALUES ('g:nom', 1, 1), ('t:IRG', 1, 1)")

  raw.exec(migration('0026_typed_tags.sql'))

  expect(raw.query('PRAGMA foreign_key_check').all()).toEqual([])
  expect(raw.query("SELECT name FROM sqlite_master WHERE name IN ('categories', 'category_changes')").all()).toEqual([])
  // Types assigned accurately + region & ゲバ字 seeded.
  const tags = new Map((raw.query('SELECT name, type FROM tags').all() as { name: string; type: string }[]).map(row => [row.name, row.type]))
  expect([tags.get('nom'), tags.get('dialect'), tags.get('music'), tags.get('日本'), tags.get('越南'), tags.get('大陸'), tags.get('ゲバ字'), tags.get('IRG')]).toEqual(['form', 'language', 'domain', 'region', 'region', 'region', 'form', 'general'])
  // Implications preserve old hierarchy + seeded regional/form implications.
  const implies = raw.query("SELECT tag, implies FROM tag_implications WHERE tag IN ('nom', 'kokuji', 'ゲバ字', 'hakka', 'simplified-cn') ORDER BY tag, implies").all()
  expect(implies).toEqual([
    { tag: 'hakka', implies: 'dialect' },
    { tag: 'kokuji', implies: 'dialect' },
    { tag: 'kokuji', implies: '日本' },
    { tag: 'nom', implies: 'dialect' },
    { tag: 'nom', implies: '越南' },
    { tag: 'simplified-cn', implies: 'abbreviation' },
    { tag: 'simplified-cn', implies: '大陸' },
    { tag: 'ゲバ字', implies: '日本' },
  ])
  // Claims deduplicated and normalized to canonical names under `tag`.
  expect(raw.query('SELECT entry_id, kind, value FROM claims ORDER BY entry_id, position').all()).toEqual([
    { entry_id: 1, kind: 'tag', value: 'nom' },
    { entry_id: 1, kind: 'tag', value: 'IRG' },
    { entry_id: 2, kind: 'tag', value: 'kokuji' },
    { entry_id: 3, kind: 'tag', value: 'kokuji' },
    { entry_id: 4, kind: 'tag', value: 'nom' },
  ])
  // Entry tags and counts rebuilt with transitive closure, excluding hidden/merged records and old `g:` rows.
  expect(raw.query("SELECT tag, entry_id FROM entry_tags WHERE tag GLOB 'g:*'").all()).toEqual([])
  expect(raw.query("SELECT tag, entry_id FROM entry_tags WHERE tag GLOB 't:*' ORDER BY entry_id, tag").all()).toEqual([
    { tag: 't:IRG', entry_id: 1 },
    { tag: 't:dialect', entry_id: 1 },
    { tag: 't:nom', entry_id: 1 },
    { tag: 't:越南', entry_id: 1 },
    { tag: 't:dialect', entry_id: 2 },
    { tag: 't:kokuji', entry_id: 2 },
    { tag: 't:日本', entry_id: 2 },
  ])
  expect(raw.query("SELECT tag, n FROM tag_counts WHERE tag GLOB 't:*' AND n > 0 ORDER BY tag").all()).toEqual([
    { tag: 't:IRG', n: 1 },
    { tag: 't:dialect', n: 2 },
    { tag: 't:kokuji', n: 1 },
    { tag: 't:nom', n: 1 },
    { tag: 't:日本', n: 1 },
    { tag: 't:越南', n: 1 },
  ])
  // `tag_changes` sequence stays past migrated `rev` (= 9).
  expect((raw.query("SELECT seq FROM sqlite_sequence WHERE name = 'tag_changes'").get() as { seq: number }).seq).toBeGreaterThanOrEqual(10)
})

test('0028 backfills source publishers without rewriting their citation or hash', () => {
  const raw = new Database(':memory:')
  for (const name of readdirSync(join(import.meta.dir, '../../../migrations')).sort().filter(n => n < '0028')) raw.exec(migration(name))
  raw.exec("INSERT INTO sources(hash, publisher, records) VALUES ('first','江蘇教育出版社',1),('second','江苏教育出版社',1),('third','未詳',1),('fourth',NULL,1)")
  raw.exec(migration('0028_publishers.sql'))
  expect(raw.query(`SELECT s.hash, s.publisher, p.name FROM sources s LEFT JOIN publishers p ON p.id = s.publisher_id ORDER BY s.id`).all()).toEqual([
    { hash: 'first', publisher: '江蘇教育出版社', name: '江苏教育出版社' },
    { hash: 'second', publisher: '江苏教育出版社', name: '江苏教育出版社' },
    { hash: 'third', publisher: '未詳', name: null },
    { hash: 'fourth', publisher: null, name: null },
  ])
  expect(raw.query('PRAGMA foreign_key_check').all()).toEqual([])
})

test('0029 indexes existing public names and simplified spellings and restores them on visibility changes', () => {
  const raw = new Database(':memory:')
  const directory = join(import.meta.dir, '../../../migrations')
  for (const file of readdirSync(directory).sort().filter(file => file < '0029')) raw.exec(migration(file))
  raw.exec("INSERT INTO sources(hash, title, records) VALUES ('one', '合併字學集韻', 1), ('two', '彙音字典', 0)")
  raw.exec(migration('0029_source_aliases.sql'))
  const names = () => raw.query('SELECT lookup FROM source_search_names ORDER BY lookup').all().map(row => (row as { lookup: string }).lookup)
  expect(names()).toEqual(['合併字學集韻', '合并字学集韵'])
  raw.exec("UPDATE sources SET records = 1 WHERE hash = 'two'")
  expect(names()).toContain('汇音字典')
  raw.exec("UPDATE sources SET records = 0 WHERE hash = 'one'")
  expect(names()).toEqual(['彙音字典', '汇音字典'])
  raw.close()
})

test('0030 moves reviewed words to their link, preserves identity and skips later edits', async () => {
  const raw = new Database(':memory:')
  const all = readdirSync(join(import.meta.dir, '../../../migrations')).sort()
  for (const name of all.filter(name => name < '0030')) raw.exec(migration(name))
  const run = () => raw.exec(migration('0030_recover_via_quotes.sql'))
  const words = '⿰米兆', url = 'https://x.com/zoenshiueh_lieu/status/1923670644786594004'
  const author = '@zoenshiueh_lieu', date = '2025-05-17'
  const hash = (title: string | null) => new Bun.CryptoHasher('sha256').update(JSON.stringify([url, title, author, 'X', date])).digest('hex')
  raw.exec("INSERT INTO people(id,name,created_at) VALUES ('p','Person','2026')")
  raw.exec("INSERT INTO entries(id,script,created_by,created_at,updated_at) VALUES (348,'han','p','2026','2026')")
  raw.prepare('INSERT INTO sources(id,hash,url,title,author,publisher,report_date,records) VALUES (1979,?,?,?,?,?,?,1)').run(hash(words), url, words, author, 'X', date)
  raw.exec("INSERT INTO sightings(id,entry_id,first_entry,place,created_by,created_at,updated_at) VALUES (353,348,348,'Page 1','p','2026','2026')")
  raw.exec("INSERT INTO sighting_vias VALUES (353,0,1979,'Contributor correction')")
  run()
  expect(raw.query('SELECT title FROM sources WHERE id=1979').get()).toEqual({ title: words })
  raw.exec('UPDATE sighting_vias SET quote=NULL')
  run()
  expect(raw.query('SELECT hash,title FROM sources WHERE id=1979').get()).toEqual({ hash: hash(null), title: null })
  expect(raw.query('SELECT source_id,quote FROM sighting_vias').get()).toEqual({ source_id: 1979, quote: words })
  expect(raw.query('SELECT lookup,spelling FROM source_aliases WHERE source_id=1979').get()).toEqual({ lookup: words, spelling: words })
  run()
  expect(raw.query('SELECT count(*) AS n FROM revisions').get()).toEqual({ n: 1 })
  for (const name of all.filter(name => name > '0031')) raw.exec(migration(name))
  const snapshot = raw.query('SELECT snapshot FROM revisions WHERE sighting_id=353 AND rev=2').get() as { snapshot: string }
  expect(sightingSnapshot(snapshot.snapshot)?.vias[0]).toMatchObject({ url, title: null, quote: words })
  expect((await getEntry(d1Over(raw), 348))?.sightings[0].rev).toBe(2)
  expect(raw.query('PRAGMA foreign_key_check').all()).toEqual([])
  raw.close()
})

test('0044 moves the tag change log under subjects and never hands out a used id again', () => {
  const raw = new Database(':memory:')
  const all = readdirSync(join(import.meta.dir, '../../../migrations')).sort()
  for (const name of all.filter(name => name < '0044')) raw.exec(migration(name))
  raw.exec("INSERT INTO tag_changes(name, kind, before, after, actor, at) VALUES ('nom', 'retype', '{\"type\":\"general\"}', '{\"type\":\"form\"}', NULL, '2026'), ('nom', 'rename', NULL, NULL, NULL, '2026')")
  const last = (raw.query('SELECT MAX(id) AS id FROM tag_changes').get() as { id: number }).id
  raw.exec(`DELETE FROM tag_changes WHERE id = ${last}`)
  for (const name of all.filter(name => name >= '0044')) raw.exec(migration(name))
  expect(raw.query("SELECT subject, name, kind FROM tag_changes WHERE id = ?").get(last - 1)).toEqual({ subject: 'tag', name: 'nom', kind: 'retype' })
  raw.exec("INSERT INTO tag_changes(name, kind) VALUES ('nom', 'move')")
  expect((raw.query('SELECT MAX(id) AS id FROM tag_changes').get() as { id: number }).id).toBe(last + 1)
  expect(raw.query("SELECT count(*) AS n FROM tag_changes WHERE name = ''").get()).toEqual({ n: 0 })
})

test('0047 turns each context into a list of one, in the rows and in past versions', () => {
  const raw = new Database(':memory:')
  for (const name of readdirSync(join(import.meta.dir, '../../../migrations')).sort().filter(name => name < '0047')) raw.exec(migration(name))
  raw.exec("INSERT INTO people(id, name, created_at) VALUES ('p', 'Person', '2026')")
  raw.exec("INSERT INTO entries(script, created_by, created_at, updated_at) VALUES ('han', 'p', '2026', '2026')")
  raw.exec("INSERT INTO sightings(entry_id, first_entry, place, context, created_by, created_at, updated_at) VALUES (1, 1, 'a', 'heading', 'p', '2026', '2026'), (1, 1, 'b', NULL, 'p', '2026', '2026')")
  const past = (context: string | null) => JSON.stringify({ place: 'x', url: null, title: 'Book', author: null, publisher: null, report_date: null, container: null, source_kind: null, vias: [], original_date: null, page: null, context, style: 'regular', types: '["mention"]', quotes: null, note: null, media: [] })
  const insert = raw.prepare("INSERT INTO revisions(entry_id, sighting_id, kind, rev, snapshot, actor, at, redacted_at) VALUES (1, ?, ?, 1, ?, 'p', '2026', ?)")
  insert.run(1, 'sighting', past('heading'), null); insert.run(1, 'sighting_edit', past(null), null); insert.run(1, 'sighting_edit', '{}', '2026'); insert.run(null, 'create', '{"script":"han"}', null)
  raw.exec(migration('0047_sighting_contexts.sql'))

  expect(raw.query('SELECT contexts FROM sightings ORDER BY id').all()).toEqual([{ contexts: '["heading"]' }, { contexts: null }])
  expect((raw.query("SELECT name FROM pragma_table_info('sightings')").all() as { name: string }[]).map(column => column.name)).not.toContain('context')
  const rows = (raw.query('SELECT snapshot FROM revisions ORDER BY id').all() as { snapshot: string }[]).map(row => row.snapshot)
  expect(rows.slice(0, 2).map(row => sightingSnapshot(row))).toMatchObject([{ contexts: '["heading"]', style: 'regular', types: '["mention"]' }, { contexts: null }])
  expect(JSON.parse(rows[0])).not.toHaveProperty('context')
  expect(rows.slice(2)).toEqual(['{}', '{"script":"han"}'])
})

test('0062 aborts when a legacy upward merge or non-positive id exists and otherwise hardens rekey and replace guards', () => {
  const raw = new Database(':memory:')
  raw.exec('PRAGMA foreign_keys = ON')
  const all = readdirSync(join(import.meta.dir, '../../../migrations')).sort()
  for (const name of all.filter(name => name < '0053')) raw.exec(migration(name))
  raw.exec("INSERT INTO people(id, name, created_at) VALUES ('p', 'Person', '2026')")
  raw.exec("INSERT INTO entries(id, script, merged_into, created_by, created_at, updated_at) VALUES (-1, 'han', NULL, 'p', '2026', '2026'), (1, 'han', NULL, 'p', '2026', '2026'), (2, 'han', NULL, 'p', '2026', '2026')")
  raw.exec('UPDATE entries SET merged_into = 2 WHERE id = 1')
  for (const name of all.filter(name => name >= '0053' && name < '0062')) raw.exec(migration(name))
  // Trim trailing whitespace because bun:sqlite `exec` clears an earlier statement's error on an empty tail.
  const apply = () => raw.transaction(() => raw.exec(migration('0062_harden_record_code_stability.sql').trimEnd()))()
  expect(apply).toThrow('entry id must be positive')
  raw.exec('DELETE FROM atlas_sync_state WHERE entry_id = -1; DROP TRIGGER entries_no_delete; DELETE FROM entries WHERE id = -1;')
  raw.exec("CREATE TRIGGER entries_no_delete BEFORE DELETE ON entries BEGIN SELECT RAISE(ABORT, 'entries cannot be deleted'); END;")
  expect(apply).toThrow('a record can only merge into an earlier record')
  raw.exec('UPDATE entries SET merged_into = NULL WHERE id = 1; UPDATE entries SET merged_into = 1 WHERE id = 2')
  expect(apply).not.toThrow()
  expect(() => raw.exec('UPDATE entries SET rowid = 9 WHERE id = 2')).toThrow('entry id cannot change')
  expect(() => raw.exec("INSERT OR REPLACE INTO entries(id, script, created_by, created_at, updated_at) VALUES (2, 'han', 'p', '2026', '2026')")).toThrow('entries cannot be replaced')
  expect(() => raw.exec("INSERT INTO entries(id, script, created_by, created_at, updated_at) VALUES (-1, 'han', 'p', '2026', '2026')")).toThrow('entry id must be positive')
  raw.close()
})

test('0067 migrates record scripts, custom scripts and revision snapshots into script tags', async () => {
  const raw = new Database(':memory:')
  raw.exec('PRAGMA foreign_keys = ON')
  const all = readdirSync(join(import.meta.dir, '../../../migrations')).sort()
  for (const name of all.filter(name => name < '0067')) raw.exec(migration(name))
  raw.exec("INSERT INTO people(id, name, created_at) VALUES ('p', 'Person', '2026')")
  // Existing custom tag colliding by label (`古壯字`) and existing localized name on `nom`.
  raw.exec("INSERT INTO tags(name, label, type, position) VALUES ('古壯字', '古壯字', 'general', 99)")
  raw.exec(`UPDATE tags SET names = '{"en":"Custom Nôm"}' WHERE name = 'nom'`)
  const insEntry = raw.prepare("INSERT INTO entries(id, script, script_other, hidden_at, merged_into, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'p', ?, ?)")
  insEntry.run(1, 'han', null, null, null, '2026-01-01', '2026-01-01')
  insEntry.run(2, 'nom', null, null, null, '2026-01-02', '2026-01-02')
  insEntry.run(3, 'bai', null, null, null, '2026-01-03', '2026-01-03')
  insEntry.run(4, 'sawndip', null, null, null, '2026-01-04', '2026-01-04')
  insEntry.run(5, 'other', '臺灣 方音符號', null, null, '2026-01-05', '2026-01-05')
  insEntry.run(6, 'other', null, null, null, '2026-01-06', '2026-01-06')
  insEntry.run(7, 'han', null, '2026-01-07', null, '2026-01-07', '2026-01-07')
  insEntry.run(8, 'miao', null, null, 1, '2026-01-08', '2026-01-08')
  raw.exec(`INSERT INTO claims(entry_id, position, key, kind, value) VALUES (2, 0, 'aaaaaaaa', 'tag', 'nom'), (3, 0, 'bbbbbbbb', 'tag', 'baiwen')`)
  const insRev = raw.prepare("INSERT INTO revisions(entry_id, kind, rev, snapshot, actor, at) VALUES (?, 'create', 1, ?, 'p', '2026')")
  insRev.run(1, JSON.stringify({ script: 'han', script_other: null, description: null, radical: null, strokes: null, claims: [] }))
  insRev.run(2, JSON.stringify({ script: 'nom', script_other: null, description: null, radical: null, strokes: null, claims: [{ key: 'aaaaaaaa', kind: 'tag', value: 'nom', data: null, sightings: [], under: [] }] }))
  insRev.run(5, JSON.stringify({ script: 'other', script_other: '臺灣 方音符號', description: null, radical: null, strokes: null, claims: [] }))
  insRev.run(6, JSON.stringify({ script: 'other', script_other: null, description: null, radical: null, strokes: null, claims: [] }))
  raw.exec("INSERT INTO entry_tags(tag, entry_id) VALUES ('s:han', 1), ('s:han|f:encoded', 1); INSERT INTO tag_counts(tag, n) VALUES ('s:han', 1), ('s:han|f:encoded', 1)")

  for (const name of all.filter(name => name >= '0067')) raw.exec(migration(name))

  expect(raw.query('PRAGMA foreign_key_check').all()).toEqual([])
  const cols = (raw.query("SELECT name FROM pragma_table_info('entries')").all() as { name: string }[]).map(c => c.name)
  expect(cols).not.toContain('script')
  expect(cols).not.toContain('script_other')
  // Pre-existing localized name on `nom` is preserved while missing locales are filled.
  const nom = raw.query("SELECT type, names FROM tags WHERE name = 'nom'").get() as { type: string; names: string }
  expect(nom.type).toBe('script')
  expect(JSON.parse(nom.names)).toMatchObject({ en: 'Custom Nôm', ja: 'チュノム', 'zh-Hant': '喃字' })
  // `bai` aliases `baiwen`, `bouyei` aliases `布依方塊字`, and `sawndip` aliases the pre-existing `古壯字` tag.
  expect(raw.query('SELECT alias, tag FROM tag_aliases ORDER BY alias').all()).toEqual([
    { alias: 'bai', tag: 'baiwen' },
    { alias: 'bouyei', tag: '布依方塊字' },
    { alias: 'sawndip', tag: '古壯字' },
  ])
  // Live, hidden, and merged records get their script tag without duplicating existing tags; `other` with null gets none.
  expect(raw.query("SELECT entry_id, value FROM claims WHERE kind = 'tag' ORDER BY entry_id, position").all()).toEqual([
    { entry_id: 1, value: 'han' },
    { entry_id: 2, value: 'nom' },
    { entry_id: 3, value: 'baiwen' },
    { entry_id: 4, value: '古壯字' },
    { entry_id: 5, value: '臺灣方音符號' },
    { entry_id: 7, value: 'han' },
    { entry_id: 8, value: 'miao' },
  ])
  // Obsolete `s:` rows are gone; hidden (7) and merged (8) entries are excluded from `t:` counts; `nom` implies `越南` and `dialect`.
  expect(raw.query("SELECT tag FROM entry_tags WHERE tag LIKE 's:%'").all()).toEqual([])
  expect(raw.query("SELECT tag, n FROM tag_counts WHERE tag LIKE 't:%' ORDER BY tag").all()).toEqual([
    { tag: 't:baiwen', n: 1 },
    { tag: 't:dialect', n: 2 },
    { tag: 't:han', n: 1 },
    { tag: 't:nom', n: 1 },
    { tag: 't:古壯字', n: 1 },
    { tag: 't:臺灣方音符號', n: 1 },
    { tag: 't:越南', n: 1 },
  ])
  // Historical snapshots lose `script` / `script_other` and carry the migrated script tag claim, ready to revert.
  const snaps = (raw.query('SELECT entry_id, snapshot FROM revisions ORDER BY id').all() as { entry_id: number; snapshot: string }[])
  for (const row of snaps) {
    const parsed = JSON.parse(row.snapshot)
    expect(parsed).not.toHaveProperty('script')
    expect(parsed).not.toHaveProperty('script_other')
    expect(entrySnapshot(row.snapshot)).not.toBeNull()
  }
  expect(entrySnapshot(snaps[0].snapshot)!.claims.map(c => c.value)).toEqual(['han'])
  expect(entrySnapshot(snaps[1].snapshot)!.claims.map(c => c.value)).toEqual(['nom'])
  expect(entrySnapshot(snaps[2].snapshot)!.claims.map(c => c.value)).toEqual(['臺灣方音符號'])
  expect(entrySnapshot(snaps[3].snapshot)!.claims).toEqual([])
  raw.close()
})
