import { expect, test } from 'bun:test'
import { openTestDb } from '$lib/server/testdb'
import { createEntry, mergeEntry, SEARCH_WINDOW, type EntryFields, type SightingFields } from '$lib/server/entries'
import { newClaim } from '$lib/claims'
import { createPerson } from '$lib/server/people'
import { GET } from './records/+server'

async function setup() {
  const { db } = openTestDb()
  const who = { actor: (await createPerson(db)).id, ip: null }
  const seen: SightingFields = { place: 'A shop sign', url: null, title: null, author: null, publisher: null, report_date: null, container: null, source_kind: null, vias: [], closeness: null, original_date: null, page: null, contexts: null, style: null, types: null, quotes: null, note: null }
  const record = (ids: string, meaning?: string): EntryFields => ({ script: 'han', script_other: null, description: null, radical: null, strokes: null, claims: [newClaim('ids', ids), ...(meaning ? [newClaim('meaning', meaning)] : [])] })
  const ask = async (q: string, exclude?: number, also: string[] = []) => {
    const url = new URL(`https://example.test/api/records?q=${encodeURIComponent(q)}${exclude ? `&exclude=${exclude}` : ''}${also.map(spelling => `&also=${encodeURIComponent(spelling)}`).join('')}`)
    const answer = await GET({ url, platform: { env: { DB: db } } } as any)
    return (await answer.json() as { id: number; ids: string | null }[]).map(found => found.id)
  }
  return { db, who, seen, record, ask }
}

test('finds records by description, part, meaning, number, code and address, leaving out the record it is on', async () => {
  const { db, who, seen, record, ask } = await setup()
  const a = await createEntry(db, record('⿱奏騒', 'title of a light novel'), seen, [], who)
  const b = await createEntry(db, record('⿱奏騒'), seen, [], who)
  const c = await createEntry(db, record('⿰氵⿱⿷主丶乃'), seen, [], who)
  expect(await ask('⿱奏騒', b)).toEqual([a])
  expect((await ask('騒')).toSorted()).toEqual([a, b])
  expect(await ask('light novel')).toEqual([a])
  expect(await ask(String(c))).toEqual([c])
  expect(await ask(`R+${c.toString(16).toUpperCase().padStart(4, '0')}`)).toEqual([c])
  expect(await ask(`https://example.test/en/entry/${c}`)).toEqual([c])
  expect(await ask('')).toEqual([])
  expect(await ask('x'.repeat(201))).toEqual([])
})

test('a merged record is not offered, by search or by its number', async () => {
  const { db, who, seen, record, ask } = await setup()
  const a = await createEntry(db, record('⿱奏騒'), seen, [], who)
  const b = await createEntry(db, record('⿱奏騒'), seen, [], who)
  await mergeEntry(db, b, a, who, null)
  expect(await ask('⿱奏騒')).toEqual([a])
  expect(await ask(String(b))).toEqual([])
})

test('finds a record older than the newest search window', async () => {
  const { db, who, seen, record, ask } = await setup()
  const old = await createEntry(db, record('⿱奏騒', 'title of a light novel'), seen, [], who)
  for (let made = 0; made < SEARCH_WINDOW + 10; made++) await createEntry(db, record('⿰木口'), seen, [], who)
  expect(await ask('light novel')).toEqual([old])
  expect(await ask('⿱奏騒')).toEqual([old])
})

test('finds parts under the other spellings the browser sends, newest first', async () => {
  const { db, who, seen, record, ask } = await setup()
  const written = await createEntry(db, record('⿱艹⿰日寺'), seen, [], who)
  const folded = await createEntry(db, record('⿰氵蒔'), seen, [], who)
  const typed = await createEntry(db, record('⿱艹時'), seen, [], who)
  expect(await ask('艹時')).toEqual([typed])
  expect(await ask('艹時', undefined, ['艹日寺', '蒔'])).toEqual([typed, folded, written])
  expect(await ask('艹時', typed, ['艹日寺', '蒔'])).toEqual([folded, written])
})
