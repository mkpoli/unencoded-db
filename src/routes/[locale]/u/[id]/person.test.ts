import { expect, test } from 'bun:test'
import { newClaim } from '$lib/claims'
import { addSighting, createEntry, editEntry, getEntry, globalHistory, personRevisionsStatement, setHidden, type EntryFields, type SightingFields } from '$lib/server/entries'
import { agentsOf, agentsOfStatement, contributors, createPerson, joinAtlas, joinPerson, startSession } from '$lib/server/people'
import { thank } from '$lib/server/notifications'
import { openTestDb } from '$lib/server/testdb'
import { actions, load } from './+page.server'

const fields: EntryFields = { description: null, radical: null, strokes: null, claims: [newClaim('ids', '⿰木木')] }
const sighting: SightingFields = { place: 'Source', url: null, title: null, author: null, publisher: null, report_date: null, container: null, source_kind: null, vias: [], original_date: null, page: null, contexts: null, style: null, types: null, quotes: null, note: null }
const event = (db: D1Database, person: string, before?: string) => ({
  params: { locale: 'en', id: person },
  url: new URL(`http://localhost/en/u/${person}?flat=1${before === undefined ? '' : `&before=${before}`}`),
  platform: { env: { DB: db } },
  locals: { person: null },
}) as any

test('personal contributions list visible revisions with their old versions', async () => {
  const { db } = openTestDb()
  const first = await createPerson(db), second = await createPerson(db)
  const id = await createEntry(db, fields, sighting, [], { actor: first.id, ip: null })
  await editEntry(db, id, 1, { ...fields, description: 'Later' }, { actor: second.id, ip: null }, 'Corrected')
  await addSighting(db, id, { ...sighting, place: 'Second source' }, [], { actor: first.id, ip: null })

  const result = await load(event(db, first.id)) as any
  expect(result.person).toMatchObject({ id: first.id, name: first.name })
  expect(result.items.map((row: any) => row.kind)).toEqual(['sighting', 'sighting', 'create'])
  expect(result.items[0]).toMatchObject({ by_id: first.id, by_name: first.name, sightingFields: { ...sighting, place: 'Second source' } })
  expect(result.items[0]).not.toHaveProperty('snapshot')
  expect(result.items[2].fields).toEqual(fields)
  expect(result.older).toBeNull()

  const edits = await load(event(db, second.id)) as any
  expect(edits.items).toHaveLength(1)
  expect(edits.items[0]).toMatchObject({ kind: 'edit', fields: { ...fields, description: 'Later' }, summary: 'Corrected' })
})

test('personal contributions hide records and sightings a moderator hid', async () => {
  const { db } = openTestDb()
  const person = await createPerson(db)
  const id = await createEntry(db, fields, sighting, [], { actor: person.id, ip: null })
  const seen = (await db.prepare('SELECT id FROM sightings WHERE entry_id = ?').bind(id).first<{ id: number }>())!.id
  await setHidden(db, { entry: id, sighting: seen }, true, { actor: person.id, ip: null }, null)
  const withoutSighting = await load(event(db, person.id)) as any
  expect(withoutSighting.items.map((row: any) => row.kind)).toEqual(['create'])
  expect(withoutSighting.items.some((row: any) => row.sighting_id === seen)).toBe(false)
  await setHidden(db, { entry: id, sighting: seen }, false, { actor: person.id, ip: null }, null)
  expect((await load(event(db, person.id)) as any).items.map((row: any) => row.kind)).toEqual(['unhide', 'hide', 'sighting', 'create'])
  await setHidden(db, { entry: id }, true, { actor: person.id, ip: null }, null)
  expect((await load(event(db, person.id)) as any).items).toHaveLength(0)
})

test('personal contributions reject missing people and follow a merged person', async () => {
  const { db } = openTestDb()
  const first = await createPerson(db), second = await createPerson(db)
  await expect(load(event(db, '000000000000'))).rejects.toMatchObject({ status: 404 })
  await expect(load(event(db, 'not-a-person'))).rejects.toMatchObject({ status: 404 })
  await expect(load(event(db, first.id, '0'))).rejects.toMatchObject({ status: 404 })
  await db.prepare('UPDATE people SET merged_into = ? WHERE id = ?').bind(second.id, first.id).run()
  await expect(load(event(db, first.id))).rejects.toMatchObject({ status: 302, location: `/en/u/${second.id}` })
})

test('personal contributions page through a bounded revision range', async () => {
  const { db, raw } = openTestDb()
  const person = await createPerson(db)
  const id = await createEntry(db, fields, sighting, [], { actor: person.id, ip: null })
  const insert = raw.prepare("INSERT INTO revisions(entry_id,kind,rev,snapshot,actor,at) VALUES (?, 'edit', 1, ?, ?, '2026')")
  for (let i = 0; i < 65; i++) insert.run(id, JSON.stringify(fields), person.id)
  const first = await load(event(db, person.id)) as any
  expect(first.items).toHaveLength(60)
  expect(first.older).toBeNumber()
  const second = await load(event(db, person.id, String(first.older))) as any
  expect(second.items).toHaveLength(7)
  expect(second.older).toBeNull()
})

test('personal contributions keep the revision range on the actor index', () => {
  const { db, raw } = openTestDb()
  const statement = personRevisionsStatement(db, '0123456789ab') as unknown as { sql: string; values: unknown[] }
  const plan = raw.query(`EXPLAIN QUERY PLAN ${statement.sql}`).all(...(statement.values as never[])) as { detail: string }[]
  const details = plan.map(row => row.detail).join('\n')
  expect(details).toMatch(/SEARCH r USING INDEX revisions_by_actor/)
  expect(details).toMatch(/SEARCH e USING INTEGER PRIMARY KEY/)
  expect(details).toMatch(/SEARCH s USING INTEGER PRIMARY KEY/)
  expect(details).not.toMatch(/SCAN r(?:\s|$)/)
})

test('a merged person\'s contributions join the account they signed in to', async () => {
  const { db } = openTestDb()
  const anonymous = await createPerson(db), account = await createPerson(db, 'atlas-user')
  const id = await createEntry(db, fields, sighting, [], { actor: anonymous.id, ip: null })
  await db.prepare('UPDATE people SET merged_into = ? WHERE id = ?').bind(account.id, anonymous.id).run()
  const result = await load(event(db, account.id)) as any
  expect(result.items).toHaveLength(2)
  expect(result.items.every((row: any) => row.entry_id === id && row.by_id === account.id && row.by_name === account.name)).toBe(true)
})

test('a person recorded under a UUID has a page', async () => {
  const { db, raw } = openTestDb()
  const id = '0a1b2c3d-4e5f-4a6b-8c7d-0e1f2a3b4c5d'
  raw.exec(`INSERT INTO people(id, name, created_at) VALUES ('${id}', 'Early', '2026-11-08T15:00:16.227Z')`)
  expect((await load(event(db, id)) as any).person).toMatchObject({ id, name: 'Early' })
  await expect(load(event(db, '0a1b2c3d-4e5f-4a6b-8c7d'))).rejects.toMatchObject({ status: 404 })
})

const moderator = { id: 'mod', name: 'Moderator', atlas: false, moderator: true, banned: false }
const merging = (db: D1Database, id: string, fields: Record<string, string>, person: any = moderator) => {
  const form = new FormData()
  for (const [key, value] of Object.entries(fields)) form.set(key, value)
  return actions.merge({
    params: { locale: 'en', id }, url: new URL(`https://example.test/en/u/${id}?/merge`), route: { id: '/[locale]/u/[id]' },
    request: { formData: async () => form }, locals: { person }, platform: { env: { DB: db } }, getClientAddress: () => '127.0.0.1',
  } as any)
}

test('a moderator merges a person into the one they are, after seeing who that is', async () => {
  const { db, raw } = openTestDb()
  const anonymous = await createPerson(db), other = await createPerson(db), account = await createPerson(db, 'atlas-1', 'Account')
  const entry = await createEntry(db, fields, sighting, [], { actor: anonymous.id, ip: null })
  await editEntry(db, entry, 1, { ...fields, description: 'Later' }, { actor: account.id, ip: null }, null)
  // Someone already joined to the anonymous person follows them.
  await editEntry(db, entry, 2, { ...fields, description: 'Again' }, { actor: other.id, ip: null }, null)
  raw.run('UPDATE people SET merged_into = ? WHERE id = ?', [anonymous.id, other.id])
  raw.run("INSERT INTO sessions(token_hash, person, created_at) VALUES ('t', ?, '2026')", [anonymous.id])
  raw.run("INSERT INTO favourites(person, entry_id, at) VALUES (?, ?, '2026')", [anonymous.id, entry])

  const asked = await merging(db, anonymous.id, { into: `https://rare.glyphatlas.org/en/u/${account.id}` }) as any
  expect(asked.target).toEqual({ id: account.id, name: 'Account', changes: 1 })
  expect(raw.query('SELECT merged_into FROM people WHERE id = ?').get(anonymous.id)).toEqual({ merged_into: null })

  await expect(merging(db, anonymous.id, { into: account.id, confirm: account.id })).rejects.toMatchObject({ status: 303, location: `/en/u/${account.id}` })
  expect(raw.query('SELECT id, merged_into, changes FROM people ORDER BY changes DESC, id').all()).toEqual(
    [{ id: account.id, merged_into: null, changes: 4 }, ...[anonymous.id, other.id].sort().map(id => ({ id, merged_into: account.id, changes: 0 }))])
  expect(raw.query('SELECT person FROM favourites').all()).toEqual([{ person: account.id }])
  expect(raw.query('SELECT COUNT(*) AS n FROM sessions').get()).toEqual({ n: 0 })
  expect((await load(event(db, account.id)) as any).items).toHaveLength(4)
})

test('merging refuses what signing in could not do, and anyone but a moderator', async () => {
  const { db, raw } = openTestDb()
  const anonymous = await createPerson(db), account = await createPerson(db, 'atlas-1', 'Account'), banned = await createPerson(db)
  raw.run("UPDATE people SET banned_at = '2026' WHERE id = ?", [banned.id])
  for (const person of [null, { ...moderator, moderator: false }, { ...moderator, banned: true }])
    await expect(merging(db, anonymous.id, { into: account.id, confirm: account.id }, person)).rejects.toMatchObject({ status: 403 })
  const refused = async (id: string, into: string, confirm = into) => ((await merging(db, id, { into, confirm })) as any).data.merge
  // Before anything is confirmed, too.
  expect(await refused(anonymous.id, anonymous.id, '')).toBe('self')
  expect(await refused(anonymous.id, banned.id, '')).toBe('banned')
  expect(await refused(anonymous.id, 'nobody', '')).toBe('missing')
  expect(await refused(anonymous.id, 'nobody')).toBe('missing')
  expect(await refused(anonymous.id, '000000000000')).toBe('missing')
  expect(await refused(anonymous.id, anonymous.id)).toBe('self')
  expect(await refused(account.id, anonymous.id)).toBe('missing')
  expect(await refused(anonymous.id, banned.id)).toBe('banned')
  expect(await refused(banned.id, account.id)).toBe('banned')
  expect(raw.query('SELECT COUNT(*) AS n FROM people WHERE merged_into IS NOT NULL').get()).toEqual({ n: 0 })
  const page = async (person: any, id: string) => (await load({ ...event(db, id), locals: { person } }) as any).mergeable
  expect([await page(moderator, anonymous.id), await page(moderator, account.id), await page(moderator, banned.id), await page(null, anonymous.id)]).toEqual([true, false, false, false])
})

test('a merged person who later signs in brings along whoever was merged into them', async () => {
  const { db, raw } = openTestDb()
  const first = await createPerson(db), second = await createPerson(db), account = await createPerson(db, 'atlas-1', 'Account')
  const entry = await createEntry(db, fields, sighting, [], { actor: first.id, ip: null })
  await editEntry(db, entry, 1, { ...fields, description: 'Later' }, { actor: second.id, ip: null }, null)
  expect(await joinPerson(db, first.id, second.id)).toBeNull()
  expect(await joinAtlas(db, second, 'atlas-1', 'Account', await startSession(db, second.id))).toBe(account.id)
  expect(raw.query('SELECT id, merged_into, changes FROM people ORDER BY id').all()).toEqual(
    [{ id: account.id, merged_into: null, changes: 3 }, { id: first.id, merged_into: account.id, changes: 0 }, { id: second.id, merged_into: account.id, changes: 0 }].sort((a, b) => a.id.localeCompare(b.id)))
  expect((await load(event(db, account.id)) as any).items).toHaveLength(3)
})

test('a merged person is signed out everywhere, and their thanks neither repeat nor thank themselves', async () => {
  const { db, raw } = openTestDb()
  const source = await createPerson(db), target = await createPerson(db, 'atlas-1', 'Target'), writer = await createPerson(db)
  const entry = await createEntry(db, fields, sighting, [], { actor: writer.id, ip: null })
  await editEntry(db, entry, 1, { ...fields, description: 'Source' }, { actor: source.id, ip: null }, null)
  const [byWriter, bySource] = (raw.query('SELECT id, actor FROM revisions ORDER BY id').all() as { id: number; actor: string }[]).filter(row => row.actor !== writer.id || row.id === 1).map(row => row.id)
  await thank(db, entry, byWriter, { actor: source.id, ip: 'a' })
  await thank(db, entry, byWriter, { actor: target.id, ip: 'b' })
  await thank(db, entry, bySource, { actor: target.id, ip: 'b' })
  raw.exec("INSERT INTO agent_clients(id, name, redirect_uris, created_at) VALUES ('client', null, '[]', '2026')")
  raw.run("INSERT INTO agent_tokens(token_hash, client, person, created_at) VALUES ('token', 'client', ?, '2026')", [source.id])
  raw.run("INSERT INTO sessions(token_hash, person, created_at) VALUES ('session', ?, '2026')", [source.id])
  expect(await joinPerson(db, source.id, target.id)).toBeNull()
  expect(raw.query('SELECT revision_id, person FROM thanks').all()).toEqual([{ revision_id: byWriter, person: target.id }])
  expect(raw.query('SELECT COUNT(*) AS n FROM notifications WHERE thank_id IS NOT NULL').get()).toEqual({ n: 1 })
  expect(raw.query('SELECT (SELECT COUNT(*) FROM agent_tokens) + (SELECT COUNT(*) FROM sessions) AS n').get()).toEqual({ n: 0 })
})

test('a moderator merges an agent into its commander, keeping agent and model separate while counting toward the commander', async () => {
  const { db, raw } = openTestDb()
  const commander = await createPerson(db, 'atlas-cmd', 'Commander')
  const agent = await createPerson(db), sibling = await createPerson(db), namedAgent = await createPerson(db), noModelAgent = await createPerson(db)
  const entry = await createEntry(db, fields, sighting, [], { actor: agent.id, ip: null })
  await editEntry(db, entry, 1, { ...fields, description: 'From sibling' }, { actor: sibling.id, ip: null }, null)
  await editEntry(db, entry, 2, { ...fields, description: 'From named agent' }, { actor: namedAgent.id, ip: null }, null)
  await editEntry(db, entry, 3, { ...fields, description: 'From agent without model' }, { actor: noModelAgent.id, ip: null }, null)
  await editEntry(db, entry, 4, { ...fields, description: 'Direct edit' }, { actor: commander.id, ip: null }, null)
  // Sibling was already folded into `agent` as a non-agent; `namedAgent` was already marked with its own agent and model.
  expect(await joinPerson(db, sibling.id, agent.id)).toBeNull()
  expect(await joinPerson(db, namedAgent.id, agent.id, { agent: 'Claude Code', model: 'Opus 5.5' })).toBeNull()
  expect(await joinPerson(db, noModelAgent.id, commander.id, { agent: 'Claude Code' })).toBeNull()

  // Invalid agent name, invalid model name, or model without an agent are refused before touching the database.
  expect(((await merging(db, agent.id, { into: commander.id, agent: 'x'.repeat(81) })) as any).data.merge).toBe('agent')
  expect(((await merging(db, agent.id, { into: commander.id, agent: 'DSH', model: 'x'.repeat(81) })) as any).data.merge).toBe('model')
  expect(((await merging(db, agent.id, { into: commander.id, model: 'DeepSeek Flash' })) as any).data.merge).toBe('model')

  // First post previews target, agent, and model; changing either agent or model requires re-confirming.
  const preview = await merging(db, agent.id, { into: commander.id, agent: '  DSH  ', model: '  DeepSeek   Flash ' }) as any
  expect(preview.target).toEqual({ id: commander.id, name: 'Commander', changes: 2 })
  expect(preview.agent).toBe('DSH')
  expect(preview.model).toBe('DeepSeek Flash')
  const changed = await merging(db, agent.id, { into: commander.id, confirm: commander.id, agent: 'DSH', confirm_agent: 'DSH', model: 'DeepSeek-v4.1-1017', confirm_model: 'DeepSeek Flash' }) as any
  expect(changed.target.id).toBe(commander.id)
  expect(changed.model).toBe('DeepSeek-v4.1-1017')

  await expect(merging(db, agent.id, { into: commander.id, confirm: commander.id, agent: 'DSH', confirm_agent: 'DSH', model: 'DeepSeek Flash', confirm_model: 'DeepSeek Flash' })).rejects.toMatchObject({ status: 303, location: `/en/u/${commander.id}` })

  // All 6 changes roll into the commander, and only the commander appears on /u.
  expect(await contributors(db, 1)).toEqual({ people: [{ id: commander.id, name: 'Commander', changes: 6, atlas: 1 }], next: null })
  expect(await agentsOf(db, commander.id)).toEqual([
    { name: 'Claude Code', model: null },
    { name: 'Claude Code', model: 'Opus 5.5' },
    { name: 'DSH', model: 'DeepSeek Flash' },
  ])

  // The entry, sighting, history, and profile preserve commander, agent, and model separately.
  const loaded = await getEntry(db, entry)
  expect(loaded!.entry).toMatchObject({ by_id: commander.id, by_name: 'Commander', by_agent: 'DSH', by_model: 'DeepSeek Flash' })
  expect(loaded!.sightings[0]).toMatchObject({ by_id: commander.id, by_name: 'Commander', by_agent: 'DSH', by_model: 'DeepSeek Flash' })

  const page = await load(event(db, commander.id)) as any
  expect(page.agents).toEqual([
    { name: 'Claude Code', model: null },
    { name: 'Claude Code', model: 'Opus 5.5' },
    { name: 'DSH', model: 'DeepSeek Flash' },
  ])
  expect(page.items.map((row: any) => ({ by_name: row.by_name, by_agent: row.by_agent, by_model: row.by_model }))).toEqual([
    { by_name: 'Commander', by_agent: null, by_model: null },
    { by_name: 'Commander', by_agent: 'Claude Code', by_model: null },
    { by_name: 'Commander', by_agent: 'Claude Code', by_model: 'Opus 5.5' },
    { by_name: 'Commander', by_agent: 'DSH', by_model: 'DeepSeek Flash' },
    { by_name: 'Commander', by_agent: 'DSH', by_model: 'DeepSeek Flash' },
    { by_name: 'Commander', by_agent: 'DSH', by_model: 'DeepSeek Flash' },
  ])
  const feed = await globalHistory(db)
  expect(feed.rows[0]).toMatchObject({ by_id: commander.id, by_name: 'Commander', by_agent: null, by_model: null })
  expect(feed.rows[1]).toMatchObject({ by_id: commander.id, by_name: 'Commander', by_agent: 'Claude Code', by_model: null })
  expect(feed.rows[2]).toMatchObject({ by_id: commander.id, by_name: 'Commander', by_agent: 'Claude Code', by_model: 'Opus 5.5' })

  // Reading a commander's agents seeks both name and model in the partial covering index, never scanning duplicate rows.
  const stmt = agentsOfStatement(db, commander.id) as unknown as { sql: string; values: unknown[] }
  const plan = (raw.query(`EXPLAIN QUERY PLAN ${stmt.sql}`).all(...(stmt.values as never[])) as { detail: string }[]).map(row => row.detail).join('\n')
  expect(plan).toContain('USING COVERING INDEX people_agents_by_commander (merged_into=? AND name=? AND agent_model>?)')
  expect(plan).toContain('USING COVERING INDEX people_agents_by_commander (merged_into=? AND name>?)')
  expect(plan).not.toContain('TEMP B-TREE')

  // Duplicate rows under the same agent/model pair do not multiply rows read or alter results.
  const insertDup = raw.prepare("INSERT INTO people(id, name, agent_model, created_at, merged_into, agent) VALUES (?, 'Claude Code', '', '2026', ?, 1)")
  raw.transaction(() => {
    for (let i = 0; i < 2000; i++) insertDup.run(`dup${String(i).padStart(9, '0')}`, commander.id)
  })()
  expect(await agentsOf(db, commander.id)).toEqual([
    { name: 'Claude Code', model: null },
    { name: 'Claude Code', model: 'Opus 5.5' },
    { name: 'DSH', model: 'DeepSeek Flash' },
  ])
})
