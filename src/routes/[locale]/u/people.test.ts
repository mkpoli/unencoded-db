import { expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { newClaim } from '$lib/claims'
import { addSighting, createEntry, editEntry, editSighting, getEntry, getSighting, mergeEntry, setHidden, unmergeEntry, type EntryFields, type SightingFields } from '$lib/server/entries'
import { contributorsStatement, createPerson, joinAtlas, PEOPLE_PAGES, startSession } from '$lib/server/people'
import { d1Over, openTestDb } from '$lib/server/testdb'
import { load } from './+page.server'

const fields: EntryFields = { script: 'han', script_other: null, description: null, radical: null, strokes: null, claims: [newClaim('ids', '⿰木木')] }
const sighting: SightingFields = { place: 'Source', url: null, title: null, source_kind: null, author: null, publisher: null, report_date: null, container: null, vias: [], original_date: null, page: null, contexts: null, style: null, types: null, quotes: null, note: null }
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
  expect(await shown(db)).toEqual([['Moderator', 2]])
})

test('the page number is bounded', async () => {
  const { db } = openTestDb()
  for (const query of ['?page=0', '?page=x', '?page=2', `?page=${PEOPLE_PAGES + 1}`]) await expect(list(db, query)).rejects.toMatchObject({ status: 404 })
  expect((await list(db)).people).toEqual([])
})

test('the list is read from its index alone', () => {
  const plan = (index: boolean) => {
    const { db, raw } = openTestDb()
    if (!index) raw.exec('DROP INDEX people_by_changes')
    const statement = contributorsStatement(db, 1) as unknown as { sql: string; values: unknown[] }
    return (raw.query(`EXPLAIN QUERY PLAN ${statement.sql}`).all(...(statement.values as never[])) as { detail: string }[]).map(row => row.detail).join('\n')
  }
  expect(plan(true)).toBe('SEARCH p USING INDEX people_by_changes (changes>?)')
  expect(plan(false)).toMatch(/TEMP B-TREE FOR ORDER BY/)
})

test('a count reads only the changes of the record it concerns', () => {
  const { raw } = openTestDb()
  const plan = (where: string) => (raw.query(`EXPLAIN QUERY PLAN SELECT account, COUNT(*) FROM visible_revisions WHERE ${where} GROUP BY account`).all() as { detail: string }[]).map(row => row.detail).join('\n')
  expect(plan('id = 1')).toMatch(/SEARCH r USING INTEGER PRIMARY KEY/)
  for (const where of ['entry_id = 1', 'entry_id IN (1, 2)']) {
    expect(plan(where)).toMatch(/SEARCH r USING INDEX revisions_by_entry/)
    expect(plan(where)).not.toMatch(/SCAN/)
  }
})

test('the migration counts the changes already made', async () => {
  const migrations = join(import.meta.dir, '../../../../migrations')
  const names = readdirSync(migrations).filter(name => name.endsWith('.sql')).sort()
  const raw = new Database(':memory:')
  for (const name of names.filter(name => name < '0049')) raw.exec(readFileSync(join(migrations, name), 'utf8'))
  raw.exec(`INSERT INTO people(id, name, created_at) VALUES ('account', 'Account', '2026'), ('quiet', 'Quiet', '2026');
    INSERT INTO people(id, name, merged_into, created_at) VALUES ('anon', 'anon-1', 'account', '2026');
    INSERT INTO entries(id, script, created_by, created_at, updated_at) VALUES (1, 'han', 'anon', '2026', '2026');
    INSERT INTO revisions(entry_id, kind, rev, snapshot, actor, at) VALUES (1, 'create', 1, '{}', 'anon', '2026'), (1, 'edit', 2, '{}', 'account', '2026')`)
  for (const name of names.filter(name => name >= '0049')) raw.exec(readFileSync(join(migrations, name), 'utf8'))
  expect(raw.query('SELECT id, changes FROM people ORDER BY id').all()).toEqual([{ id: 'account', changes: 2 }, { id: 'anon', changes: 0 }, { id: 'quiet', changes: 0 }])
  expect(await shown(d1Over(raw) as any)).toEqual([['Account', 2]])
})

test('the count stays what a person\'s page shows through hiding, merging and signing in', async () => {
  const { db, raw } = openTestDb()
  const account = await createPerson(db, 'atlas-1', 'Named'), other = await createPerson(db, null, 'Other'), moderator = await createPerson(db, null, 'Moderator')
  const agrees = () => {
    const counted = raw.query('SELECT id, changes AS n FROM people WHERE changes <> 0 ORDER BY id').all()
    expect(counted).toEqual(raw.query('SELECT account AS id, COUNT(*) AS n FROM visible_revisions GROUP BY account ORDER BY account').all())
  }
  // A fixed sequence, so that a failure repeats.
  let seed = 7
  const pick = (n: number) => (seed = (seed * 1103515245 + 12345) % 2147483648) % n
  let anon = await createPerson(db)
  const entries: number[] = []
  const merged: number[] = []
  for (let step = 0; step < 400; step++) {
    const actor = who([account, other, anon][pick(3)])
    const id = entries.length ? entries[pick(entries.length)] : 0
    const found = id ? (await getEntry(db, id))! : null
    const evidence = found?.sightings.length ? found.sightings[pick(found.sightings.length)] : null
    const move = pick(9)
    if (!found || move === 0) entries.push(await createEntry(db, fields, sighting, [], actor))
    else if (move === 1) await editEntry(db, id, found.entry.rev, { ...fields, description: `step ${step}` }, actor, null)
    else if (move === 2) await addSighting(db, id, { ...sighting, place: `Step ${step}` }, [], actor)
    else if (move === 3 && evidence) { const held = (await getSighting(db, evidence.id))!; await editSighting(db, evidence.id, held.rev, { ...sighting, note: `step ${step}` }, null, actor, null, id) }
    else if (move === 4) await setHidden(db, { entry: id }, !found.entry.hidden_at, who(moderator), null)
    else if (move === 5 && evidence) await setHidden(db, { entry: id, sighting: evidence.id }, !evidence.hidden_at, who(moderator), null)
    else if (move === 6 && entries.length > 1) { const into = entries[pick(entries.length)]; if ((await mergeEntry(db, id, into, who(moderator), null)).ok) merged.push(id) }
    else if (move === 7 && merged.length) await unmergeEntry(db, merged[pick(merged.length)], who(moderator))
    else if (move === 8 && step % 5 === 0) { await joinAtlas(db, anon, 'atlas-1', 'Named', await startSession(db, anon.id)); anon = await createPerson(db) }
    agrees()
  }
  expect(merged.length).toBeGreaterThan(0)
  expect((raw.query("SELECT COUNT(DISTINCT kind) AS n FROM revisions").get() as { n: number }).n).toBe(8)
})
