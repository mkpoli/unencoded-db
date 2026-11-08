import { Database } from 'bun:sqlite'
import { describe, expect, test } from 'bun:test'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { load as list } from './+page.server'
import { load as detail } from './entry/[id]/+page.server'
import { GET as exportJson } from './export.json/+server'

type PlanRow = { detail: string }

function database() {
  const db = new Database(':memory:')
  db.exec(readFileSync(new URL('../../migrations/0001_init.sql', import.meta.url), 'utf8'))
  db.exec(readFileSync(new URL('../../migrations/0002_entry_visibility.sql', import.meta.url), 'utf8'))
  db.exec(readFileSync(new URL('../../migrations/0003_related_characters.sql', import.meta.url), 'utf8'))
  return db
}

// Exercise the route's actual SQL while avoiding any storage or network access.
function capture(db: Database, found = false) {
  const plans: string[][] = []
  const binding = {
    prepare(sql: string) {
      return {
        bind(...values: (string | number)[]) {
          const statement = db.prepare(`EXPLAIN QUERY PLAN ${sql}`)
          try {
            const plan = statement.all(...values) as PlanRow[]
            plans.push(plan.map(row => row.detail))
          } finally { statement.finalize() }
          return { all: async () => ({ results: [] }), first: async () => found ? { id: 1, comparisons: '[]' } : null }
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
    expect(routes(new URL('.', import.meta.url).pathname).sort()).toEqual(['+page.server.ts', 'entry/[id]/+page.server.ts', 'export.json/+server.ts', 'new/+page.server.ts'].sort())
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

  test('export uses the visible index for ascending pages', async () => {
    const db = database()
    try {
      const { binding, plans } = capture(db)
      await exportJson({ platform: { env: { DB: binding } }, url: new URL('https://example.test/export.json?after=10&limit=50') } as any)
      expect(plans).toHaveLength(1)
      assertPlan(plans[0], /SEARCH entries USING INDEX entries_visible_id \(id>\?\)/i)

      // The planner keeps the partial index with statistics and a long hidden tail.
      for (let index = 0; index < 50; index++) db.exec(`INSERT INTO entries (script, place, url, created_at, visible) VALUES ('S${index}', 'book', 'https://example.org', '2026', ${index < 25 ? 1 : 0})`)
      db.exec('ANALYZE')
      const analyzed = capture(db)
      await exportJson({ platform: { env: { DB: analyzed.binding } }, url: new URL('https://example.test/export.json?after=25&limit=10') } as any)
      assertPlan(analyzed.plans[0], /SEARCH entries USING INDEX entries_visible_id \(id>\?\)/i)

      db.exec('DROP INDEX entries_visible_id')
      const withoutIndex = capture(db)
      await expect(exportJson({ platform: { env: { DB: withoutIndex.binding } }, url: new URL('https://example.test/export.json?after=10') } as any)).rejects.toThrow()
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
