import { expect, test } from 'bun:test'
import { newClaim } from '$lib/claims'
import { addComment, setCommentHidden } from './comments'
import { addSighting, createEntry, editEntry, editSighting, getEntry, getSighting, mergeEntry, setHidden, type EntryFields, type SightingFields } from './entries'
import { latestNotice, markRead, notificationsOf, thank, thankedOf, unreadCount } from './notifications'
import { createPerson, joinAtlas, startSession } from './people'
import { openTestDb } from './testdb'
import { Database } from 'bun:sqlite'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { d1Over } from './testdb'

const fields = (ids: string): EntryFields => ({ script: 'han', script_other: null, description: null, radical: null, strokes: null, claims: [newClaim('ids', ids)] })
const sighting: SightingFields = { place: 'Source', url: null, title: null, author: null, publisher: null, report_date: null, container: null, source_kind: null, vias: [], original_date: null, page: null, contexts: null, style: null, types: null, quotes: null, note: null }

async function scene() {
  const { db, raw } = openTestDb()
  const recorder = await createPerson(db), second = await createPerson(db), reader = await createPerson(db)
  const who = (person: { id: string }) => ({ actor: person.id, ip: null })
  const entry = await createEntry(db, fields('⿰山東'), sighting, [], who(recorder))
  const kinds = async (person: { id: string }) => (await notificationsOf(db, person.id)).notifications.map(notice => notice.kind)
  return { db, raw, recorder, second, reader, who, entry, kinds }
}

test('recording a character tells nobody, and new evidence tells its recorder', async () => {
  const { db, recorder, second, who, entry, kinds } = await scene()
  expect(await unreadCount(db, recorder.id)).toBe(0)
  await addSighting(db, entry, { ...sighting, place: 'Another book' }, [], who(second))
  expect(await kinds(recorder)).toEqual(['sighting'])
  expect(await kinds(second)).toEqual([])
  expect((await notificationsOf(db, recorder.id)).notifications[0]).toMatchObject({ entry_id: entry, by_id: second.id, read_at: null })
})

test('an edit tells everyone with evidence on the record except its writer', async () => {
  const { db, recorder, second, reader, who, entry, kinds } = await scene()
  await addSighting(db, entry, { ...sighting, place: 'Another book' }, [], who(second))
  await markRead(db, recorder.id, await latestNotice(db, recorder.id))
  const found = (await getEntry(db, entry))!
  expect((await editEntry(db, entry, found.entry.rev, { ...fields('⿰山東'), description: 'checked' }, who(reader), 'gloss corrected')).ok).toBe(true)
  expect(await kinds(recorder)).toEqual(['edit', 'sighting'])
  expect(await kinds(second)).toEqual(['edit'])
  expect(await kinds(reader)).toEqual([])
  expect((await notificationsOf(db, second.id)).notifications[0].text).toBe('gloss corrected')
  expect(await unreadCount(db, recorder.id)).toBe(1)
})

test('a comment tells the recorder of its evidence and the discussion so far, and hiding it clears the count', async () => {
  const { db, recorder, second, reader, who, entry, kinds } = await scene()
  await addSighting(db, entry, { ...sighting, place: 'Another book' }, [], who(second))
  await markRead(db, recorder.id, await latestNotice(db, recorder.id))
  const first = await addComment(db, { entry, sighting: 1 }, 'Is this 觀?', who(reader))
  expect(await kinds(recorder)).toEqual(['comment', 'sighting'])
  expect(await kinds(second)).toEqual([])
  await addComment(db, { entry }, 'Checking.', who(recorder))
  expect(await kinds(reader)).toEqual(['comment'])
  expect(await kinds(second)).toEqual(['comment'])
  expect(await unreadCount(db, recorder.id)).toBe(1)
  await setCommentHidden(db, entry, first, true, recorder.id)
  expect(await unreadCount(db, recorder.id)).toBe(0)
  expect(await kinds(recorder)).toEqual(['sighting'])
})

test('a notice goes to the account an anonymous recorder joined', async () => {
  const { db, raw, recorder, reader, who, entry } = await scene()
  const account = await createPerson(db, 'sub', 'Account')
  raw.run('UPDATE people SET merged_into = ? WHERE id = ?', [account.id, recorder.id])
  await addComment(db, { entry }, 'hello', who(reader))
  expect(await unreadCount(db, account.id)).toBe(1)
  expect(await unreadCount(db, recorder.id)).toBe(0)
  await addComment(db, { entry }, 'my own', who(account))
  expect(await unreadCount(db, account.id)).toBe(1)
})

test('the badge count and the list read through their indexes', async () => {
  const { raw } = await scene()
  const plan = (sql: string, ...values: unknown[]) => (raw.query(`EXPLAIN QUERY PLAN ${sql}`).all(...(values as never[])) as { detail: string }[]).map(row => row.detail).join('\n')
  expect(plan('SELECT 1 FROM notifications WHERE person = ? AND read_at IS NULL LIMIT 100', 'p')).toContain('notifications_unread')
  const list = plan('SELECT n.id FROM notifications n LEFT JOIN comments c ON c.id = n.comment_id LEFT JOIN revisions r ON r.id = n.revision_id JOIN entries e ON e.id = COALESCE(c.entry_id, r.entry_id) WHERE n.person = ? AND n.id < ? AND c.hidden_at IS NULL AND e.hidden_at IS NULL ORDER BY n.id DESC LIMIT 51', 'p', 9)
  expect(list).toContain('notifications_by_person')
  expect(list).not.toContain('TEMP B-TREE')
  expect(list).not.toMatch(/SCAN (c|r|e)\b/)
})

test('changes made before notices existed are queued for the recorder', async () => {
  const raw = new Database(':memory:')
  const migrations = join(import.meta.dir, '../../../migrations')
  const names = readdirSync(migrations).sort()
  // The code under test writes the source and sighting columns and reads the tag aliases of today, so their migrations run first.
  const early = (name: string) => name < '0035' || name === '0041_source_container.sql' || name === '0045_tag_aliases.sql' || name === '0047_sighting_contexts.sql' || name === '0048_source_kind.sql' || name === '0054_source_keys.sql'
  for (const name of names.filter(early)) raw.exec(readFileSync(join(migrations, name), 'utf8'))
  const db = d1Over(raw)
  const recorder = await createPerson(db), second = await createPerson(db), maintenance = await createPerson(db, null, 'Catalogue maintenance')
  const who = (person: { id: string }) => ({ actor: person.id, ip: null })
  const entry = await createEntry(db, fields('⿰山東'), sighting, [], who(recorder))
  await Bun.sleep(2)
  const found = (await getEntry(db, entry))!
  await editEntry(db, entry, found.entry.rev, { ...fields('⿰山東'), description: 'own note' }, who(recorder), null)
  await editEntry(db, entry, found.entry.rev + 1, { ...fields('⿰山東'), description: 'swept' }, who(maintenance), null)
  await Bun.sleep(2)
  await addSighting(db, entry, { ...sighting, place: 'Another book' }, [], who(second))
  for (const name of names.filter(name => !early(name))) raw.exec(readFileSync(join(migrations, name), 'utf8'))
  expect((await notificationsOf(db, recorder.id)).notifications.map(notice => [notice.kind, notice.by_id, notice.read_at])).toEqual([['sighting', second.id, null]])
  expect(await unreadCount(db, second.id)).toBe(0)
})

test('a merge tells each recorder once, and reading stops at what the page held', async () => {
  const { db, recorder, second, reader, who, entry } = await scene()
  const other = await createEntry(db, fields('⿰山西'), sighting, [], who(second))
  expect((await mergeEntry(db, other, entry, who(reader), null)).ok).toBe(true)
  expect(await unreadCount(db, recorder.id)).toBe(1)
  expect(await unreadCount(db, second.id)).toBe(1)
  const held = await latestNotice(db, recorder.id)
  await addComment(db, { entry }, 'after the page was shown', who(reader))
  await markRead(db, recorder.id, held)
  expect(await unreadCount(db, recorder.id)).toBe(1)
})

test('an edit of evidence since hidden is not listed', async () => {
  const { db, recorder, second, who, entry, kinds } = await scene()
  await addSighting(db, entry, { ...sighting, place: 'Another book' }, [], who(recorder))
  const held = (await getSighting(db, 2))!
  expect((await editSighting(db, 2, held.rev, { ...sighting, place: 'Another book', note: 'x' }, null, who(second), 'private words', entry)).ok).toBe(true)
  expect(await kinds(recorder)).toEqual(['sighting_edit'])
  await setHidden(db, { entry, sighting: 2 }, true, who(second), null)
  expect(await kinds(recorder)).toEqual([])
})

test('a thank tells whoever made the change, once, and never for one of their own changes', async () => {
  const { db, raw, recorder, second, reader, who, entry, kinds } = await scene()
  const found = (await getEntry(db, entry))!
  expect((await editEntry(db, entry, found.entry.rev, { ...fields('⿰山東'), description: 'checked' }, who(second), 'gloss corrected')).ok).toBe(true)
  const edit = (raw.query("SELECT id FROM revisions WHERE kind = 'edit'").get() as { id: number }).id
  expect(await thank(db, entry, edit, who(second))).toBe(false)
  expect(await thank(db, entry + 1, edit, who(recorder))).toBe(false)
  expect(await thank(db, entry, edit, who(recorder))).toBe(true)
  expect(await thank(db, entry, edit, who(recorder))).toBe(true)
  expect(await kinds(second)).toEqual(['thank'])
  expect((await notificationsOf(db, second.id)).notifications[0]).toMatchObject({ entry_id: entry, by_id: recorder.id, text: 'gloss corrected', read_at: null })
  expect(await thankedOf(db, recorder.id, [edit, edit + 1])).toEqual([edit])
  expect(await thankedOf(db, second.id, [edit])).toEqual([])
  expect(await thank(db, entry, edit, { actor: reader.id, ip: 'address' })).toBe(true)
  expect(await thank(db, entry, edit, { actor: (await createPerson(db)).id, ip: 'address' })).toBe(true)
  expect(await unreadCount(db, second.id)).toBe(2)
})

test('the rebuilt table keeps the notices it held', async () => {
  const { raw } = openTestDb()
  const migrations = join(import.meta.dir, '../../../migrations')
  const names = readdirSync(migrations).filter(name => name.endsWith('.sql')).sort()
  const old = new Database(':memory:')
  for (const name of names.filter(name => name < '0049')) old.exec(readFileSync(join(migrations, name), 'utf8'))
  const db = d1Over(old)
  const recorder = await createPerson(db), second = await createPerson(db)
  const entry = await createEntry(db, fields('⿰山東'), sighting, [], { actor: recorder.id, ip: null })
  await addSighting(db, entry, { ...sighting, place: 'Another book' }, [], { actor: second.id, ip: null })
  await markRead(db, recorder.id, 1)
  const before = old.query('SELECT id, person, comment_id, revision_id, at, read_at FROM notifications').all()
  for (const name of names.filter(name => name >= '0049')) old.exec(readFileSync(join(migrations, name), 'utf8'))
  expect(before.length).toBe(1)
  expect(old.query('SELECT id, person, comment_id, revision_id, at, read_at FROM notifications').all()).toEqual(before)
  expect(old.query("SELECT name FROM sqlite_master WHERE type = 'trigger' ORDER BY name").all()).toEqual(raw.query("SELECT name FROM sqlite_master WHERE type = 'trigger' ORDER BY name").all())
})

test('thanks said before signing in join the account, except those for its own changes', async () => {
  const { db, raw, recorder, who, entry } = await scene()
  const account = await createPerson(db, 'atlas-1', 'Named'), anon = await createPerson(db)
  const found = (await getEntry(db, entry))!
  expect((await editEntry(db, entry, found.entry.rev, { ...fields('⿰山東'), description: 'checked' }, who(account), null)).ok).toBe(true)
  const edit = (raw.query("SELECT id FROM revisions WHERE kind = 'edit'").get() as { id: number }).id
  expect(await thank(db, entry, edit, who(anon))).toBe(true)
  expect(await thank(db, entry, 1, who(anon))).toBe(true)
  expect(await joinAtlas(db, anon, 'atlas-1', 'Named', await startSession(db, anon.id))).toBe(account.id)
  expect(await thankedOf(db, account.id, [1, edit])).toEqual([1])
  expect((await notificationsOf(db, account.id)).notifications.map(notice => notice.kind)).toEqual([])
  expect((await notificationsOf(db, recorder.id)).notifications.map(notice => [notice.kind, notice.by_id])).toEqual([['thank', account.id], ['edit', account.id]])
})
