import { Database } from 'bun:sqlite'
import { describe, expect, test } from 'bun:test'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { migrationFiles, migrationSql } from '$lib/server/test-db'
import { load as list } from './+page.server'
import { load as detail } from './entry/[id]/+page.server'
import { load as queue } from './moderate/+page.server'
import { load as reportsQueue } from './moderate/reports/+page.server'

type PlanRow = { detail: string }

function database() {
  const db = new Database(':memory:')
  for (const name of migrationFiles) db.exec(migrationSql(name))
  return db
}

// Exercise the route's actual SQL while avoiding any storage or network access.
function capture(db: Database, found = false) {
  const plans: string[][] = []
  const sqls: string[] = []
  const binding = {
    prepare(sql: string) {
      return {
        bind(...values: (string | number)[]) {
          const statement = db.prepare(`EXPLAIN QUERY PLAN ${sql}`)
          try {
            const plan = statement.all(...values) as PlanRow[]
            plans.push(plan.map(row => row.detail))
            sqls.push(sql)
          } finally { statement.finalize() }
          return { all: async () => ({ results: [] }), first: async () => found ? { id: 1, comparisons: '[]' } : null }
        }
      }
    }
  }
  return { binding, plans, sqls }
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
    expect(routes(new URL('.', import.meta.url).pathname).sort()).toEqual([
      '+layout.server.ts',
      '+page.server.ts',
      'entry/[id]/+page.server.ts',
      'entry/[id]/report/+server.ts',
      'moderate/+page.server.ts',
      'moderate/[id]/hide/+server.ts',
      'moderate/[id]/restore/+server.ts',
      'moderate/reports/+page.server.ts',
      'moderate/reports/[id]/dismiss/+server.ts',
      'new/+page.server.ts',
    ].sort())
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

  test('hidden queue uses the hidden index for cursor and descending order', async () => {
    const db = database()
    try {
      const { binding, plans, sqls } = capture(db)
      for (const path of ['/moderate', '/moderate?before=100']) {
        await queue({
          platform: { env: { DB: binding } },
          locals: { moderator: 'mod@example.com' },
          url: new URL(path, 'https://example.test'),
        } as any)
      }
      expect(plans).toHaveLength(2)
      expect(sqls.every(sql => /LIMIT 21\s*$/i.test(sql.trim()))).toBe(true)
      expect(sqls.every(sql => /^SELECT id, script, description, place, created_at FROM entries\b/.test(sql))).toBe(true)
      for (const plan of plans) assertPlan(plan, /SEARCH entries USING INDEX entries_hidden_id \(id<\?\)/i)

      db.exec('DROP INDEX entries_hidden_id')
      const withoutIndex = capture(db)
      await queue({
        platform: { env: { DB: withoutIndex.binding } },
        locals: { moderator: 'mod@example.com' },
        url: new URL('https://example.test/moderate?before=100'),
      } as any)
      expect(() => assertPlan(withoutIndex.plans[0], /SEARCH entries USING INDEX entries_hidden_id \(id<\?\)/i)).toThrow()
    } finally { db.close() }
  })

  test('dismissal lookup and resolution use the report primary key', () => {
    const db = database()
    try {
      function plan(sql: string, ...values: (string | number)[]): string[] {
        const statement = db.prepare(`EXPLAIN QUERY PLAN ${sql}`)
        try {
          return (statement.all(...values) as PlanRow[]).map(row => row.detail)
        } finally { statement.finalize() }
      }

      const auditLookup = plan('SELECT 1 FROM report_dismissals WHERE report_id = ?', 1)
      expect(auditLookup.some(line => /SEARCH report_dismissals USING INTEGER PRIMARY KEY \(rowid=\?\)/i.test(line))).toBe(true)
      expect(auditLookup.some(line => /\bSCAN report_dismissals\b/i.test(line))).toBe(false)

      const openLookup = plan('SELECT 1 FROM entry_reports WHERE id = ? AND resolved_at IS NOT NULL', 1)
      expect(openLookup.some(line => /SEARCH entry_reports USING INTEGER PRIMARY KEY \(rowid=\?\)/i.test(line))).toBe(true)

      const resolution = plan('UPDATE entry_reports SET resolved_at = ? WHERE id = ?', '2026-02-03T04:05:06.000Z', 1)
      expect(resolution.some(line => /SEARCH entry_reports USING INTEGER PRIMARY KEY \(rowid=\?\)/i.test(line))).toBe(true)
      expect(resolution.some(line => /USE TEMP B-TREE/i.test(line))).toBe(false)
    } finally { db.close() }
  })

  test('open reports use the partial index, join entries by key and stay bounded', async () => {
    const db = database()
    try {
      const { binding, plans, sqls } = capture(db)
      for (const path of ['/moderate/reports', '/moderate/reports?before=100']) {
        await reportsQueue({
          platform: { env: { DB: binding } },
          locals: { moderator: 'mod@example.com' },
          url: new URL(path, 'https://example.test'),
        } as any)
      }
      expect(plans).toHaveLength(2)
      expect(sqls.every(sql => /LIMIT 21\s*$/i.test(sql.trim()))).toBe(true)
      expect(sqls.every(sql => /^SELECT r\.id AS report_id[\s\S]*FROM entry_reports r\s+JOIN entries e ON e\.id = r\.entry_id/i.test(sql))).toBe(true)
      for (const plan of plans) {
        assertPlan(plan, /SEARCH r USING INDEX entry_reports_open \(id<\?\)/i)
        assertPlan(plan, /SEARCH e USING INTEGER PRIMARY KEY \(rowid=\?\)/i)
      }

      db.exec('DROP INDEX entry_reports_open')
      const withoutIndex = capture(db)
      await reportsQueue({
        platform: { env: { DB: withoutIndex.binding } },
        locals: { moderator: 'mod@example.com' },
        url: new URL('https://example.test/moderate/reports'),
      } as any)
      expect(() => assertPlan(withoutIndex.plans[0]!, /SEARCH r USING INDEX entry_reports_open \(id<\?\)/i)).toThrow()
    } finally { db.close() }
  })

})
