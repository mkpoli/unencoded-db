import { expect, test } from 'bun:test'
import { newClaim, type Claim } from '$lib/claims'
import { addSighting, createEntry, getEntry, mergeEntry, setHidden, type EntryFields, type SightingFields, type StoredImage } from './entries'
import { createPerson } from './people'
import { relatedClaimsStatements, relatedPicturesStatement, relatedRecords, relatedTilesStatement, RELATED_PICTURES } from './related-records'
import { openTestDb } from './testdb'

const seen = (place: string, more: Partial<SightingFields> = {}): SightingFields => ({ place, url: null, title: null, author: null, publisher: null, report_date: null, container: null, source_kind: null, vias: [], original_date: null, page: null, contexts: null, style: null, types: null, quotes: null, note: null, ...more })
const picture = (name: string): StoredImage => ({ image_key: `${name}.webp`, image_type: 'image/webp', image_w: 10, image_h: 10, thumb_key: `${name}-t.webp`, box: null })
const record = (claims: Claim[]): EntryFields => ({ script: 'han', script_other: null, description: null, radical: null, strokes: null, claims })
const relation = (character: string, relationship: string) => newClaim('relation', character, { relationship })

async function fixture() {
  const { db, raw } = openTestDb()
  const who = { actor: (await createPerson(db)).id, ip: null }
  const related = async (id: number) => relatedRecords(db, id, (await getEntry(db, id))!.claims)
  return { db, raw, who, related }
}

test('a record shows the records its relations name and the ones that name it, with their first pictures', async () => {
  const { db, who, related } = await fixture()
  const grass = await createEntry(db, record([newClaim('ids', '⿱艹雚'), relation('⿱𥫗雚', 'variant'), relation('U+89C0', 'variant'), relation('⿰木木', 'similar')]), seen('grass', { title: 'A rhyme book', original_date: '1550' }), [picture('g')], who)
  const bamboo = await createEntry(db, record([newClaim('ids', '⿱𥫗雚')]), seen('bamboo'), [picture('b1'), picture('b2')], who)
  for (let n = 0; n < RELATED_PICTURES; n++) await addSighting(db, bamboo, seen(`bamboo ${n}`), n ? [picture(`more${n}`)] : [], who)
  const encoded = await createEntry(db, record([newClaim('ids', '⿰雚見'), newClaim('encoding', 'u+89c0', { charset: 'unicode' })]), seen('encoded'), [], who)
  await createEntry(db, record([newClaim('ids', '⿰亻木'), newClaim('encoding', 'U+89C0', { charset: 'a font' })]), seen('unrelated'), [picture('u')], who)

  const fromGrass = await related(grass)
  expect(fromGrass.map(item => [item.tile.id, item.relationships, item.stated])).toEqual([[bamboo, ['variant'], []], [encoded, ['variant'], []]])
  // The first picture of each of the first sightings; a sighting without one takes its place and shows nothing.
  expect(fromGrass[0].pictures.map(item => item.thumb_key)).toEqual(['b1-t.webp', 'more1-t.webp', 'more2-t.webp'])
  expect(fromGrass[1].pictures).toEqual([])

  const fromBamboo = await related(bamboo)
  expect(fromBamboo.map(item => [item.tile.id, item.relationships, item.stated])).toEqual([[grass, [], ['variant']]])
  expect(fromBamboo[0].pictures).toEqual([{ sighting: 1, thumb_key: 'g-t.webp', place: 'grass', title: 'A rhyme book', date: '1550' }])
  expect((await related(encoded)).map(item => item.tile.id)).toEqual([grass])
})

test('a relation names a record by its code, from either side, and follows a merge', async () => {
  const { db, who, related } = await fixture()
  const a = await createEntry(db, record([newClaim('ids', '⿱艹雚')]), seen('a'), [picture('a')], who)
  const b = await createEntry(db, record([newClaim('ids', '⿱𥫗雚'), relation('R+0001', 'variant'), relation('R+0002', 'similar'), relation('R+0009', 'similar')]), seen('b'), [picture('b')], who)
  expect((await related(b)).map(item => [item.tile.id, item.relationships, item.stated])).toEqual([[a, ['variant'], []]])
  expect((await related(a)).map(item => [item.tile.id, item.relationships, item.stated])).toEqual([[b, [], ['variant']]])
  const kept = await createEntry(db, record([newClaim('ids', '⿱艹雚')]), seen('kept'), [], who)
  const last = await createEntry(db, record([newClaim('ids', '⿱艹雚')]), seen('last'), [], who)
  await mergeEntry(db, a, kept, who, null)
  await mergeEntry(db, kept, last, who, null)
  expect((await related(b)).map(item => [item.tile.id, item.named])).toEqual([[last, [a]]])
  await setHidden(db, { entry: last }, true, who, null)
  expect(await related(b)).toEqual([])
})

test('hidden records and hidden sightings are left out, and a record without relations reads nothing', async () => {
  const { db, raw, who, related } = await fixture()
  const a = await createEntry(db, record([newClaim('ids', '⿱艹雚'), relation('⿱𥫗雚', 'variant')]), seen('a'), [picture('a')], who)
  const b = await createEntry(db, record([newClaim('ids', '⿱𥫗雚')]), seen('b'), [picture('b')], who)
  const second = (await addSighting(db, b, seen('b again'), [picture('b2')], who))!
  await setHidden(db, { entry: b, sighting: second }, true, who, null)
  expect((await related(a))[0].pictures.map(item => item.thumb_key)).toEqual(['b-t.webp'])
  await setHidden(db, { entry: b }, true, who, null)
  expect(await related(a)).toEqual([])
  raw.exec('DELETE FROM claims')
  expect(await relatedRecords(db, a, [])).toEqual([])
})

test('the reads use their indexes and no temporary sort', async () => {
  const { db, raw } = await fixture()
  const plan = (statement: unknown) => { const { sql, values } = statement as { sql: string; values: unknown[] }; return (raw.query(`EXPLAIN QUERY PLAN ${sql}`).all(...(values as never[])) as { detail: string }[]).map(row => row.detail) }
  const claims = relatedClaimsStatements(db, ['⿱𥫗雚', '觀'], ['⿱艹雚', 'U+89C0']).map(plan)
  const plans = [...claims, plan(relatedTilesStatement(db, [1, 2])), plan(relatedPicturesStatement(db, [1, 2]))]
  expect(claims).toHaveLength(3)
  for (const details of plans) {
    expect(details.join('\n')).not.toMatch(/TEMP B-TREE/)
    for (const detail of details) expect(detail).not.toMatch(/^SCAN (?!.*USING)/)
  }
  for (const details of claims) { expect(details.join('\n')).toContain('claims_by_value (kind=? AND value=?'); expect(details.join('\n')).toMatch(/SEARCH e USING INTEGER PRIMARY KEY/) }
})

test('without its index the lookup by value scans the claims', async () => {
  const { db, raw } = await fixture()
  raw.exec('DROP INDEX claims_by_value')
  const { sql, values } = relatedClaimsStatements(db, ['⿱𥫗雚'], [])[0] as unknown as { sql: string; values: unknown[] }
  expect((raw.query(`EXPLAIN QUERY PLAN ${sql}`).all(...(values as never[])) as { detail: string }[]).map(row => row.detail).join('\n')).toMatch(/SCAN k\b/)
})
