import { describe, expect, test } from 'bun:test'
import type { Database } from 'bun:sqlite'
import { auditRows, d1Binding, insertEntry, insertReport, reportRows, testDatabase } from '$lib/server/test-db'
import { GET as reportGet, POST as reportPost } from './entry/[id]/report/+server'
import { load as reportsQueue } from './moderate/reports/+page.server'
import { POST as hide } from './moderate/[id]/hide/+server'

const EMAIL = 'mod@example.com'

type ReportOptions = {
  db?: D1Database
  id?: string | number
  values?: Record<string, string>
  origin?: string | null
  method?: string
}

function reportEvent(options: ReportOptions = {}) {
  const id = options.id ?? 1
  const url = new URL(`https://example.test/entry/${id}/report`)
  const headers = new Headers()
  if (options.origin !== null) headers.set('origin', options.origin ?? url.origin)
  let request: Request
  if ((options.method ?? 'POST') === 'GET') {
    request = new Request(url, { method: 'GET', headers })
  } else {
    const form = new FormData()
    for (const [key, value] of Object.entries(options.values ?? { reason: 'spam' })) form.set(key, value)
    request = new Request(url, { method: 'POST', headers, body: form })
  }
  return {
    params: { id: String(id) },
    request,
    url,
    platform: options.db ? { env: { DB: options.db } } : { env: {} },
    locals: { moderator: null },
  } as any
}

type QueueOptions = {
  before?: number
  moderator?: string | null
}

function queueEvent(db: Database, options: QueueOptions = {}) {
  const url = new URL('https://example.test/moderate/reports')
  if (options.before !== undefined) url.searchParams.set('before', String(options.before))
  return {
    platform: { env: { DB: d1Binding(db) } },
    locals: { moderator: options.moderator === undefined ? EMAIL : options.moderator },
    url,
  } as any
}

function hideEvent(db: Database, id: number) {
  const url = new URL(`https://example.test/moderate/${id}/hide`)
  return {
    params: { id: String(id) },
    request: new Request(url, { method: 'POST', headers: { origin: url.origin } }),
    url,
    platform: { env: { DB: d1Binding(db) } },
    locals: { moderator: EMAIL },
  } as any
}

describe('report route', () => {
  test('stores an anonymous report, trims the note and redirects', async () => {
    const db = testDatabase()
    try {
      const DB = d1Binding(db)
      const entry = insertEntry(db)
      await expect(reportPost(reportEvent({
        db: DB,
        id: entry,
        values: { reason: 'privacy', note: '  Personal information  ' },
      }))).rejects.toMatchObject({ status: 303, location: `/entry/${entry}?reported=1` })

      const rows = reportRows(db)
      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({ entry_id: entry, reason: 'privacy', note: 'Personal information', resolved_at: null })
      expect(new Date(rows[0]!.created_at).toISOString()).toBe(rows[0]!.created_at)
    } finally { db.close() }
  })

  test('accepts an empty note and every allowed reason', async () => {
    const db = testDatabase()
    try {
      const DB = d1Binding(db)
      const entry = insertEntry(db)
      for (const reason of ['spam', 'privacy', 'rights', 'other']) {
        await expect(reportPost(reportEvent({ db: DB, id: entry, values: { reason } }))).rejects.toMatchObject({ status: 303 })
      }
      expect(reportRows(db).map(row => row.reason)).toEqual(['spam', 'privacy', 'rights', 'other'])
      expect(reportRows(db).every(row => row.note === '')).toBe(true)
    } finally { db.close() }
  })

  test('rejects an unknown reason and an oversized note with 400', async () => {
    const db = testDatabase()
    try {
      const DB = d1Binding(db)
      const entry = insertEntry(db)
      const invalid: Record<string, string>[] = [
        { reason: 'advertising' },
        {},
        { reason: 'spam', note: 'x'.repeat(2001) },
      ]
      for (const values of invalid) {
        const response = await reportPost(reportEvent({ db: DB, id: entry, values })) as Response
        expect(response.status).toBe(400)
      }
      expect(reportRows(db)).toHaveLength(0)
    } finally { db.close() }
  })

  test('rejects a malformed body with 400', async () => {
    const db = testDatabase()
    try {
      const DB = d1Binding(db)
      const entry = insertEntry(db)
      const url = new URL(`https://example.test/entry/${entry}/report`)
      const request = new Request(url, {
        method: 'POST',
        headers: { origin: url.origin, 'content-type': 'application/json' },
        body: '{"reason":"spam"}',
      })
      const response = await reportPost({
        params: { id: String(entry) },
        request,
        url,
        platform: { env: { DB } },
        locals: { moderator: null },
      } as any) as Response
      expect(response.status).toBe(400)
      expect(reportRows(db)).toHaveLength(0)
    } finally { db.close() }
  })

  test('returns 404 for hidden, missing and malformed entry ids', async () => {
    const db = testDatabase()
    try {
      const DB = d1Binding(db)
      const hidden = insertEntry(db, 0)
      for (const id of [hidden, 999]) {
        await expect(reportPost(reportEvent({ db: DB, id }))).rejects.toMatchObject({ status: 404 })
      }
      for (const id of ['0', 'abc', '1.5', '-1', '9007199254740992']) {
        await expect(reportPost(reportEvent({ db: DB, id }))).rejects.toMatchObject({ status: 404 })
      }
      expect(reportRows(db)).toHaveLength(0)
    } finally { db.close() }
  })

  test('returns 403 for cross-origin and missing Origin headers', async () => {
    const db = testDatabase()
    try {
      const DB = d1Binding(db)
      const entry = insertEntry(db)
      const cross = await reportPost(reportEvent({ db: DB, id: entry, origin: 'https://evil.test' })) as Response
      expect(cross.status).toBe(403)
      const missing = await reportPost(reportEvent({ db: DB, id: entry, origin: null })) as Response
      expect(missing.status).toBe(403)
      expect(reportRows(db)).toHaveLength(0)
    } finally { db.close() }
  })

  test('returns 404 when a concurrent hide rejects the insert', async () => {
    const db = testDatabase()
    try {
      const entry = insertEntry(db)
      const DB = {
        prepare(sql: string) {
          return {
            bind(...values: unknown[]) {
              if (sql.startsWith('SELECT')) {
                return { first: async () => ({ id: entry }) }
              }
              return { run: async () => { throw new Error('reports: entry is not visible') } }
            },
          }
        },
      } as unknown as D1Database
      await expect(reportPost(reportEvent({ db: DB, id: entry }))).rejects.toMatchObject({ status: 404 })
    } finally { db.close() }
  })

  test('rejects GET with 405', async () => {
    const response = await reportGet(reportEvent({ method: 'GET' })) as Response
    expect(response.status).toBe(405)
    expect(response.headers.get('allow')).toBe('POST')
    expect(await response.text()).toBe('Method Not Allowed')
  })
})

describe('moderation report queue', () => {
  test('lists only open reports newest first with joined entry fields', async () => {
    const db = testDatabase()
    try {
      const firstEntry = insertEntry(db, 1, 'First')
      const secondEntry = insertEntry(db, 1, 'Second')
      db.query("UPDATE entries SET description = 'A description', place = 'A place' WHERE id = ?").run(secondEntry)
      const first = insertReport(db, firstEntry, 'spam', 'first note', '2026-01-01T00:00:00.000Z')
      const second = insertReport(db, secondEntry, 'rights', 'second note', '2026-01-02T00:00:00.000Z')
      const resolved = insertReport(db, firstEntry, 'other', 'resolved note', '2026-01-03T00:00:00.000Z')
      db.query('UPDATE entry_reports SET resolved_at = ? WHERE id = ?').run('2026-01-04T00:00:00.000Z', resolved)

      const page = await reportsQueue(queueEvent(db)) as any
      expect(page.reports.map((report: { report_id: number }) => report.report_id)).toEqual([second, first])
      expect(page.reports[0]).toMatchObject({
        report_id: second,
        reason: 'rights',
        note: 'second note',
        created_at: '2026-01-02T00:00:00.000Z',
        entry_id: secondEntry,
        script: 'Second',
        description: 'A description',
        place: 'A place',
      })
      expect(page.next).toBeNull()
      expect(page.moderator).toBe(EMAIL)
    } finally { db.close() }
  })

  test('pages by before-id keyset cursor', async () => {
    const db = testDatabase()
    try {
      const ids = Array.from({ length: 25 }, () => insertEntry(db))
      const reportIds = ids.map(id => insertReport(db, id))
      const first = await reportsQueue(queueEvent(db)) as any
      expect(first.reports).toHaveLength(20)
      expect(first.reports.map((report: { report_id: number }) => report.report_id)).toEqual(reportIds.slice(5).reverse())
      expect(first.next).toBe(reportIds[5])

      const second = await reportsQueue(queueEvent(db, { before: first.next })) as any
      expect(second.reports.map((report: { report_id: number }) => report.report_id)).toEqual(reportIds.slice(0, 5).reverse())
      expect(second.next).toBeNull()
    } finally { db.close() }
  })

  test('dropping a resolved or hidden report from the queue', async () => {
    const db = testDatabase()
    try {
      const openEntry = insertEntry(db)
      const hiddenEntry = insertEntry(db)
      const resolvedEntry = insertEntry(db)
      const open = insertReport(db, openEntry, 'spam', 'open')
      insertReport(db, hiddenEntry, 'privacy', 'hidden')
      const resolved = insertReport(db, resolvedEntry, 'other', 'resolved')
      db.query('UPDATE entry_reports SET resolved_at = ? WHERE id = ?').run('2026-01-06T00:00:00.000Z', resolved)
      db.query("INSERT INTO moderation_audit (entry_id, action, moderator, created_at) VALUES (?, 'hide', ?, '2026-01-07T00:00:00.000Z')").run(hiddenEntry, EMAIL)

      const page = await reportsQueue(queueEvent(db)) as any
      expect(page.reports.map((report: { report_id: number }) => report.report_id)).toEqual([open])
    } finally { db.close() }
  })

  test('hiding from the queue resolves reports and removes them', async () => {
    const db = testDatabase()
    try {
      const entry = insertEntry(db)
      const report = insertReport(db, entry, 'privacy', 'please hide')
      expect((await reportsQueue(queueEvent(db)) as any).reports).toHaveLength(1)

      await expect(hide(hideEvent(db, entry))).rejects.toMatchObject({ status: 303, location: '/moderate' })
      expect((await reportsQueue(queueEvent(db)) as any).reports).toHaveLength(0)
      expect(reportRows(db).find(row => row.id === report)?.resolved_at).toBe(auditRows(db)[0]!.created_at)
    } finally { db.close() }
  })

  test('requires an authenticated moderator', async () => {
    const db = testDatabase()
    try {
      await expect(reportsQueue(queueEvent(db, { moderator: null }))).rejects.toMatchObject({ status: 404 })
    } finally { db.close() }
  })

  test('ignores a malformed cursor and returns an empty queue', async () => {
    const db = testDatabase()
    try {
      insertEntry(db)
      const url = new URL('https://example.test/moderate/reports?before=abc')
      const page = await reportsQueue({
        platform: { env: { DB: d1Binding(db) } },
        locals: { moderator: EMAIL },
        url,
      } as any) as any
      expect(page.reports).toEqual([])
      expect(page.next).toBeNull()
    } finally { db.close() }
  })
})
