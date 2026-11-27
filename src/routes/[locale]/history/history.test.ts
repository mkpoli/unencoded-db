import { expect, test } from 'bun:test'
import { newClaim } from '$lib/claims'
import { createEntry, editEntry, feedLinesStatement, feedRowsStatement, globalHistoryStatement, globalScope, HISTORY_SCAN, RUN_LINES, RUN_MIN, type EntryFields, type SightingFields } from '$lib/server/entries'
import { createPerson } from '$lib/server/people'
import { openTestDb } from '$lib/server/testdb'
import { load } from './+page.server'

const event = (db: D1Database, before?: string) => ({
  url: new URL(`http://localhost/en/history?flat=1${before === undefined ? '' : `&before=${before}`}`),
  platform: { env: { DB: db } },
}) as any

test('global history hides private and merged targets and advances through bounded empty pages', async () => {
  const { db, raw } = openTestDb()
  raw.exec(`INSERT INTO people(id,name,created_at) VALUES ('p','Person','2026');
    INSERT INTO entries(id, ids, created_by, created_at, updated_at) VALUES
      (1,'public','p','2026','2026'), (2,'hidden','p','2026','2026'),
      (3,'merged','p','2026','2026');
    UPDATE entries SET hidden_at='2026' WHERE id=2;
    UPDATE entries SET merged_into=1 WHERE id=3;
    INSERT INTO sightings(id,entry_id,first_entry,place,hidden_at,created_by,created_at,updated_at) VALUES
      (1,1,1,'private','2026','p','2026','2026'), (2,2,2,'other',NULL,'p','2026','2026');`)
  const insert = raw.prepare("INSERT INTO revisions(entry_id,sighting_id,kind,rev,snapshot,summary,actor,at) VALUES (?,?, 'edit',1,'{}',?,'p','2026')")
  insert.run(1, null, 'public old')
  insert.run(1, 1, 'hidden sighting')
  insert.run(1, 2, 'wrong entry sighting')
  insert.run(3, null, 'merged')
  for (let i = 0; i < HISTORY_SCAN * 2 + 5; i++) insert.run(2, null, 'hidden entry')
  insert.run(1, null, 'public new')

  const all: any[] = []
  let before: string | undefined
  const cursors: number[] = []
  for (let page = 0; page < 5; page++) {
    const result = await load(event(db, before)) as any
    all.push(...result.items)
    if (!result.older) break
    cursors.push(result.older)
    before = String(result.older)
  }
  expect(cursors).toHaveLength(2)
  expect(cursors[1]).toBeLessThan(cursors[0])
  expect(all.map(row => row.summary)).toEqual(['public new', 'public old'])
  expect(all.every(row => !('visible' in row))).toBe(true)
  await expect(load(event(db, '0'))).rejects.toMatchObject({ status: 404 })
  await expect(load(event(db, 'abc'))).rejects.toMatchObject({ status: 404 })
})

test('global history carries the old version of every readable revision', async () => {
  const { db } = openTestDb()
  const person = await createPerson(db)
  const fields: EntryFields = { description: null, radical: null, strokes: null, claims: [newClaim('ids', '⿰木木')] }
  const sighting: SightingFields = { place: 'Source', url: null, title: null, author: null, publisher: null, report_date: null, container: null, source_kind: null, vias: [], original_date: null, page: null, contexts: null, style: null, types: null, quotes: null, note: null }
  const id = await createEntry(db, fields, sighting, [], { actor: person.id, ip: null })
  await editEntry(db, id, 1, { ...fields, description: 'Later' }, { actor: person.id, ip: null }, 'Corrected')
  const result = await load(event(db)) as any
  const rows = result.items.filter((row: any) => row.entry_id === id)
  expect(rows[0]).toMatchObject({ kind: 'edit', fields: { ...fields, description: 'Later' } })
  expect(rows[0]).not.toHaveProperty('snapshot')
  expect(rows.find((row: any) => row.kind === 'sighting').sightingFields).toEqual(sighting)
})

test('global history uses an ordered revision primary-key range and keyed joins', () => {
  const { db, raw } = openTestDb()
  for (const [before, by] of [[null, null], [100, null], [null, 'agent'], [100, 'agent'], [null, 'person'], [100, 'person']] as const) {
    const statement = globalHistoryStatement(db, before, by) as unknown as { sql: string; values: number[] }
    const plan = raw.query(`EXPLAIN QUERY PLAN ${statement.sql}`).all(...statement.values) as { detail: string }[]
    const details = plan.map(row => row.detail).join('\n')
    expect(details).toMatch(by === 'agent' ? /SEARCH r USING (?:COVERING )?INDEX revisions_by_agents \(id<\?\)/ : by === 'person' ? /SEARCH r USING (?:COVERING )?INDEX revisions_by_people \(id<\?\)/ : /SEARCH r USING INTEGER PRIMARY KEY \(rowid<\?\)/)
    expect(details).toMatch(/SEARCH e USING INTEGER PRIMARY KEY/)
    expect(details).toMatch(/SEARCH s USING INTEGER PRIMARY KEY/)
    expect(details).not.toMatch(/USE TEMP B-TREE|SCAN (?:r|e|s|p|m)(?:\s|$)/)
  }
})

test('history lists the changes of agents or of people, and follows an actor that becomes an agent', async () => {
  const { db, raw } = openTestDb()
  raw.exec(`INSERT INTO people(id,name,created_at) VALUES ('p','Person','2026'), ('q','Other','2026');
    INSERT INTO people(id,name,created_at,merged_into,agent) VALUES ('a','Harness','2026','p',1);
    INSERT INTO entries(id, ids, created_by, created_at, updated_at) VALUES (1,'public','p','2026','2026');`)
  const insert = raw.prepare("INSERT INTO revisions(entry_id,kind,rev,snapshot,summary,actor,at) VALUES (1,'edit',1,'{}',?,?,'2026')")
  insert.run('by person', 'p')
  insert.run('by agent', 'a')
  insert.run('by other', 'q')
  const listed = async (by?: string) => ((await load({ url: new URL(`http://localhost/en/history?flat=1${by ? `&by=${by}` : ''}`), platform: { env: { DB: db } } } as any)) as any).items.map((row: any) => row.summary)
  expect(await listed()).toEqual(['by other', 'by agent', 'by person'])
  expect(await listed('agent')).toEqual(['by agent'])
  expect(await listed('person')).toEqual(['by other', 'by person'])
  raw.exec("UPDATE people SET agent = 1, merged_into = 'p' WHERE id = 'q'")
  expect(await listed('agent')).toEqual(['by other', 'by agent'])
  raw.exec("UPDATE revisions SET actor = 'p' WHERE summary = 'by agent'")
  expect(await listed('agent')).toEqual(['by other'])
  await expect(load({ url: new URL('http://localhost/en/history?by=robot'), platform: { env: { DB: db } } } as any)).rejects.toMatchObject({ status: 404 })
})

test('a run of quick changes by one writer is one item, and the pages beside a page are reachable', async () => {
  const { db, raw } = openTestDb()
  raw.exec(`INSERT INTO people(id,name,created_at) VALUES ('p','Person','2026'), ('q','Other','2026');
    INSERT INTO entries(id, ids, created_by, created_at, updated_at) VALUES (1,'public','p','2026','2026');`)
  const insert = raw.prepare("INSERT INTO revisions(entry_id,kind,rev,snapshot,summary,actor,at) VALUES (1,?,1,'{}',?,?,?)")
  const at = (seconds: number) => new Date(Date.UTC(2026, 10, 1) + seconds * 1000).toISOString()
  insert.run('edit', 'alone', 'q', at(0))
  // A batch: one change every two seconds, then the same writer again after a long pause.
  for (let i = 0; i < RUN_LINES + 30; i++) insert.run(i % 2 ? 'sighting' : 'edit', 'tagged', 'p', at(1000 + i * 2))
  for (let i = 0; i < RUN_MIN - 1; i++) insert.run('edit', `later ${i}`, 'p', at(9000 + i))
  for (let i = 0; i < 70; i++) insert.run('edit', `apart ${i}`, i % 2 ? 'p' : 'q', at(20000 + i * 600))
  const ask = async (query = '') => await load({ url: new URL(`http://localhost/en/history${query}`), platform: { env: { DB: db } } } as any) as any

  const first = await ask()
  expect(first.items).toHaveLength(60)
  expect(first.items.every((item: any) => !('run' in item))).toBe(true)
  expect(first).toMatchObject({ newer: null, paged: false })
  const second = await ask(`?before=${first.older}`)
  // Ten more single changes, three that fall short of a run, the run, and the first change.
  expect(second.items.map((item: any) => 'run' in item ? `run ${item.count}` : item.summary).slice(10)).toEqual(['later 2', 'later 1', 'later 0', `run ${RUN_LINES + 30}`, 'alone'])
  const run = second.items.find((item: any) => 'run' in item)
  expect(run).toMatchObject({ by_id: 'p', summary: 'tagged', kinds: [['edit', RUN_LINES / 2 + 15], ['sighting', RUN_LINES / 2 + 15]] })
  expect(run.lines).toHaveLength(RUN_LINES)
  expect(second).toMatchObject({ older: null, paged: true })
  // Back the way it came, and every change singly when asked.
  expect((await ask(`?after=${second.newer}`)).items.map((item: any) => item.id)).toEqual(first.items.map((item: any) => item.id))
  expect((await ask(`?flat=1&before=${first.older}`)).items.every((item: any) => !('run' in item))).toBe(true)
  for (const bad of ['?before=1&after=2', '?after=x', '?flat=2']) await expect(ask(bad)).rejects.toMatchObject({ status: 404 })
})

test('the history scans a bounded range in order and reads single changes by key', () => {
  const { db, raw } = openTestDb()
  const planOf = (statement: unknown) => {
    const { sql, values } = statement as { sql: string; values: unknown[] }
    return (raw.query(`EXPLAIN QUERY PLAN ${sql}`).all(...values as never[]) as { detail: string }[]).map(row => row.detail).join('\n')
  }
  for (const by of [null, 'agent', 'person'] as const) for (const cursor of [{}, { before: 100 }, { after: 100 }]) {
    const details = planOf(feedLinesStatement(db, globalScope(by), cursor))
    expect(details).toMatch(by === 'agent' ? /SEARCH r USING (?:COVERING )?INDEX revisions_by_agents \(id[<>]\?\)/ : by === 'person' ? /SEARCH r USING (?:COVERING )?INDEX revisions_by_people \(id[<>]\?\)/ : /SEARCH r USING INTEGER PRIMARY KEY \(rowid[<>]\?\)/)
    expect(details).not.toMatch(/USE TEMP B-TREE|SCAN (?:r|e|s|p|m)(?:\s|$)/)
  }
  const details = planOf(feedRowsStatement(db, [3, 2, 1]))
  expect(details).toMatch(/SEARCH r USING INTEGER PRIMARY KEY \(rowid=\?\)/)
  expect(details).not.toMatch(/SCAN (?:r|e|s|p|m)(?:\s|$)/)
})
