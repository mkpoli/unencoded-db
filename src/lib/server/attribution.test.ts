import { Database } from 'bun:sqlite'
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { cookieOptions, hashToken, saveEvidence } from './attribution'
import { readEvidence } from './evidence'

function setup() {
  const db = new Database(':memory:')
  db.exec('PRAGMA foreign_keys = ON')
  db.exec(readFileSync(new URL('../../../migrations/0001_init.sql', import.meta.url), 'utf8'))
  db.exec(readFileSync(new URL('../../../migrations/0002_entry_visibility.sql', import.meta.url), 'utf8'))
  db.exec(readFileSync(new URL('../../../migrations/0003_related_characters.sql', import.meta.url), 'utf8'))
  db.exec("INSERT INTO entries (script, place, url, created_at) VALUES ('old', 'old', 'https://example.org', '2020')")
  db.exec(readFileSync(new URL('../../../migrations/0004_attribution.sql', import.meta.url), 'utf8'))
  const plans: string[][] = []
  const binding = {
    prepare(sql: string) {
      return { bind(...values: (string | null)[]) {
        const explain = db.prepare(`EXPLAIN QUERY PLAN ${sql}`)
        try {
          const plan = explain.all(...values) as { detail: string }[]
          plans.push(plan.map(row => row.detail))
        } finally { explain.finalize() }
        const execute = () => {
          const statement = db.prepare(sql)
          try { return statement.all(...values) } finally { statement.finalize() }
        }
        return { first: async () => execute()[0] ?? null, execute }
      } }
    },
    batch: async (statements: { execute: () => unknown[] }[]) => db.transaction(() => statements.map(s => ({ results: s.execute() })))(),
  } as unknown as D1Database
  return { db, binding, plans }
}
const form = new FormData()
form.set('script', 'Han')
form.set('url', 'https://example.org/')
const evidence = readEvidence(form)!
const count = (db: Database, table: string) => (db.query(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n

describe('anonymous attribution', () => {
  test('uses host-only secure cookies or explicit loopback HTTP', () => {
    expect(cookieOptions(new URL('https://example.org'))).toEqual({ name: '__Host-contributor', secure: true })
    for (const host of ['localhost', '127.0.0.1', '[::1]']) expect(cookieOptions(new URL(`http://${host}/`))?.secure).toBe(false)
    for (const host of ['example.org', 'localhost.example.org', '127.0.0.2']) expect(cookieOptions(new URL(`http://${host}/`))).toBeNull()
  })
  test('creates a hashed session and reuses its person; old entries stay unattributed', async () => {
    const { db, binding, plans } = setup()
    try {
      const first = await saveEvidence(binding, evidence, undefined)
      expect(first.token).toMatch(/^[0-9a-f]{64}$/)
      const session = db.query('SELECT * FROM contributor_sessions').get() as any
      expect(session.token_hash).toBe(await hashToken(first.token!))
      expect(session.token_hash).not.toBe(first.token)
      const second = await saveEvidence(binding, evidence, first.token)
      expect(second.token).toBeUndefined()
      const rows = db.query('SELECT creator_id FROM entries ORDER BY id').all() as any[]
      expect(rows[0].creator_id).toBeNull()
      expect(rows[1].creator_id).toBe(session.person_id)
      expect(rows[2].creator_id).toBe(session.person_id)
      expect(count(db, 'persons')).toBe(1)
      const plan = plans.find(lines => lines.some(line => /SEARCH contributor_sessions/i.test(line)))!
      expect(plan).toBeDefined()
      expect(plan.some(line => /SEARCH contributor_sessions USING INDEX/i.test(line))).toBe(true)
      expect(plan.some(line => /SCAN contributor_sessions|USE TEMP B-TREE/i.test(line))).toBe(false)
    } finally { db.close() }
  })
  test.each(['expired', 'revoked', 'unknown', 'malformed'])('%s session never recovers the prior person', async state => {
    const { db, binding } = setup()
    try {
      const first = await saveEvidence(binding, evidence, undefined)
      if (state === 'expired') db.exec("UPDATE contributor_sessions SET expires_at = '2000-01-01T00:00:00.000Z'")
      if (state === 'revoked') db.exec("UPDATE contributor_sessions SET revoked_at = '2020-01-01T00:00:00.000Z'")
      const token = state === 'unknown' ? 'a'.repeat(64) : state === 'malformed' ? 'bad' : first.token
      const next = await saveEvidence(binding, evidence, token)
      expect(next.token).toBeDefined()
      const creators = db.query('SELECT creator_id FROM entries WHERE id > 1 ORDER BY id').all() as any[]
      expect(creators[0].creator_id).not.toBe(creators[1].creator_id)
    } finally { db.close() }
  })
  test.each(['persons', 'contributor_sessions', 'entries'])('rolls back creation if %s insert fails', async table => {
    const { db, binding } = setup()
    try {
      db.exec(`CREATE TRIGGER fail_insert BEFORE INSERT ON ${table} BEGIN SELECT RAISE(ABORT, 'failure'); END`)
      await expect(saveEvidence(binding, evidence, undefined)).rejects.toThrow()
      expect(count(db, 'persons')).toBe(0)
      expect(count(db, 'contributor_sessions')).toBe(0)
      expect(count(db, 'entries')).toBe(1)
    } finally { db.close() }
  })
  test('session query plan guard detects loss of the token index', async () => {
    const { db } = setup()
    try {
      let sql = ''
      let params: (string | null)[] = []
      const capture = { prepare(query: string) {
        sql = query
        return { bind(...values: (string | null)[]) {
          params = values
          return { first: async () => { throw new Error('captured') } }
        } }
      } } as unknown as D1Database
      await expect(saveEvidence(capture, evidence, 'a'.repeat(64))).rejects.toThrow('captured')
      const details = (query: string) => (db.prepare(`EXPLAIN QUERY PLAN ${query}`).all(...params) as { detail: string }[]).map(row => row.detail)
      const indexed = details(sql)
      const withoutIndex = details(sql.replace('WHERE token_hash =', 'WHERE +token_hash ='))
      expect(indexed.some(line => /SEARCH contributor_sessions USING INDEX/i.test(line))).toBe(true)
      expect(withoutIndex.some(line => /SCAN contributor_sessions/i.test(line))).toBe(true)
    } finally { db.close() }
  })
  test('revocation immediately before the write cannot authorize the old person', async () => {
    const { db, binding } = setup()
    try {
      const first = await saveEvidence(binding, evidence, undefined)
      const original = binding.prepare.bind(binding)
      const racing = { ...binding, prepare(sql: string) {
        const statement = original(sql)
        if (!sql.includes('FROM contributor_sessions')) return statement
        return { bind(...values: unknown[]) {
          const bound = statement.bind(...values)
          return { async first() {
            db.exec("UPDATE contributor_sessions SET revoked_at = '2026-01-01T00:00:00.000Z'")
            return bound.first()
          } }
        } }
      } } as unknown as D1Database
      const second = await saveEvidence(racing, evidence, first.token)
      expect(second.token).toBeDefined()
      const rows = db.query('SELECT creator_id FROM entries WHERE id > 1 ORDER BY id').all() as any[]
      expect(rows[0].creator_id).not.toBe(rows[1].creator_id)
    } finally { db.close() }
  })
  test('simultaneous fresh and existing requests do not reassign bearers', async () => {
    const { db, binding } = setup()
    try {
      const [a, b] = await Promise.all([saveEvidence(binding, evidence, undefined), saveEvidence(binding, evidence, undefined)])
      expect(a.token).not.toBe(b.token)
      const [againA, againB] = await Promise.all([saveEvidence(binding, evidence, a.token), saveEvidence(binding, evidence, b.token)])
      const creator = (id: number) => (db.query('SELECT creator_id FROM entries WHERE id = ?').get(id) as any).creator_id
      expect(creator(a.id)).not.toBe(creator(b.id))
      expect(creator(againA.id)).toBe(creator(a.id))
      expect(creator(againB.id)).toBe(creator(b.id))
    } finally { db.close() }
  })
})
