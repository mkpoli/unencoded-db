import { Database } from 'bun:sqlite'
import { describe, expect, test } from 'bun:test'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { load as list } from './+page.server'
import { load as detail } from './entry/[id]/+page.server'
import { load as edit, actions as editActions } from './entry/[id]/edit/+page.server'
import { load as history } from './entry/[id]/history/+page.server'

type PlanRow = { detail: string }

function database() {
  const db = new Database(':memory:')
  db.exec(readFileSync(new URL('../../migrations/0001_init.sql', import.meta.url), 'utf8'))
  db.exec(readFileSync(new URL('../../migrations/0002_entry_visibility.sql', import.meta.url), 'utf8'))
  db.exec(readFileSync(new URL('../../migrations/0003_related_characters.sql', import.meta.url), 'utf8'))
  db.exec(readFileSync(new URL('../../migrations/0007_revisions.sql', import.meta.url), 'utf8'))
  db.exec(readFileSync(new URL('../../migrations/0008_edit_generation.sql', import.meta.url), 'utf8'))
  return db
}

// Exercise the route's actual SQL while avoiding any storage or network access.
function capture(db: Database, found = false) {
  const plans: string[][] = []
  const binding = {
    prepare(sql: string) {
      return {
        bind(...values: (string | number | null)[]) {
          const statement = db.prepare(`EXPLAIN QUERY PLAN ${sql}`)
          try {
            const plan = statement.all(...values) as PlanRow[]
            plans.push(plan.map(row => row.detail))
          } finally { statement.finalize() }
          return { all: async () => ({ results: [] }), first: async () => found ? { id: 1, revision: 1, edit_generation: 1, comparisons: '[]' } : null }
        }
      }
    }
  }
  return { binding, plans }
}

function assertPlan(plan: string[], expected: RegExp) {
  expect(plan.some(line => expected.test(line))).toBe(true)
  expect(plan.some(line => /USE TEMP B-TREE/i.test(line))).toBe(false)
  expect(plan.some(line => /\bSCAN\s+entries\b/i.test(line))).toBe(false)
}

describe('public query plans', () => {
  test('all server routes are accounted for', () => {
    function routes(dir: string, prefix = ''): string[] {
      return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
        const path = join(prefix, entry.name)
        return entry.isDirectory() ? routes(join(dir, entry.name), path) : /^\+(?:page\.server|layout\.server|server)\.[jt]s$/.test(entry.name) ? [path] : []
      })
    }
    expect(routes(new URL('.', import.meta.url).pathname).sort()).toEqual(['+page.server.ts', 'entry/[id]/+page.server.ts', 'entry/[id]/edit/+page.server.ts', 'entry/[id]/history/+page.server.ts', 'new/+page.server.ts'].sort())
  })
  test('list uses the visible index for cursor and descending order', async () => {
    const db = database()
    try {
      const { binding, plans } = capture(db)
      for (const path of ['/', '/?before=100']) {
        await list({ platform: { env: { DB: binding } }, url: new URL(path, 'https://example.test') } as any)
      }
      expect(plans).toHaveLength(2)
      for (const plan of plans) assertPlan(plan, /SEARCH entries USING INDEX entries_visible_id \(id<\?\)/i)
      db.exec('DROP INDEX entries_visible_id')
      const withoutIndex = capture(db)
      await list({ platform: { env: { DB: withoutIndex.binding } }, url: new URL('https://example.test/?before=100') } as any)
      expect(() => assertPlan(withoutIndex.plans[0], /SEARCH entries USING INDEX entries_visible_id \(id<\?\)/i)).toThrow()
    } finally { db.close() }
  })

  test('edit and history use indexed lookups on every route shape', async () => {
    const db = database()
    try {
      const { binding, plans } = capture(db, true)
      const base = { platform: { env: { DB: binding } }, params: { id: '1' } }
      await edit(base as any)
      for (const path of ['/entry/1/history', '/entry/1/history?before=5']) {
        await history({ ...base, url: new URL(path, 'https://example.test') } as any)
      }
      const form = new FormData()
      form.set('script', 'Han'); form.set('url', 'https://example.org'); form.set('revision', '1'); form.set('edit_generation', '1')
      await expect(editActions.default!({ ...base, request: new Request('https://example.test', { method: 'POST', body: form }) } as any)).rejects.toMatchObject({ status: 303 })
      expect(plans).toHaveLength(7)
      for (const i of [0, 1, 3, 5, 6]) assertPlan(plans[i], /SEARCH entries USING INTEGER PRIMARY KEY \(rowid=\?\)/i)
      for (const i of [2, 4]) {
        expect(plans[i].some(line => /SEARCH r USING PRIMARY KEY \(entry_id=\? AND revision<\?\)/i.test(line))).toBe(true)
        expect(plans[i].some(line => /SCAN|TEMP B-TREE/i.test(line))).toBe(false)
      }
    } finally { db.close() }
  })

  test('detail loads bounded comparisons with the entry primary key', async () => {
    const db = database()
    try {
      const { binding, plans } = capture(db, true)
      await detail({ platform: { env: { DB: binding } }, params: { id: '1' } } as any)
      expect(plans).toHaveLength(1)
      assertPlan(plans[0], /SEARCH entries USING INTEGER PRIMARY KEY \(rowid=\?\)/i)
    } finally { db.close() }
  })

  test('detail uses the primary key', async () => {
    const db = database()
    try {
      const { binding, plans } = capture(db)
      await expect(detail({ platform: { env: { DB: binding } }, params: { id: '1' } } as any)).rejects.toMatchObject({ status: 404 })
      expect(plans).toHaveLength(1)
      assertPlan(plans[0], /SEARCH entries USING INTEGER PRIMARY KEY \(rowid=\?\)/i)
    } finally { db.close() }
  })

})
