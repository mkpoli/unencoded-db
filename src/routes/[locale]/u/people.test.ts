import { expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { newClaim } from '$lib/claims'
import { createEntry, editEntry, setHidden, type EntryFields, type SightingFields } from '$lib/server/entries'
import { contributorsStatement, createPerson, joinAtlas, PEOPLE_PAGES, startSession } from '$lib/server/people'
import { d1Over, openTestDb } from '$lib/server/testdb'
import { load } from './+page.server'

const fields: EntryFields = { script: 'han', script_other: null, description: null, radical: null, strokes: null, claims: [newClaim('ids', '⿰木木')] }
const sighting: SightingFields = { place: 'Source', url: null, title: null, author: null, publisher: null, report_date: null, container: null, vias: [], original_date: null, page: null, contexts: null, style: null, types: null, quotes: null, note: null }
const list = async (db: D1Database, query = '') => await load({ params: { locale: 'en' }, url: new URL(`http://localhost/en/u${query}`), platform: { env: { DB: db } } } as any) as any
const who = (person: { id: string }) => ({ actor: person.id, ip: null })
const shown = async (db: D1Database) => (await list(db)).people.map((person: any) => [person.name, person.changes])

test('people are listed by how many changes they made, without those who made none', async () => {
  const { db } = openTestDb()
  const first = await createPerson(db, null, 'First'), second = await createPerson(db, null, 'Second')
  await createPerson(db, null, 'Reader')
  const id = await createEntry(db, fields, sighting, [], who(first))
  await editEntry(db, id, 1, { ...fields, description: 'Later' }, who(second), null)
  expect(await shown(db)).toEqual([['First', 2], ['Second', 1]])
})

test('an anonymous person\'s changes count for the account they sign in to, before and after', async () => {
  const { db } = openTestDb()
  const account = await createPerson(db, 'atlas-1', 'Named'), anon = await createPerson(db)
  const id = await createEntry(db, fields, sighting, [], who(anon))
  await joinAtlas(db, anon, 'atlas-1', 'Named', await startSession(db, anon.id))
  expect(await shown(db)).toEqual([['Named', 2]])
  await editEntry(db, id, 1, { ...fields, description: 'Later' }, who(anon), null)
  expect(await shown(db)).toEqual([['Named', 3]])
})

test('the banned, the maintenance account and those with only hidden changes are left out', async () => {
  const { db, raw } = openTestDb()
  const spammer = await createPerson(db, null, 'Spam'), banned = await createPerson(db, null, 'Banned')
  const maintenance = await createPerson(db, null, 'Catalogue maintenance'), moderator = await createPerson(db, null, 'Moderator')
  const hidden = await createEntry(db, fields, sighting, [], who(spammer))
  for (const person of [banned, maintenance, moderator]) await createEntry(db, fields, sighting, [], who(person))
  raw.query("UPDATE people SET banned_at = '2026' WHERE id = ?").run(banned.id)
  await setHidden(db, { entry: hidden }, true, who(moderator), null)
  expect(await shown(db)).toEqual([['Moderator', 3]])
})

test('the page number is bounded', async () => {
  const { db } = openTestDb()
  for (const query of ['?page=0', '?page=x', '?page=2', `?page=${PEOPLE_PAGES + 1}`]) await expect(list(db, query)).rejects.toMatchObject({ status: 404 })
  expect((await list(db)).people).toEqual([])
})

test('the list is read from its index and checks each person\'s changes by key', () => {
  const plan = (index: boolean) => {
    const { db, raw } = openTestDb()
    if (!index) raw.exec('DROP INDEX people_by_changes')
    const statement = contributorsStatement(db, 1) as unknown as { sql: string; values: unknown[] }
    return (raw.query(`EXPLAIN QUERY PLAN ${statement.sql}`).all(...(statement.values as never[])) as { detail: string }[]).map(row => row.detail).join('\n')
  }
  expect(plan(true)).toMatch(/p USING INDEX people_by_changes/)
  expect(plan(true)).toMatch(/SEARCH r USING INDEX revisions_by_actor/)
  expect(plan(true)).not.toMatch(/TEMP B-TREE FOR ORDER BY|SCAN (r|e|s|a)(\s|$)/)
  expect(plan(false)).toMatch(/TEMP B-TREE FOR ORDER BY/)
})

test('the migration counts the changes already made', async () => {
  const migrations = join(import.meta.dir, '../../../../migrations')
  const names = readdirSync(migrations).filter(name => name.endsWith('.sql')).sort()
  const raw = new Database(':memory:')
  for (const name of names.filter(name => name < '0048')) raw.exec(readFileSync(join(migrations, name), 'utf8'))
  raw.exec(`INSERT INTO people(id, name, created_at) VALUES ('account', 'Account', '2026'), ('quiet', 'Quiet', '2026');
    INSERT INTO people(id, name, merged_into, created_at) VALUES ('anon', 'anon-1', 'account', '2026');
    INSERT INTO entries(id, script, created_by, created_at, updated_at) VALUES (1, 'han', 'anon', '2026', '2026');
    INSERT INTO revisions(entry_id, kind, rev, snapshot, actor, at) VALUES (1, 'create', 1, '{}', 'anon', '2026'), (1, 'edit', 2, '{}', 'account', '2026')`)
  for (const name of names.filter(name => name >= '0048')) raw.exec(readFileSync(join(migrations, name), 'utf8'))
  expect(raw.query('SELECT id, changes FROM people ORDER BY id').all()).toEqual([{ id: 'account', changes: 2 }, { id: 'anon', changes: 0 }, { id: 'quiet', changes: 0 }])
  expect(await shown(d1Over(raw) as any)).toEqual([['Account', 2]])
})
