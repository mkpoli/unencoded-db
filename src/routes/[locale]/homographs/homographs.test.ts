import { expect, test } from 'bun:test'
import { newClaim, type Claim } from '$lib/claims'
import { recordCode } from '$lib/code'
import { addSighting, createEntry, mergeEntry, setHidden, type EntryFields, type SightingFields, type StoredImage } from '$lib/server/entries'
import {
  HOMOGRAPH_PAGE,
  HOMOGRAPH_SIGHTINGS,
  encodedEntriesStatement,
  homographClaimsStatement,
  homographEntriesStatement,
  homographSeedsStatement,
  homographSightingsStatement,
  homographsByEntryStatement,
  homographsByValueStatement,
  idsEntriesStatement,
  mergedIntoStatement,
  parseHomographCursor,
  resolveMergedCodesStatement,
  type HomographGroup,
} from '$lib/server/homographs'
import { createPerson } from '$lib/server/people'
import { openTestDb } from '$lib/server/testdb'
import { load } from './+page.server'

const fields = (claims: Claim[], script = 'han', script_other: string | null = null): EntryFields => ({
  script, script_other, description: null, radical: null, strokes: null, claims,
})
const seen = (place = 'A dictionary', more: Partial<SightingFields> = {}): SightingFields => ({
  place, url: null, title: null, author: null, publisher: null, report_date: null, container: null, source_kind: null,
  vias: [], original_date: null, page: null, contexts: null, style: null, types: null, note: null, quotes: null, ...more,
})
const picture = (name: string): StoredImage => ({
  image_key: `${name}.webp`, image_type: 'image/webp', image_w: 100, image_h: 100, thumb_key: `${name}-t.webp`, box: null,
})
const homograph = (value: string) => newClaim('relation', value, { relationship: 'homograph' })

async function fixture() {
  const { db, raw } = openTestDb()
  const person = await createPerson(db)
  const who = { actor: person.id, ip: null }
  const open = async (query = '') => await load({
    url: new URL(`https://example.test/en/homographs${query}`),
    params: { locale: 'en' },
    locals: {},
    platform: { env: { DB: db } },
  } as never) as { groups: HomographGroup[]; next: string | null; glyphs: Record<number, string> }
  return { db, raw, who, open }
}

test('groups encoded-character homographs side by side, including encoded records and single-record counterparts', async () => {
  const { db, who, open } = await fixture()
  // Two unencoded records pointing to 厼 (Mulam "father" and Bouyei classifier)
  const mulam = await createEntry(
    db,
    fields([
      newClaim('ids', '⿱ム大'),
      newClaim('reading', 'pɔ²', { doculect: 'Mulam' }),
      newClaim('meaning', 'father'),
      homograph('厼'),
    ], 'other', 'Mulam'),
    seen('Mulam glossary', { title: 'Mulam Dictionary', author: 'Wang', report_date: '1988', page: 'p. 42' }),
    [picture('mulam')],
    who,
  )
  const bouyei = await createEntry(
    db,
    fields([
      newClaim('ids', '⿱ム大'),
      newClaim('reading', 'kaːm³', { doculect: 'za' }),
      newClaim('meaning', 'classifier'),
      homograph('U+53BC'),
    ], 'bouyei'),
    seen('Bouyei primer', { title: 'Bouyei Songs', original_date: '1956', url: 'https://example.test/bouyei' }),
    [picture('bouyei')],
    who,
  )

  // Encoded record for 𠂤 (U+200A4) + a homograph record pointing to it
  const encodedRec = await createEntry(
    db,
    fields([newClaim('encoding', 'U+200A4', { charset: 'unicode' }), newClaim('meaning', 'mound')], 'han'),
    seen('Shuowen'),
    [],
    who,
  )
  const homographRec = await createEntry(
    db,
    fields([newClaim('meaning', 'variant use'), homograph('𠂤')], 'nom'),
    seen('Nom lexicon'),
    [],
    who,
  )

  // Single record homograph of encoded character 乚 (no DB record for 乚)
  const solo = await createEntry(
    db,
    fields([newClaim('reading', 'yat', { doculect: 'yue' }), newClaim('meaning', 'hook'), homograph('乚')], 'han'),
    seen('Cantonese sign'),
    [],
    who,
  )

  // Self-referencing encoded record (should NOT appear)
  await createEntry(
    db,
    fields([newClaim('encoding', 'U+4E00', { charset: 'unicode' }), homograph('一')], 'han'),
    seen('Self only'),
    [],
    who,
  )

  const page = await open()
  expect(page.next).toBeNull()
  expect(page.groups).toHaveLength(3)

  const byChar = new Map(page.groups.map(group => [group.encoded?.char, group]))
  const g1 = byChar.get('厼')!
  expect(g1.encoded).toEqual({ char: '厼', codePoint: 'U+53BC', hasRecord: false })
  expect(g1.records.map(r => r.id)).toEqual([mulam, bouyei])
  expect(g1.records[0]).toMatchObject({
    script: 'other',
    script_other: 'Mulam',
    readings: [{ value: 'pɔ²', doculect: 'Mulam' }],
    doculects: ['Mulam'],
    meanings: ['father'],
    sightingCount: 1,
    sightings: [{ place: 'Mulam glossary', title: 'Mulam Dictionary', author: 'Wang', report_date: '1988', page: 'p. 42', thumb_key: 'mulam-t.webp' }],
  })
  expect(g1.records[1]).toMatchObject({
    script: 'bouyei',
    readings: [{ value: 'kaːm³', doculect: 'za' }],
    doculects: ['za'],
    meanings: ['classifier'],
    sightings: [{ place: 'Bouyei primer', title: 'Bouyei Songs', original_date: '1956', url: 'https://example.test/bouyei', thumb_key: 'bouyei-t.webp' }],
  })

  const g2 = byChar.get('𠂤')!
  expect(g2.encoded).toEqual({ char: '𠂤', codePoint: 'U+200A4', hasRecord: true })
  expect(g2.records.map(r => r.id)).toEqual([encodedRec, homographRec])
  expect(g2.records[0].unicodeCodes).toEqual(['U+200A4'])

  const g3 = byChar.get('乚')!
  expect(g3.encoded).toEqual({ char: '乚', codePoint: 'U+4E5A', hasRecord: false })
  expect(g3.records.map(r => r.id)).toEqual([solo])
})

test('groups record-to-record and IDS homographs, follows merges, and excludes hidden or merged records', async () => {
  const { db, who, open } = await fixture()
  // Transitive record-to-record: a -> b (merged into keeper), c -> a
  const keeper = await createEntry(db, fields([newClaim('ids', '⿰木木'), newClaim('meaning', 'forest')], 'han'), seen('Keeper'), [], who)
  const merged = await createEntry(db, fields([newClaim('ids', '⿰木木')], 'han'), seen('Merged'), [], who)
  await mergeEntry(db, merged, keeper, who, null)
  const a = await createEntry(db, fields([newClaim('ids', '⿰木木'), newClaim('meaning', 'tree'), homograph(recordCode(merged))], 'sawndip'), seen('Sawndip book'), [], who)
  const c = await createEntry(db, fields([newClaim('ids', '⿰木木'), newClaim('meaning', 'wood'), homograph(recordCode(a))], 'nom'), seen('Nom book'), [], who)

  // Hidden target is excluded
  const hiddenTarget = await createEntry(db, fields([newClaim('ids', '⿱山東')], 'han'), seen('Hidden target'), [], who)
  await setHidden(db, { entry: hiddenTarget }, true, who, null)
  await createEntry(db, fields([newClaim('ids', '⿱山東'), homograph(recordCode(hiddenTarget))], 'han'), seen('Points to hidden'), [], who)

  // IDS homograph
  const idsA = await createEntry(db, fields([newClaim('ids', '⿰山東'), newClaim('meaning', 'east hill')], 'han'), seen('Hill'), [], who)
  const idsB = await createEntry(db, fields([newClaim('meaning', 'unrelated'), homograph('⿰山東')], 'bai'), seen('Bai'), [], who)

  // Unmatched IDS homograph (only 1 record -> excluded)
  await createEntry(db, fields([homograph('⿰水火')], 'han'), seen('Lonely IDS'), [], who)

  const page = await open()
  expect(page.groups).toHaveLength(2)
  const idsGroup = page.groups.find(group => group.formIds === '⿰山東')!
  expect(idsGroup.encoded).toBeNull()
  expect(idsGroup.records.map(r => r.id)).toEqual([idsA, idsB])

  const recGroup = page.groups.find(group => group.formIds === '⿰木木')!
  expect(recGroup.encoded).toBeNull()
  expect(recGroup.records.map(r => r.id)).toEqual([keeper, a, c])

  // Hiding one member of a 2-record group removes the group
  await setHidden(db, { entry: idsB }, true, who, null)
  expect((await open()).groups.map(group => group.formIds)).toEqual(['⿰木木'])
})

test('caps displayed sightings per record while preserving total visible sighting count', async () => {
  const { db, who, open } = await fixture()
  const a = await createEntry(db, fields([homograph('厼')], 'han'), seen('S1'), [picture('p1')], who)
  for (let i = 2; i <= HOMOGRAPH_SIGHTINGS + 2; i++) {
    await addSighting(db, a, seen(`S${i}`), [picture(`p${i}`)], who)
  }
  const hiddenId = (await addSighting(db, a, seen('Hidden'), [], who))!
  await setHidden(db, { entry: a, sighting: hiddenId }, true, who, null)

  const [group] = (await open()).groups
  expect(group.records[0].sightingCount).toBe(HOMOGRAPH_SIGHTINGS + 2)
  expect(group.records[0].sightings).toHaveLength(HOMOGRAPH_SIGHTINGS)
  expect(group.records[0].sightings.map(s => s.place)).toEqual(['S1', 'S2', 'S3'])
})

test('paginates cleanly without duplicating multi-record groups and rejects malformed cursors with 404', async () => {
  const { db, who, open } = await fixture()
  const chars = [...'一丁七万丈三上下不与丐丑专且世丘丙业丛东丝丞丢两严丧个中丰串临丸丹为主']
  // Create HOMOGRAPH_PAGE + 3 distinct encoded-character groups, each with 2 records spaced apart
  for (let i = 0; i < HOMOGRAPH_PAGE + 3; i++) {
    await createEntry(db, fields([homograph(chars[i]), newClaim('meaning', `first ${i}`)], 'han'), seen(`A${i}`), [], who)
  }
  for (let i = 0; i < HOMOGRAPH_PAGE + 3; i++) {
    await createEntry(db, fields([homograph(chars[i]), newClaim('meaning', `second ${i}`)], 'nom'), seen(`B${i}`), [], who)
  }

  const first = await open()
  expect(first.groups).toHaveLength(HOMOGRAPH_PAGE)
  expect(first.next).not.toBeNull()

  const second = await open(`?after=${first.next}`)
  expect(second.groups).toHaveLength(3)
  expect(second.next).toBeNull()

  const allChars = [...first.groups, ...second.groups].map(group => group.encoded?.char)
  expect(new Set(allChars).size).toBe(HOMOGRAPH_PAGE + 3)
  expect([...first.groups, ...second.groups].every(group => group.records.length === 2)).toBe(true)

  for (const bad of ['', 'x', '1', '0.1', '1.0', '1.2.3', '-1.2']) {
    await expect(open(`?after=${bad}`)).rejects.toMatchObject({ status: 404 })
  }
  expect(parseHomographCursor('12.34')).toEqual({ entry: 12, id: 34 })
})

test('every SQL statement uses an index with zero TEMP B-TREE and zero unindexed SCAN', async () => {
  const { db, raw } = await fixture()
  const statements = [
    homographSeedsStatement(db, null),
    homographSeedsStatement(db, { entry: 50, id: 10 }),
    homographsByValueStatement(db, ['厼', 'R+0001']),
    homographsByEntryStatement(db, [1, 2]),
    resolveMergedCodesStatement(db, [1, 2]),
    mergedIntoStatement(db, [1, 2]),
    encodedEntriesStatement(db, ['U+53BC', 'u+53bc']),
    idsEntriesStatement(db, ['⿰山東']),
    homographEntriesStatement(db, [1, 2]),
    homographClaimsStatement(db, [1, 2]),
    homographSightingsStatement(db, [1, 2]),
  ]

  for (const statement of statements) {
    const { sql, values } = statement as unknown as { sql: string; values: unknown[] }
    const details = (raw.query(`EXPLAIN QUERY PLAN ${sql}`).all(...(values as never[])) as { detail: string }[]).map(row => row.detail)
    const plan = details.join('\n')
    expect(plan).not.toMatch(/TEMP B-TREE/)
    for (const detail of details) {
      expect(detail).not.toMatch(/^SCAN (?!j VIRTUAL|json_each VIRTUAL|n$|p$|parts$|.*USING)/)
    }
    expect(plan).toMatch(/claims_homograph|claims_by_value|claims_by_entry|entries_merged|sightings_visible_export|PRIMARY KEY/)
  }
})

test('dropping claims_homograph breaks the indexed seed plan and forces a full scan without the index', async () => {
  const { db, raw } = await fixture()
  const { sql, values } = homographSeedsStatement(db, null) as unknown as { sql: string; values: unknown[] }
  const { sql: byValueSql, values: byValueVals } = homographsByValueStatement(db, ['厼']) as unknown as { sql: string; values: unknown[] }
  raw.exec('DROP INDEX claims_homograph; DROP INDEX claims_homograph_by_value')
  // With INDEXED BY, SQLite rejects both queries once the partial indexes are gone.
  expect(() => raw.query(`EXPLAIN QUERY PLAN ${sql}`).all(...(values as never[]))).toThrow(/no such index: claims_homograph/)
  expect(() => raw.query(`EXPLAIN QUERY PLAN ${byValueSql}`).all(...(byValueVals as never[]))).toThrow(/no such index: claims_homograph_by_value/)
  // Even without INDEXED BY, SQLite falls back to a full scan or temp sort without claims_homograph.
  const unhinted = sql.replace('INDEXED BY claims_homograph', '')
  const plan = (raw.query(`EXPLAIN QUERY PLAN ${unhinted}`).all(...(values as never[])) as { detail: string }[]).map(row => row.detail).join('\n')
  expect(plan).toMatch(/SCAN c\b|TEMP B-TREE/)
})

test('expands multi-hop chains across pages, exposes totalRecords above the cap, and bounds hidden-claim reads', async () => {
  const { db, raw, who, open } = await fixture()
  // Chain: 5 -> 4 -> 3 -> 2 -> 1 (5 records linked transitively by R+ code).
  const ids: number[] = []
  for (let i = 0; i < 5; i++) {
    const claims: Claim[] = [newClaim('meaning', `chain ${i + 1}`)]
    if (i > 0) claims.push(homograph(recordCode(ids[i - 1])))
    ids.push(await createEntry(db, fields(claims, 'han'), seen(`C${i + 1}`), [], who))
  }
  const page = await open()
  const chainGroup = page.groups.find(g => g.records.some(r => r.id === ids[4]))
  expect(chainGroup?.records.map(r => r.id)).toEqual(ids)

  // Group with 13 records reports totalRecords = 13 while capping shown rows at HOMOGRAPH_GROUP_MAX (12).
  for (let i = 0; i < 13; i++) {
    await createEntry(db, fields([homograph('厼'), newClaim('meaning', `m${i}`)], 'han'), seen(`M${i}`), [], who)
  }
  const bigPage = await open()
  const big = bigPage.groups.find(g => g.encoded?.char === '厼')
  expect(big?.records.length).toBe(12)
  expect(big?.totalRecords).toBe(13)

  // Seed statement returns at most limit rows even when all matching claims belong to hidden entries.
  raw.exec("INSERT INTO entries(id, script, created_by, created_at, updated_at, hidden_at) VALUES (9001, 'han', (SELECT id FROM people LIMIT 1), '2026', '2026', '2026')")
  raw.exec("INSERT INTO claims(entry_id, position, key, kind, value, data) VALUES (9001, 0, 'hid00001', 'relation', '木', '{\"relationship\":\"homograph\"}')")
  const { results } = await homographSeedsStatement(db, null, 1).all<{ entry_id: number; visible: number }>()
  expect(results).toEqual([expect.objectContaining({ entry_id: 9001, visible: 0 })])
})
