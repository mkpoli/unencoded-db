import { Database } from 'bun:sqlite'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from 'bun:test'
import { isClaimKey, parseClaims, type Claim } from '$lib/claims'
import { getEntry, revertEntry } from './entries'
import { entrySnapshot, sightingSnapshot } from './revisions'
import { d1Over } from './testdb'

const migration = (name: string) => readFileSync(join(import.meta.dir, '../../../migrations', name), 'utf8')

test('a sighting snapshot written before 0002 is restorable after it', () => {
  const raw = new Database(':memory:')
  raw.exec(migration('0001_init.sql'))
  raw.exec("INSERT INTO people(id, name, created_at) VALUES ('p', 'Person', '2026')")
  raw.exec("INSERT INTO entries(script, created_by, created_at, updated_at) VALUES ('han', 'p', '2026', '2026')")
  const old = JSON.stringify({ place: 'A shop', url: null, title: 'Book', author: null, publisher: null, report_date: null, original_date: null, page: null, context: null, style: null, types: null, note: null, media: [] })
  expect(sightingSnapshot(old)).toBeNull()
  const insert = raw.prepare("INSERT INTO revisions(entry_id, sighting_id, kind, rev, snapshot, actor, at) VALUES (1, ?, ?, 1, ?, 'p', '2026')")
  raw.exec("INSERT INTO sightings(entry_id, first_entry, place, created_by, created_at, updated_at) VALUES (1, 1, 'A shop', 'p', '2026', '2026')")
  insert.run(1, 'sighting', old)
  insert.run(1, 'sighting_edit', old)
  insert.run(null, 'hide', '{}')
  insert.run(1, 'redact', '{"revision":1}')
  raw.exec(migration('0002_sighting_via.sql'))
  const rows = raw.query('SELECT kind, snapshot FROM revisions ORDER BY id').all() as { kind: string; snapshot: string }[]
  for (const row of rows.slice(0, 2)) expect(sightingSnapshot(row.snapshot)).toMatchObject({ place: 'A shop', title: 'Book', via_url: null, via_title: null, via_report_date: null })
  expect(rows.slice(2).map(row => row.snapshot)).toEqual(['{}', '{"revision":1}'])
})

test('0002 and 0003 together give an old sighting snapshot the via fields and array boxes', () => {
  const raw = new Database(':memory:')
  raw.exec(migration('0001_init.sql'))
  raw.exec("INSERT INTO people(id, name, created_at) VALUES ('p', 'Person', '2026')")
  raw.exec("INSERT INTO entries(script, created_by, created_at, updated_at) VALUES ('han', 'p', '2026', '2026')")
  raw.exec("INSERT INTO sightings(entry_id, first_entry, place, created_by, created_at, updated_at) VALUES (1, 1, 'A shop', 'p', '2026', '2026')")
  raw.exec("INSERT INTO sighting_media(sighting_id, position, image_key, image_type, image_w, image_h, thumb_key, box) VALUES (1, 0, 'a.webp', 'image/webp', 100, 80, 't.webp', '[1,2,10,10]'), (1, 1, 'b.webp', 'image/webp', 100, 80, 't2.webp', NULL)")
  const old = JSON.stringify({ place: 'A shop', url: null, title: 'Book', author: null, publisher: null, report_date: null, original_date: null, page: null, context: null, style: null, types: null, note: null, media: [{ image_key: 'a.webp', image_type: 'image/webp', image_w: 100, image_h: 80, thumb_key: 't.webp', box: '[1,2,10,10]' }, { image_key: 'b.webp', image_type: 'image/webp', image_w: 100, image_h: 80, thumb_key: 't2.webp', box: null }] })
  raw.prepare("INSERT INTO revisions(entry_id, sighting_id, kind, rev, snapshot, actor, at) VALUES (1, 1, 'sighting_edit', 1, ?, 'p', '2026')").run(old)
  raw.exec(migration('0002_sighting_via.sql'))
  raw.exec(migration('0003_media_boxes.sql'))
  const row = raw.query('SELECT snapshot FROM revisions').get() as { snapshot: string }
  expect(sightingSnapshot(row.snapshot)).toMatchObject({ place: 'A shop', via_url: null })
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
  const sighting = JSON.stringify({ place: 'A shop', url: null, title: null, author: null, publisher: null, report_date: null, via_url: null, via_title: null, via_author: null, via_publisher: null, via_report_date: null, original_date: null, page: null, context: null, style: null, types: null, note: null, media: [] })
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

test('0006 derives every record\'s status from its claims, with its tags, counts and past versions', () => {
  const raw = new Database(':memory:')
  for (const name of ['0001_init.sql', '0002_sighting_via.sql', '0003_media_boxes.sql', '0004_unify_relation.sql', '0005_claim_links.sql']) raw.exec(migration(name))
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

  raw.exec(migration('0006_derived_status.sql'))

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
