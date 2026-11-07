import { describe, expect, test } from 'bun:test'
import type { Database } from 'bun:sqlite'
import { auditRows, entryVisible, insertEntry, insertReport, reportRows, testDatabase } from './test-db'

function audit(db: Database, entryId: number, action: 'hide' | 'restore', createdAt = '2026-02-03T04:05:06.000Z') {
  return db
    .query('INSERT INTO moderation_audit (entry_id, action, moderator, created_at) VALUES (?, ?, ?, ?)')
    .run(entryId, action, 'mod@example.com', createdAt)
}

function openPlan(db: Database): { detail: string }[] {
  const statement = db.prepare('EXPLAIN QUERY PLAN SELECT id FROM entry_reports WHERE resolved_at IS NULL AND id < 100 ORDER BY id DESC LIMIT 21')
  try {
    return statement.all() as { detail: string }[]
  } finally {
    statement.finalize()
  }
}

describe('reports migration', () => {
  test('accepts a valid report and stores only the report fields', () => {
    const db = testDatabase()
    try {
      const entry = insertEntry(db)
      const id = insertReport(db, entry, 'privacy', 'Personal information', '2026-01-05T00:00:00.000Z')
      expect(reportRows(db)).toEqual([{
        id,
        entry_id: entry,
        reason: 'privacy',
        note: 'Personal information',
        created_at: '2026-01-05T00:00:00.000Z',
        resolved_at: null,
      }])
      const columns = db.query('PRAGMA table_info(entry_reports)').all() as { name: string }[]
      expect(columns.map(column => column.name)).toEqual(['id', 'entry_id', 'reason', 'note', 'created_at', 'resolved_at'])
    } finally { db.close() }
  })

  test('rejects unknown reasons and notes over 2000 characters', () => {
    const db = testDatabase()
    try {
      const entry = insertEntry(db)
      expect(() => insertReport(db, entry, 'advertising')).toThrow(/CHECK/i)
      expect(() => insertReport(db, entry, 'spam', 'x'.repeat(2001))).toThrow(/CHECK/i)
      expect(reportRows(db)).toHaveLength(0)
      expect(insertReport(db, entry, 'other', 'x'.repeat(2000))).toBe(1)
    } finally { db.close() }
  })

  test('rejects reports for hidden and missing entries', () => {
    const db = testDatabase()
    try {
      const visible = insertEntry(db)
      const hidden = insertEntry(db, 0)
      expect(() => insertReport(db, hidden)).toThrow(/entry is not visible/)
      expect(() => insertReport(db, 999)).toThrow(/entry is not visible/)
      expect(reportRows(db)).toHaveLength(0)
      expect(insertReport(db, visible)).toBe(1)
    } finally { db.close() }
  })

  test('caps open reports per entry', () => {
    const db = testDatabase()
    try {
      const entry = insertEntry(db)
      for (let index = 0; index < 100; index++) insertReport(db, entry, 'spam', `note ${index}`)
      expect(() => insertReport(db, entry, 'spam', 'overflow')).toThrow(/too many open reports/)
      expect(reportRows(db)).toHaveLength(100)

      audit(db, entry, 'hide')
      const open = db.query('SELECT count(*) AS n FROM entry_reports WHERE resolved_at IS NULL').get() as { n: number }
      expect(open.n).toBe(0)

      audit(db, entry, 'restore')
      expect(insertReport(db, entry, 'other', 'after restore')).toBe(101)
    } finally { db.close() }
  })

  test('hiding resolves every open report in the same statement', () => {
    const db = testDatabase()
    try {
      const reported = insertEntry(db)
      const other = insertEntry(db)
      const first = insertReport(db, reported, 'spam', 'first', '2026-01-01T00:00:00.000Z')
      const second = insertReport(db, reported, 'rights', 'second', '2026-01-02T00:00:00.000Z')
      const alreadyResolved = insertReport(db, reported, 'other', 'old', '2026-01-03T00:00:00.000Z')
      const unrelated = insertReport(db, other, 'privacy', 'elsewhere', '2026-01-04T00:00:00.000Z')
      db.query("UPDATE entry_reports SET resolved_at = '2026-01-04T00:00:00.000Z' WHERE id = ?").run(alreadyResolved)

      audit(db, reported, 'hide', '2026-02-03T04:05:06.000Z')

      const rows = reportRows(db)
      expect(rows.find(row => row.id === first)?.resolved_at).toBe('2026-02-03T04:05:06.000Z')
      expect(rows.find(row => row.id === second)?.resolved_at).toBe('2026-02-03T04:05:06.000Z')
      expect(rows.find(row => row.id === alreadyResolved)?.resolved_at).toBe('2026-01-04T00:00:00.000Z')
      expect(rows.find(row => row.id === unrelated)?.resolved_at).toBeNull()
      expect(entryVisible(db, reported)).toBe(0)
      expect(auditRows(db)).toHaveLength(1)
    } finally { db.close() }
  })

  test('restoring does not reopen resolved reports', () => {
    const db = testDatabase()
    try {
      const entry = insertEntry(db)
      const report = insertReport(db, entry)
      audit(db, entry, 'hide', '2026-02-03T04:05:06.000Z')
      audit(db, entry, 'restore', '2026-02-04T04:05:06.000Z')

      expect(entryVisible(db, entry)).toBe(1)
      expect(reportRows(db).find(row => row.id === report)?.resolved_at).toBe('2026-02-03T04:05:06.000Z')
    } finally { db.close() }
  })

  test('rolls the hide back when resolving a report fails', () => {
    const db = testDatabase()
    try {
      const entry = insertEntry(db)
      const report = insertReport(db, entry)
      db.exec(`CREATE TRIGGER test_reject_resolution
        BEFORE UPDATE ON entry_reports
        WHEN NEW.resolved_at IS NOT NULL
        BEGIN SELECT RAISE(ABORT, 'test resolution failure'); END;`)

      expect(() => audit(db, entry, 'hide')).toThrow(/test resolution failure/)
      expect(entryVisible(db, entry)).toBe(1)
      expect(auditRows(db)).toHaveLength(0)
      expect(reportRows(db).find(row => row.id === report)?.resolved_at).toBeNull()
    } finally { db.close() }
  })

  test('open reports use the partial index without a temporary sort', () => {
    const db = testDatabase()
    try {
      const plan = openPlan(db)
      expect(plan.some(row => /SEARCH entry_reports USING INDEX entry_reports_open \(id<\?\)/i.test(row.detail))).toBe(true)
      expect(plan.some(row => /USE TEMP B-TREE/i.test(row.detail))).toBe(false)

      db.exec('DROP INDEX entry_reports_open')
      const withoutIndex = openPlan(db)
      expect(withoutIndex.some(row => /entry_reports_open/i.test(row.detail))).toBe(false)
    } finally { db.close() }
  })

  test('resolution uses the entry index', () => {
    const db = testDatabase()
    try {
      const statement = db.prepare('EXPLAIN QUERY PLAN UPDATE entry_reports SET resolved_at = ? WHERE entry_id = ? AND resolved_at IS NULL')
      let plan: { detail: string }[]
      try {
        plan = statement.all() as { detail: string }[]
      } finally {
        statement.finalize()
      }
      expect(plan.some(row => /SEARCH entry_reports USING INDEX entry_reports_entry \(entry_id=\?\)/i.test(row.detail))).toBe(true)
      expect(plan.some(row => /\bSCAN entry_reports\b/i.test(row.detail))).toBe(false)
    } finally { db.close() }
  })
})
