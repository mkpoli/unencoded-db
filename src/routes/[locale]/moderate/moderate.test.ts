import { expect, test } from 'bun:test'
import { openTestDb } from '$lib/server/testdb'
import { actions as createActions } from '../new/+page.server'
import { actions, load } from './+page.server'

async function fixture() {
  const { db, raw } = openTestDb()
  const person = { id: 'moderator', name: 'Moderator', atlas: false, moderator: true, banned: false }
  raw.exec("INSERT INTO people(id, name, role, created_at) VALUES('moderator', 'Moderator', 'moderator', 'now')")
  const event = (form = new FormData(), identity: any = person) => ({
    request: { formData: async () => form }, url: new URL('https://example.test/en/moderate'),
    params: { locale: 'en' }, locals: { person: identity }, platform: { env: { DB: db } },
    cookies: { set() {} }, getClientAddress: () => '127.0.0.1',
  }) as any
  const create = new FormData(); create.set('url', 'https://example.test/source')
  await expect(createActions.default(event(create))).rejects.toMatchObject({ status: 303 })
  raw.exec("INSERT INTO reports(entry_id, sighting_id, reason, reporter, at) VALUES (1, 1, 'private', 'moderator', 'now')")
  return { db, raw, event, person }
}

const selection = (value: string) => { const form = new FormData(); form.set('report', value); return form }

test('moderation remains authorized and rate limited during a write pause', async () => {
  const { raw, event, person } = await fixture()
  const paused = (form: FormData, identity: any = person, allowed = true) => {
    const e = event(form, identity)
    e.platform.env.WRITES_PAUSED = '1'
    e.platform.env.EDITS = { limit: async () => ({ success: allowed }) }
    return e
  }
  for (const action of Object.values(actions)) {
    for (const identity of [null, { ...person, moderator: false }, { ...person, banned: true }]) {
      await expect(action(paused(selection('1'), identity))).rejects.toMatchObject({ status: 403 })
    }
    await expect(action(paused(selection('1'), person, false))).rejects.toMatchObject({ status: 429 })
  }
  const id = new FormData(); id.set('id', '1')
  raw.exec("INSERT INTO reports(entry_id, reason, reporter, at) VALUES(1, 'spam', 'moderator', 'now')")
  for (const [action, form] of [
    [actions.hide, selection('1')], [actions.unhide, selection('1')],
    [actions.hide, selection('1')], [actions.hide, selection('2')],
    [actions.resolve, selection('1')], [actions.resolve, selection('2')],
    [actions.restoreSighting, id], [actions.restoreEntry, id],
  ] as const) await expect(action(paused(form))).rejects.toMatchObject({ status: 303 })
  expect(raw.query('SELECT hidden_at FROM entries WHERE id = 1').get()).toEqual({ hidden_at: null })
  expect(raw.query('SELECT hidden_at FROM sightings WHERE id = 1').get()).toEqual({ hidden_at: null })
  expect(raw.query('SELECT COUNT(*) AS n FROM reports WHERE resolved_at IS NOT NULL').get()).toEqual({ n: 2 })
})

test('only an unbanned moderator can load or resolve', async () => {
  const { raw, event, person } = await fixture()
  for (const identity of [null, { ...person, moderator: false }, { ...person, banned: true }]) {
    await expect(load(event(new FormData(), identity))).rejects.toMatchObject({ status: 403 })
    await expect(actions.resolve(event(selection('1'), identity))).rejects.toMatchObject({ status: 403 })
    await expect(actions.hide(event(selection('1'), identity))).rejects.toMatchObject({ status: 403 })
    await expect(actions.unhide(event(selection('1'), identity))).rejects.toMatchObject({ status: 403 })
  }
  expect((raw.query('SELECT resolved_at FROM reports WHERE id = 1').get() as any).resolved_at).toBeNull()
})

test('lists at most 100 open reports and resolves with moderator identity', async () => {
  const { raw, event } = await fixture()
  for (let i = 0; i < 205; i++) raw.exec("INSERT INTO reports(entry_id, reason, reporter, at) VALUES(1, 'spam', 'moderator', 'now')")
  raw.exec("UPDATE reports SET resolved_at = 'now' WHERE id IN (50, 150)")
  const first = await load(event()) as any
  expect(first.reports).toHaveLength(100)
  expect(first.nextReports).toBe(101)
  const hiddenOnly = event(); hiddenOnly.url = new URL('https://example.test/en/moderate?entriesBefore=1&sightingsBefore=1')
  expect((await load(hiddenOnly) as any).reports.map((r: any) => r.id)).toEqual(first.reports.map((r: any) => r.id))
  const nextEvent = event(); nextEvent.url = new URL(`https://example.test/en/moderate?reportsAfter=${first.nextReports}&entriesBefore=1&sightingsBefore=1`)
  const second = await load(nextEvent) as any
  expect(second.reports).toHaveLength(100)
  expect(second.cursors).toEqual({ reportsAfter: 101, entriesBefore: 1, sightingsBefore: 1 })
  expect(second.hiddenEntries).toHaveLength(0)
  expect(second.nextReports).toBe(202)
  const lastEvent = event(); lastEvent.url = new URL(`https://example.test/en/moderate?reportsAfter=${second.nextReports}`)
  const last = await load(lastEvent) as any
  expect(last.reports.map((r: any) => r.id)).toEqual([203, 204, 205, 206])
  expect(last.nextReports).toBeNull()
  expect(new Set([...first.reports, ...second.reports, ...last.reports].map((r: any) => r.id)).size).toBe(204)
  for (const query of ['reportsAfter=0', 'reportsAfter=-1', 'reportsAfter=1.0', 'reportsAfter=9007199254740992', 'reportsAfter=1&reportsAfter=2']) {
    const invalid = event(); invalid.url = new URL(`https://example.test/en/moderate?${query}`)
    await expect(load(invalid)).rejects.toMatchObject({ status: 404 })
  }
  await expect(actions.resolve(event(selection('1')))).rejects.toMatchObject({ status: 303, location: '/en/moderate' })
  expect(raw.query('SELECT resolved_by FROM reports WHERE id = 1').get()).toEqual({ resolved_by: 'moderator' })
  expect((await load(event()) as any).reports[0].id).toBe(2)
  await expect(actions.resolve(event(selection('1')))).rejects.toMatchObject({ status: 404 })
})

test('hides and unhides the reported target with an audit revision', async () => {
  const { db, raw, event } = await fixture()
  expect((await load(event()) as any).reports[0].target_hidden_at).toBeNull()
  await expect(actions.hide(event(selection('1')))).rejects.toMatchObject({ status: 303 })
  expect(raw.query('SELECT hidden_at FROM sightings WHERE id = 1').get()).not.toEqual({ hidden_at: null })
  expect(raw.query('SELECT hidden_at FROM entries WHERE id = 1').get()).toEqual({ hidden_at: null })
  expect((await load(event()) as any).reports[0].target_hidden_at).not.toBeNull()
  expect(raw.query("SELECT actor FROM revisions WHERE kind = 'hide'").get()).toEqual({ actor: 'moderator' })
  await expect(actions.unhide(event(selection('1')))).rejects.toMatchObject({ status: 303 })
  expect(raw.query('SELECT hidden_at FROM sightings WHERE id = 1').get()).toEqual({ hidden_at: null })
  raw.exec("INSERT INTO reports(entry_id, reason, reporter, at) VALUES(1, 'spam', 'moderator', 'now')")
  await expect(actions.hide(event(selection('2')))).rejects.toMatchObject({ status: 303 })
  expect(raw.query('SELECT hidden_at FROM entries WHERE id = 1').get()).not.toEqual({ hidden_at: null })
  expect((await db.prepare("SELECT COUNT(*) AS n FROM entry_tags WHERE tag = 'all'").first<{ n: number }>())!.n).toBe(0)
  await expect(actions.unhide(event(selection('2')))).rejects.toMatchObject({ status: 303 })
  expect(raw.query('SELECT hidden_at FROM entries WHERE id = 1').get()).toEqual({ hidden_at: null })
})

test('visibility validates reports and honors write guards', async () => {
  const { raw, event } = await fixture()
  for (const action of [actions.hide, actions.unhide]) {
    for (const value of ['', '0', '-1', '1.0']) expect((await action(event(selection(value))) as any).status).toBe(400)
    const duplicate = selection('1'); duplicate.append('report', '1')
    expect((await action(event(duplicate)) as any).status).toBe(400)
    await expect(action(event(selection('999')))).rejects.toMatchObject({ status: 404 })
    const limited = event(selection('1')); limited.platform.env.EDITS = { limit: async () => ({ success: false }) }
    await expect(action(limited)).rejects.toMatchObject({ status: 429 })
  }
  raw.exec('UPDATE sightings SET entry_id = 999 WHERE id = 1')
  await expect(actions.hide(event(selection('1')))).rejects.toMatchObject({ status: 404 })
  expect(raw.query('SELECT hidden_at FROM sightings WHERE id = 1').get()).toEqual({ hidden_at: null })
})

test('the queue uses its partial index without sorting', async () => {
  const { db, raw, event } = await fixture()
  const prepare = db.prepare.bind(db)
  let sql = ''
  db.prepare = ((query: string) => { if (query.includes('FROM reports x')) sql = query; return prepare(query) }) as typeof db.prepare
  await load(event())
  const checkPlan = (database: typeof raw, after: number) => {
    const plan = (database.query(`EXPLAIN QUERY PLAN ${sql}`).all(after, 101) as { detail: string }[]).map(row => row.detail).join('\n')
    expect(plan).toMatch(/SEARCH x USING INDEX reports_open \(id>\?\)/)
    expect(plan).not.toContain('USE TEMP B-TREE')
  }
  checkPlan(raw, 0)
  checkPlan(raw, 100)
  const missing = openTestDb().raw
  missing.exec('DROP INDEX reports_open')
  expect(() => checkPlan(missing, 100)).toThrow()
})

test('resolved reports leave hidden records and sightings discoverable and restorable', async () => {
  const { raw, event } = await fixture()
  raw.exec("INSERT INTO reports(entry_id, reason, reporter, at) VALUES(1, 'spam', 'moderator', 'now')")
  await expect(actions.hide(event(selection('1')))).rejects.toMatchObject({ status: 303 })
  await expect(actions.hide(event(selection('2')))).rejects.toMatchObject({ status: 303 })
  await expect(actions.resolve(event(selection('1')))).rejects.toMatchObject({ status: 303 })
  await expect(actions.resolve(event(selection('2')))).rejects.toMatchObject({ status: 303 })
  const page = await load(event()) as any
  expect(page.reports).toHaveLength(0)
  expect(page.hiddenEntries.map((e: any) => e.id)).toEqual([1])
  expect(page.hiddenSightings.map((s: any) => [s.id, s.entry_id])).toEqual([[1, 1]])
  const id = new FormData(); id.set('id', '1')
  await expect(actions.restoreSighting(event(id))).rejects.toMatchObject({ status: 303 })
  await expect(actions.restoreEntry(event(id))).rejects.toMatchObject({ status: 303 })
  expect(raw.query('SELECT hidden_at FROM entries WHERE id = 1').get()).toEqual({ hidden_at: null })
  expect(raw.query('SELECT hidden_at FROM sightings WHERE id = 1').get()).toEqual({ hidden_at: null })
  expect(raw.query("SELECT COUNT(*) AS n FROM revisions WHERE kind = 'unhide' AND actor = 'moderator'").get()).toEqual({ n: 2 })
  expect(raw.query("SELECT COUNT(*) AS n FROM entry_tags WHERE tag = 'all'").get()).toEqual({ n: 1 })
  await expect(actions.restoreEntry(event(id))).rejects.toMatchObject({ status: 404 })
})

test('hidden lists are bounded and use partial indexes with keyset cursors', async () => {
  const { db, raw, event } = await fixture()
  raw.exec("UPDATE entries SET hidden_at = 'now'; UPDATE sightings SET hidden_at = 'now'")
  for (let i = 0; i < 105; i++) {
    raw.exec("INSERT INTO entries(script, created_by, created_at, updated_at, hidden_at) VALUES('han', 'moderator', 'now', 'now', 'now'); INSERT INTO sightings(entry_id, first_entry, place, created_by, created_at, updated_at, hidden_at) VALUES(1, 1, 'place', 'moderator', 'now', 'now', 'now')")
  }
  const queries: string[] = []
  const prepare = db.prepare.bind(db)
  db.prepare = ((sql: string) => { if (sql.includes('hidden_at IS NOT NULL') && sql.includes('ORDER BY')) queries.push(sql); return prepare(sql) }) as typeof db.prepare
  const first = await load(event()) as any
  expect(first.hiddenEntries).toHaveLength(100)
  expect(first.hiddenSightings).toHaveLength(100)
  const next = event(); next.url = new URL(`https://example.test/en/moderate?entriesBefore=${first.nextEntries}&sightingsBefore=${first.nextSightings}`)
  const second = await load(next) as any
  expect(second.hiddenEntries).toHaveLength(6)
  expect(second.hiddenSightings).toHaveLength(6)
  expect(second.nextEntries).toBeNull()
  expect(second.nextSightings).toBeNull()
  expect(new Set([...first.hiddenEntries, ...second.hiddenEntries].map((e: any) => e.id)).size).toBe(106)
  for (const [sql, index] of [[queries[0], 'entries_hidden_moderation'], [queries[1], 'sightings_hidden_moderation']]) {
    const plan = (raw.query(`EXPLAIN QUERY PLAN ${sql}`).all(Number.MAX_SAFE_INTEGER) as { detail: string }[]).map(r => r.detail).join('\n')
    expect(plan).toContain(index)
    expect(plan).not.toContain('USE TEMP B-TREE')
    const missing = openTestDb().raw
    missing.exec(`DROP INDEX ${index}`)
    const without = (missing.query(`EXPLAIN QUERY PLAN ${sql}`).all(Number.MAX_SAFE_INTEGER) as { detail: string }[]).map(r => r.detail).join('\n')
    expect(without).not.toContain(index)
  }
  for (const query of ['entriesBefore=0', 'sightingsBefore=1&sightingsBefore=2']) {
    const invalid = event(); invalid.url = new URL(`https://example.test/en/moderate?${query}`)
    await expect(load(invalid)).rejects.toMatchObject({ status: 404 })
  }
})

test('restore actions enforce moderator access, input validation and write guards', async () => {
  const { event, person } = await fixture()
  for (const action of [actions.restoreEntry, actions.restoreSighting]) {
    const id = new FormData(); id.set('id', '1')
    for (const identity of [null, { ...person, moderator: false }, { ...person, banned: true }]) await expect(action(event(id, identity))).rejects.toMatchObject({ status: 403 })
    for (const value of ['', '0', '-1', '1.0', '9007199254740992']) {
      const invalid = new FormData(); invalid.set('id', value)
      expect((await action(event(invalid)) as any).status).toBe(400)
    }
    const duplicate = new FormData(); duplicate.append('id', '1'); duplicate.append('id', '1')
    expect((await action(event(duplicate)) as any).status).toBe(400)
    const limited = event(id); limited.platform.env.EDITS = { limit: async () => ({ success: false }) }
    await expect(action(limited)).rejects.toMatchObject({ status: 429 })
    await expect(action(event(id))).rejects.toMatchObject({ status: 404 })
  }
})

test('validates selection and respects write guard', async () => {
  const { raw, event } = await fixture()
  for (const value of ['', '0', '-1', '1.0', '9007199254740992']) {
    expect((await actions.resolve(event(selection(value))) as any).status).toBe(400)
  }
  const duplicate = selection('1'); duplicate.append('report', '1')
  expect((await actions.resolve(event(duplicate)) as any).status).toBe(400)
  await expect(actions.resolve(event(selection('999')))).rejects.toMatchObject({ status: 404 })
  const limited = event(selection('1')); limited.platform.env.EDITS = { limit: async () => ({ success: false }) }
  await expect(actions.resolve(limited)).rejects.toMatchObject({ status: 429 })
  expect((raw.query('SELECT resolved_at FROM reports WHERE id = 1').get() as any).resolved_at).toBeNull()
})
