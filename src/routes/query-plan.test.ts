import { Database } from 'bun:sqlite'
import { describe, expect, test } from 'bun:test'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { createTestDatabase, fakeImages } from '../test-support'
import { load as list } from './[locale]/+page.server'
import { load as detail } from './[locale]/entry/[id]/+page.server'
import { load as edit, actions as editActions } from './[locale]/entry/[id]/edit/+page.server'
import { load as history } from './[locale]/entry/[id]/history/+page.server'
import { GET as image } from './[locale]/entry/[id]/image/+server'
import { load as queue } from './[locale]/moderate/+page.server'
import { load as reportsQueue } from './[locale]/moderate/reports/+page.server'
import { GET as exportJson } from './export.json/+server'

type PlanRow = { detail: string }

function database() {
  return createTestDatabase()
}

// Exercise the route's actual SQL while avoiding any storage or network access.
function capture(db: Database, found = false) {
  const plans: string[][] = []
  const sqls: string[] = []
  const binding = {
    prepare(sql: string) {
      return {
        bind(...values: (string | number | null)[]) {
          const statement = db.prepare(`EXPLAIN QUERY PLAN ${sql}`)
          try {
            const plan = statement.all(...values) as PlanRow[]
            plans.push(plan.map(row => row.detail))
            sqls.push(sql)
          } finally { statement.finalize() }
          return { all: async () => ({ results: [] }), first: async () => found ? { id: 1, revision: 1, edit_generation: 1, comparisons: '[]' } : null, run: async () => ({}) }
        }
      }
    }
  }
  return { binding, plans, sqls }
}

// The counts table is one row per script; it must never make the page read the records.
function assertCountPlan(plan: string[]) {
  expect(plan.some(line => /SCAN script_counts/i.test(line))).toBe(true)
  expect(plan.some(line => /\bSCAN\s+entries\b|USE TEMP B-TREE/i.test(line))).toBe(false)
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
      '+page.server.ts',
      '[locale]/+layout.server.ts',
      '[locale]/+page.server.ts',
      '[locale]/[...rest]/+page.server.ts',
      '[locale]/entry/[id]/+page.server.ts',
      '[locale]/entry/[id]/edit/+page.server.ts',
      '[locale]/entry/[id]/history/+page.server.ts',
      '[locale]/entry/[id]/image/+server.ts',
      '[locale]/entry/[id]/evidence/[evidence]/image/+server.ts',
      '[locale]/genre/[slug]/+page.server.ts',
      '[locale]/tag/[tag]/+page.server.ts',
      '[locale]/collection/[slug]/+page.server.ts',
      '[locale]/source/[id]/+page.server.ts',
      '[locale]/entry/[id]/report/+server.ts',
      '[locale]/moderate/+page.server.ts',
      '[locale]/moderate/[id]/hide/+server.ts',
      '[locale]/moderate/[id]/restore/+server.ts',
      '[locale]/moderate/reports/+page.server.ts',
      '[locale]/batch/+page.server.ts',
      '[locale]/new/+page.server.ts',
      'auth/callback/+server.ts',
      'auth/prepare/+server.ts',
      'auth/sign-in/+server.ts',
      'auth/sign-out/+server.ts',
      '[locale]/moderate/reports/[id]/dismiss/+server.ts',
      'api/glyph/+server.ts',
      'export.json/+server.ts',
    ].sort())
  })

  test('list uses the visible index for cursor and descending order', async () => {
    const db = database()
    try {
      const { binding, plans } = capture(db)
      for (const path of ['/en', '/en?before=100', '/ja?before=100']) {
        await list({ platform: { env: { DB: binding } }, url: new URL(path, 'https://example.test') } as any)
      }
      expect(plans).toHaveLength(6)
      for (const i of [0, 2, 4]) assertPlan(plans[i], /SEARCH entries USING INDEX entries_visible_id \(id<\?\)/i)
      for (const i of [1, 3, 5]) assertCountPlan(plans[i])
      db.exec('DROP INDEX entries_visible_id')
      const withoutIndex = capture(db)
      await list({ platform: { env: { DB: withoutIndex.binding } }, url: new URL('https://example.test/en?before=100') } as any)
      expect(() => assertPlan(withoutIndex.plans[0], /SEARCH entries USING INDEX entries_visible_id \(id<\?\)/i)).toThrow()
    } finally { db.close() }
  })

  test('the script filter uses the script index and keeps counts off the records', async () => {
    const db = database()
    try {
      const { binding, plans } = capture(db)
      await list({ platform: { env: { DB: binding } }, url: new URL('https://example.test/en?script=Han&before=100') } as any)
      expect(plans).toHaveLength(2)
      assertPlan(plans[0], /SEARCH entries USING INDEX entries_visible_script \(script=\? AND id<\?\)/i)
      assertCountPlan(plans[1])

      db.exec('DROP INDEX entries_visible_script')
      const withoutIndex = capture(db)
      await list({ platform: { env: { DB: withoutIndex.binding } }, url: new URL('https://example.test/en?script=Han') } as any)
      expect(() => assertPlan(withoutIndex.plans[0], /entries_visible_script/i)).toThrow()
    } finally { db.close() }
  })

  test('the IVD filter uses its index alone and with a script', async () => {
    const db = database()
    try {
      const { binding, plans } = capture(db)
      await list({ platform: { env: { DB: binding } }, url: new URL('https://example.test/en?ivd=registered&before=100') } as any)
      await list({ platform: { env: { DB: binding } }, url: new URL('https://example.test/en?ivd=none&script=Han&before=100') } as any)
      expect(plans).toHaveLength(4)
      assertPlan(plans[0], /SEARCH entries USING INDEX entries_visible_ivd \(ivd_status=\? AND id<\?\)/i)
      assertCountPlan(plans[1])
      assertPlan(plans[2], /SEARCH entries USING INDEX entries_visible_ivd_script \(ivd_status=\? AND script=\? AND id<\?\)/i)
      assertCountPlan(plans[3])

      for (let index = 0; index < 40; index++) {
        db.exec(`INSERT INTO entries (script, place, created_at, visible, ivd_status, ivd_sequence) VALUES ('${index % 2 ? 'Han' : 'Tangut'}', 'book', '2026', ${index < 30 ? 1 : 0}, ${index % 2 ? "'registered', 'U+4E00 U+E0100'" : "'none', NULL"})`)
      }
      db.exec('ANALYZE')
      const analyzed = capture(db)
      await list({ platform: { env: { DB: analyzed.binding } }, url: new URL('https://example.test/en?ivd=registered&script=Han') } as any)
      assertPlan(analyzed.plans[0], /SEARCH entries USING INDEX entries_visible_ivd_script \(ivd_status=\? AND script=\? AND id<\?\)/i)

      db.exec('DROP INDEX entries_visible_ivd')
      const withoutIndex = capture(db)
      await list({ platform: { env: { DB: withoutIndex.binding } }, url: new URL('https://example.test/en?ivd=none') } as any)
      expect(() => assertPlan(withoutIndex.plans[0], /entries_visible_ivd \(ivd_status=\? AND id<\?\)/i)).toThrow()
      await expect(list({ platform: { env: { DB: binding } }, url: new URL('https://example.test/en?ivd=unknown') } as any)).rejects.toMatchObject({ status: 404 })
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
      for (let index = 0; index < 50; index++) db.exec(`INSERT INTO entries (script, place, created_at, visible) VALUES ('S${index}', 'book', '2026', ${index < 25 ? 1 : 0})`)
      db.exec('ANALYZE')
      const analyzed = capture(db)
      await exportJson({ platform: { env: { DB: analyzed.binding } }, url: new URL('https://example.test/export.json?after=25&limit=10') } as any)
      assertPlan(analyzed.plans[0], /SEARCH entries USING INDEX entries_visible_id \(id>\?\)/i)

      db.exec('DROP INDEX entries_visible_id')
      const withoutIndex = capture(db)
      await expect(exportJson({ platform: { env: { DB: withoutIndex.binding } }, url: new URL('https://example.test/export.json?after=10') } as any)).rejects.toThrow()
    } finally { db.close() }
  })

  test('edit and history use indexed lookups on every route shape', async () => {
    const db = database()
    try {
      const { binding, plans } = capture(db, true)
      const base = { platform: { env: { DB: binding } }, params: { locale: 'en', id: '1' } }
      await edit(base as any)
      expect(plans.length).toBeGreaterThan(0)
      assertPlan(plans[0], /SEARCH entries USING INTEGER PRIMARY KEY \(rowid=\?\)/i)
      const loaded = plans.length
      for (const path of ['/en/entry/1/history', '/en/entry/1/history?before=5']) {
        await history({ ...base, url: new URL(path, 'https://example.test') } as any)
      }
      const form = new FormData()
      form.set('script', 'Han'); form.set('revision', '1'); form.set('edit_generation', '1')
      await expect(editActions.character!({ ...base, request: new Request('https://example.test/en/entry/1/edit', { method: 'POST', body: form }) } as any)).rejects.toMatchObject({ status: 303 })
      for (const plan of plans) {
        expect(plan.some(line => /\bSCAN\s+entries\b/i.test(line))).toBe(false)
      }
      const revisions = plans.filter(plan => plan.some(line => /SEARCH r USING PRIMARY KEY \(entry_id=\? AND revision<\?\)/i.test(line)))
      expect(revisions).toHaveLength(2)
      for (const plan of revisions) expect(plan.some(line => /SCAN|TEMP B-TREE/i.test(line))).toBe(false)
    } finally { db.close() }
  })

  test('detail loads bounded comparisons with the entry primary key', async () => {
    const db = database()
    try {
      const { binding, plans } = capture(db, true)
      await detail({ platform: { env: { DB: binding } }, params: { locale: 'en', id: '1' } } as any)
      expect(plans).toHaveLength(9)
      assertPlan(plans[0], /SEARCH entries USING INTEGER PRIMARY KEY \(rowid=\?\)/i)
      assertPlan(plans[1], /SEARCH evidence USING INDEX evidence_entry_date \(entry_id=\?\)/i)
      expect(plans[2].some(line => /SEARCH c USING INDEX crops_evidence \(evidence_id=\?\)/i.test(line))).toBe(true)
      expect(plans[3].some(line => /SEARCH eg USING .*entry_genres.*\(entry_id=\?\)/i.test(line))).toBe(true)
      expect(plans[4].some(line => /SEARCH ec USING .*entry_collections.*\(entry_id=\?\)/i.test(line))).toBe(true)
      expect(plans[5].some(line => /SEARCH r USING INDEX relations_from \(from_entry=\?\)/i.test(line))).toBe(true)
      expect(plans[6].some(line => /SEARCH character_tags USING .*\(entry_id=\?\)/i.test(line))).toBe(true)
      expect(plans[7].some(line => /SEARCH senses USING INDEX senses_entry \(entry_id=\?\)/i.test(line))).toBe(true)
      expect(plans[8].some(line => /SEARCH entry_encodings USING .*\(entry_id=\?\)/i.test(line))).toBe(true)
    } finally { db.close() }
  })

  test('detail uses the primary key', async () => {
    const db = database()
    try {
      const { binding, plans } = capture(db)
      await expect(detail({ platform: { env: { DB: binding } }, params: { locale: 'en', id: '1' } } as any)).rejects.toMatchObject({ status: 404 })
      expect(plans).toHaveLength(1)
      assertPlan(plans[0], /SEARCH entries USING INTEGER PRIMARY KEY \(rowid=\?\)/i)
    } finally { db.close() }
  })

  test('hidden queue uses the hidden index for cursor and descending order', async () => {
    const db = database()
    try {
      const { binding, plans, sqls } = capture(db)
      for (const path of ['/en/moderate', '/en/moderate?before=100']) {
        await queue({
          params: { locale: 'en' },
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
        params: { locale: 'en' },
        platform: { env: { DB: withoutIndex.binding } },
        locals: { moderator: 'mod@example.com' },
        url: new URL('https://example.test/en/moderate?before=100'),
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
      for (const path of ['/en/moderate/reports', '/en/moderate/reports?before=100']) {
        await reportsQueue({
          params: { locale: 'en' },
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
        params: { locale: 'en' },
        platform: { env: { DB: withoutIndex.binding } },
        locals: { moderator: 'mod@example.com' },
        url: new URL('https://example.test/en/moderate/reports'),
      } as any)
      expect(() => assertPlan(withoutIndex.plans[0]!, /SEARCH r USING INDEX entry_reports_open \(id<\?\)/i)).toThrow()
    } finally { db.close() }
  })

  test('image lookup uses the primary key', async () => {
    const db = database()
    try {
      const { binding, plans } = capture(db)
      const response = await image({ platform: { env: { DB: binding, IMAGES: fakeImages().bucket } }, params: { locale: 'en', id: '1' } } as any)
      expect(response.status).toBe(404)
      expect(response.headers.get('cache-control')).toBe('no-store')
      expect(plans).toHaveLength(1)
      assertPlan(plans[0], /SEARCH entries USING INTEGER PRIMARY KEY \(rowid=\?\)/i)
    } finally { db.close() }
  })
})
