import { Database } from 'bun:sqlite'
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { load as list } from './+page.server'
import { load as detail } from './entry/[id]/+page.server'

type PlanRow = { detail: string }

function database() {
  const db = new Database(':memory:')
  db.exec(readFileSync(new URL('../../migrations/0001_init.sql', import.meta.url), 'utf8'))
  db.exec(readFileSync(new URL('../../migrations/0002_related_characters.sql', import.meta.url), 'utf8'))
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

describe('foundation query plans', () => {
  test('list uses the primary key for cursor and descending order', async () => {
    const db = database()
    try {
      const { binding, plans } = capture(db)
      await list({ platform: { env: { DB: binding } }, url: new URL('https://example.test/?before=100') } as any)
      expect(plans).toHaveLength(1)
      assertPlan(plans[0], /SEARCH entries USING INTEGER PRIMARY KEY \(rowid<\?\)/i)
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
