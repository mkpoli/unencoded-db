import { expect, test } from 'bun:test'
import { createTestDatabase, d1Binding } from '../test-support'
import { redactRevision } from '../lib/server/revision-redaction'
import { load } from './[locale]/history/+page.server'

function event(db: ReturnType<typeof createTestDatabase>, path = '/en/history') {
  return { params: { locale: 'en' }, platform: { env: { DB: d1Binding(db) } }, url: new URL(path, 'https://example.test') } as any
}

function addEntry(db: ReturnType<typeof createTestDatabase>, ids: string, at: string, visible = 1) {
  const id = db.query("INSERT INTO entries (script, ids, place, created_at, visible) VALUES ('Han', ?, 'Book', ?, ?)").run(ids, at, visible).lastInsertRowid
  return Number(id)
}

test('global history lists visible revisions newest first', async () => {
  const db = createTestDatabase()
  try {
    const first = addEntry(db, '⿰木木', '2026-01-01T00:00:00.000Z')
    const second = addEntry(db, '⿰水水', '2026-01-02T00:00:00.000Z')
    addEntry(db, '⿰火火', '2026-01-03T00:00:00.000Z', 0)
    const result = await load(event(db)) as any
    expect(result.revisions.map((row: any) => row.entry_id)).toEqual([second, first])
    expect(result.revisions[0]).toMatchObject({ revision: 1, ids: '⿰水水', tombstone: false })
    expect(result.next).toBeNull()
  } finally { db.close() }
})

test('global history pages with a time, entry and revision cursor', async () => {
  const db = createTestDatabase()
  try {
    for (let i = 0; i < 25; i++) {
      addEntry(db, `⿰木${i}`, new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString())
    }
    const first = await load(event(db)) as any
    expect(first.revisions).toHaveLength(20)
    expect(first.next).not.toBeNull()
    const cursor = first.next
    const path = `/en/history?before=${encodeURIComponent(cursor.recorded_at)}&entry=${cursor.entry_id}&revision=${cursor.revision}`
    const second = await load(event(db, path)) as any
    expect(second.revisions).toHaveLength(5)
    expect(second.next).toBeNull()
    expect(second.revisions.some((row: any) => first.revisions.some((old: any) => old.entry_id === row.entry_id))).toBe(false)
  } finally { db.close() }
})

test('global history marks a redacted old revision without exposing its fields', async () => {
  const db = createTestDatabase()
  try {
    const id = addEntry(db, '⿰木木', '2026-01-01T00:00:00.000Z')
    db.query('UPDATE entries SET revision = revision + 1 WHERE id = ?').run(id)
    expect(await redactRevision(d1Binding(db), id, 1)).toBe(true)
    const result = await load(event(db)) as any
    const old = result.revisions.find((row: any) => row.entry_id === id && row.revision === 1)
    expect(old).toEqual({ entry_id: id, revision: 1, recorded_at: '2026-01-01T00:00:00.000Z', tombstone: true })
    expect(result.revisions.find((row: any) => row.entry_id === id && row.revision === 2)).toMatchObject({ tombstone: false, ids: '⿰木木' })
  } finally { db.close() }
})

test('global history rejects a malformed or partial cursor', async () => {
  const db = createTestDatabase()
  try {
    await expect(load(event(db, '/en/history?before=bad&entry=1&revision=1'))).rejects.toMatchObject({ status: 404 })
    await expect(load(event(db, '/en/history?before=2026-01-01T00%3A00%3A00.000Z&revision=1'))).rejects.toMatchObject({ status: 404 })
    await expect(load(event(db, '/en/history?entry=1&revision=1'))).rejects.toMatchObject({ status: 404 })
    await expect(load({ ...event(db), params: { locale: 'xx' } })).rejects.toMatchObject({ status: 404 })
  } finally { db.close() }
})
