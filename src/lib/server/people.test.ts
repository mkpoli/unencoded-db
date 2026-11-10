import { afterEach, describe, expect, test, setSystemTime } from 'bun:test'
import { hashHex } from './image'
import { createPerson, personOf, sessionCookie, startSession } from './people'
import { openTestDb } from './testdb'

const now = Date.parse('2026-11-07T00:00:00.000Z')
const year = 365 * 24 * 60 * 60 * 1000

afterEach(() => setSystemTime())

describe('browser sessions', () => {
  test('expires at the cookie lifetime while retaining the local person', async () => {
    setSystemTime(now)
    const { db, raw } = openTestDb()
    const person = await createPerson(db)
    const token = await startSession(db, person.id)
    expect(sessionCookie.maxAge * 1000).toBe(year)
    setSystemTime(now + year - 1)
    expect(await personOf(db, token)).toEqual(person)
    setSystemTime(now + year)
    expect(await personOf(db, token)).toBeNull()
    expect(raw.query('SELECT id FROM people WHERE id = ?').get(person.id)).toEqual({ id: person.id })
    const replacement = await startSession(db, person.id)
    expect(await personOf(db, replacement)).toEqual(person)
  })

  test('validates existing timestamps and rejects invalid, future and expired sessions', async () => {
    setSystemTime(now)
    const { db, raw } = openTestDb()
    const person = await createPerson(db)
    const insert = raw.prepare('INSERT INTO sessions(token_hash, person, created_at) VALUES(?,?,?)')
    for (const [token, date, valid] of [
      ['valid', new Date(now - year + 1).toISOString(), true],
      ['expired', new Date(now - year).toISOString(), false],
      ['future', new Date(now + 1).toISOString(), false],
      ['invalid', 'not-a-date', false],
      ['normalized', '2026-02-30T00:00:00.000Z', false],
      ['empty', '', false],
    ] as const) {
      insert.run(await hashHex(token), person.id, date)
      expect(await personOf(db, token)).toEqual(valid ? person : null)
    }
    expect(await personOf(db, undefined)).toBeNull()
    expect(await personOf(db, 'missing')).toBeNull()
  })

  test('cleans at most 100 expired sessions per creation using the expiry index', async () => {
    setSystemTime(now)
    const { db, raw } = openTestDb()
    const person = await createPerson(db)
    const insert = raw.prepare('INSERT INTO sessions(token_hash, person, created_at) VALUES(?,?,?)')
    for (let i = 0; i < 150; i++) insert.run(`old-${i}`, person.id, new Date(now - year - 1).toISOString())
    insert.run('live', person.id, new Date(now - year + 1).toISOString())
    const plan = raw.query('EXPLAIN QUERY PLAN SELECT token_hash FROM sessions WHERE created_at <= ? ORDER BY created_at LIMIT 100').all(new Date(now - year).toISOString())
    expect(JSON.stringify(plan)).toContain('sessions_created_at')
    await startSession(db, person.id)
    expect(raw.query("SELECT count(*) AS n FROM sessions WHERE token_hash LIKE 'old-%'").get()).toEqual({ n: 50 })
    expect(raw.query("SELECT token_hash FROM sessions WHERE token_hash = 'live'").get()).toEqual({ token_hash: 'live' })
    await startSession(db, person.id)
    expect(raw.query("SELECT count(*) AS n FROM sessions WHERE token_hash LIKE 'old-%'").get()).toEqual({ n: 0 })
  })
})
