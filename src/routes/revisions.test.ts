import { Database } from 'bun:sqlite'
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { actions, load as editLoad } from './entry/[id]/edit/+page.server'
import { load as history } from './entry/[id]/history/+page.server'

function dbSetup() {
  const db = new Database(':memory:')
  for (const name of ['0001_init.sql', '0002_entry_visibility.sql']) db.exec(readFileSync(new URL(`../../migrations/${name}`, import.meta.url), 'utf8'))
  db.exec("INSERT INTO entries (script,place,url,title,created_at) VALUES ('old','book','https://example.org','title','2026')")
  db.exec(readFileSync(new URL('../../migrations/0003_revisions.sql', import.meta.url), 'utf8'))
  return db
}
function binding(db: Database) {
  return { prepare(sql: string) { return { bind(...values: (string | number | null)[]) { return {
    first: async () => db.query(sql).get(...values), all: async () => ({ results: db.query(sql).all(...values) })
  } } } } }
}
function event(db: Database, values: Record<string, string> = {}) {
  const form = new FormData()
  for (const [key, value] of Object.entries(values)) form.set(key, value)
  return { params: { id: '1' }, platform: { env: { DB: binding(db) } }, request: new Request('https://example.test/', { method: 'POST', body: form }), url: new URL('https://example.test/') } as any
}

describe('revisions', () => {
  test('backfills, snapshots atomically, rejects stale edits and hides every revision', async () => {
    const db = dbSetup()
    try {
      expect(db.query('SELECT revision, title FROM entry_revisions').get()).toEqual({ revision: 1, title: 'title' })
      const values = { revision: '1', script: 'new', url: 'https://example.org/new', place: 'page', title: 'new title', author: 'A', publisher: 'P', year: '1900', page: '8', note: 'N', ids: 'X', description: 'D' }
      await expect(actions.default!(event(db, values))).rejects.toMatchObject({ status: 303 })
      expect(db.query('SELECT revision, title, author, publisher, year, page, note, ids, description FROM entry_revisions WHERE revision = 2').get()).toEqual({ revision: 2, title: 'new title', author: 'A', publisher: 'P', year: '1900', page: '8', note: 'N', ids: 'X', description: 'D' })
      const stale = await actions.default!(event(db, { ...values, title: 'unsaved' })) as any
      expect(stale.status).toBe(409)
      expect(stale.data.values.title).toBe('unsaved')
      expect(db.query('SELECT count(*) AS n FROM entry_revisions').get()).toEqual({ n: 2 })
      expect(() => db.exec("UPDATE entry_revisions SET title = 'tamper'")).toThrow()
      expect(() => db.exec('DELETE FROM entry_revisions')).toThrow()
      expect(() => db.exec("INSERT OR REPLACE INTO entry_revisions SELECT entry_id, revision, script, ids, description, place, url, 'tampered', author, publisher, year, page, note, recorded_at FROM entry_revisions WHERE revision = 1")).toThrow()
      expect(() => db.exec('UPDATE entries SET revision = 5 WHERE id = 1')).toThrow()
      db.exec('UPDATE entries SET visible = 0 WHERE id = 1')
      expect(() => db.exec("INSERT OR REPLACE INTO entries (id, revision, script, place, url, created_at) VALUES (1, 5, 'replacement', 'book', 'https://example.org', '2026')")).toThrow()
      expect(db.query('SELECT visible, revision FROM entries WHERE id = 1').get()).toEqual({ visible: 0, revision: 2 })
      await expect(editLoad(event(db))).rejects.toMatchObject({ status: 404 })
      await expect(history(event(db))).rejects.toMatchObject({ status: 404 })
      await expect(actions.default!(event(db, values))).rejects.toMatchObject({ status: 404 })
      db.exec('UPDATE entries SET visible = 1 WHERE id = 1')
      const restored = await history(event(db)) as any
      expect(restored.revisions.find((r: any) => r.revision === 1).title).toBe('title')
    } finally { db.close() }
  })
  test('edits preserve a long URL fallback and report invalid fields', async () => {
    const db = dbSetup()
    try {
      const url = `https://example.org/${'x'.repeat(600)}`
      const values = { revision: '1', script: 'Han', url, place: url }
      await expect(actions.default!(event(db, values))).rejects.toMatchObject({ status: 303 })
      expect(db.query('SELECT place FROM entries WHERE id = 1').get()).toEqual({ place: url })
      const bad = await actions.default!(event(db, { ...values, revision: '2', url: 'javascript:bad', place: 'book' })) as any
      expect(bad.status).toBe(400)
      expect(bad.data.errors.url).toContain('HTTP or HTTPS')
      const changed = await actions.default!(event(db, { ...values, revision: '2', url: 'https://example.org/other' })) as any
      expect(changed.status).toBe(400)
      expect(changed.data.errors.place).toContain('clear or shorten')
    } finally { db.close() }
  })
  test('snapshot failure rolls back both inserts and updates', () => {
    const db = dbSetup()
    try {
      db.exec("CREATE TRIGGER reject_snapshot BEFORE INSERT ON entry_revisions BEGIN SELECT RAISE(ABORT, 'failure'); END")
      expect(() => db.exec("INSERT INTO entries (script, place, url, created_at) VALUES ('new', 'book', 'https://example.org', '2026')")).toThrow()
      expect(db.query('SELECT count(*) AS n FROM entries').get()).toEqual({ n: 1 })
      expect(() => db.exec("UPDATE entries SET script = 'new', revision = revision + 1 WHERE id = 1")).toThrow()
      expect(db.query('SELECT script, revision FROM entries WHERE id = 1').get()).toEqual({ script: 'old', revision: 1 })
      expect(() => db.exec("UPDATE entries SET script = 'new' WHERE id = 1")).toThrow()
    } finally { db.close() }
  })
  test('history pages are bounded and use the primary key', async () => {
    const db = dbSetup()
    try {
      for (let n = 0; n < 40; n++) db.exec('UPDATE entries SET revision = revision + 1 WHERE id = 1')
      const e = event(db)
      const first = await history(e) as any
      expect(first.revisions).toHaveLength(20)
      expect(first.next).toBe(22)
      e.url.searchParams.set('before', String(first.next))
      const second = await history(e) as any
      expect(second.revisions).toHaveLength(20)
      expect(second.next).toBe(2)
      e.url.searchParams.set('before', String(second.next))
      expect((await history(e) as any).revisions.map((r: any) => r.revision)).toEqual([1])
      const plan = db.query('EXPLAIN QUERY PLAN SELECT r.* FROM entry_revisions r JOIN entries e ON e.id = r.entry_id AND e.visible = 1 WHERE r.entry_id = ? AND r.revision < ? ORDER BY r.revision DESC LIMIT 21').all(1, 40) as { detail: string }[]
      expect(plan.some(p => /SEARCH r USING PRIMARY KEY \(entry_id=\? AND revision<\?\)/.test(p.detail))).toBe(true)
      expect(plan.some(p => /SCAN|TEMP B-TREE/.test(p.detail))).toBe(false)
    } finally { db.close() }
  })
})
