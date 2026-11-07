import { describe, expect, test } from 'bun:test'
import type { Database } from 'bun:sqlite'
import {
  dismissalRows,
  entryVisible,
  insertDismissal,
  insertEntry,
  insertReport,
  reportRows,
  testDatabase,
} from './test-db'

const MODERATOR = 'mod@example.com'
const DISMISSED_AT = '2026-02-03T04:05:06.000Z'

function audit(db: Database, entryId: number, action: 'hide' | 'restore', createdAt: string) {
  return db
    .query('INSERT INTO moderation_audit (entry_id, action, moderator, created_at) VALUES (?, ?, ?, ?)')
    .run(entryId, action, MODERATOR, createdAt)
}

describe('report dismissals migration', () => {
  test('resolves only the dismissed report and records one audit row', () => {
    const db = testDatabase()
    try {
      const reported = insertEntry(db)
      const other = insertEntry(db)
      const dismissed = insertReport(db, reported, 'spam', 'first')
      const remaining = insertReport(db, reported, 'rights', 'second')
      const elsewhere = insertReport(db, other, 'privacy', 'elsewhere')

      insertDismissal(db, dismissed, MODERATOR, DISMISSED_AT)

      const rows = reportRows(db)
      expect(rows.find(row => row.id === dismissed)?.resolved_at).toBe(DISMISSED_AT)
      expect(rows.find(row => row.id === remaining)?.resolved_at).toBeNull()
      expect(rows.find(row => row.id === elsewhere)?.resolved_at).toBeNull()
      expect(entryVisible(db, reported)).toBe(1)
      expect(entryVisible(db, other)).toBe(1)
      expect(dismissalRows(db)).toEqual([{ report_id: dismissed, moderator: MODERATOR, dismissed_at: DISMISSED_AT }])

      const columns = db.query('PRAGMA table_info(report_dismissals)').all() as { name: string; pk: number }[]
      expect(columns.map(column => column.name)).toEqual(['report_id', 'moderator', 'dismissed_at'])
      expect(columns.find(column => column.name === 'report_id')?.pk).toBe(1)
    } finally { db.close() }
  })

  test('dismissing frees a cap slot for a new report', () => {
    const db = testDatabase()
    try {
      const entry = insertEntry(db)
      for (let index = 0; index < 100; index++) insertReport(db, entry, 'spam', '')
      expect(() => insertReport(db, entry, 'spam', '')).toThrow(/too many open reports/)

      const first = reportRows(db)[0]!.id
      insertDismissal(db, first, MODERATOR, DISMISSED_AT)
      const accepted = insertReport(db, entry, 'other', 'after dismissal')
      const rows = reportRows(db)
      expect(rows.filter(row => row.resolved_at === null)).toHaveLength(100)
      expect(rows.find(row => row.id === accepted)?.resolved_at).toBeNull()
    } finally { db.close() }
  })

  test('rejects a second dismissal and leaves the first row in place', () => {
    const db = testDatabase()
    try {
      const entry = insertEntry(db)
      const report = insertReport(db, entry)
      insertDismissal(db, report)

      expect(() => insertDismissal(db, report, 'other@example.com', '2026-03-01T00:00:00.000Z')).toThrow(/already dismissed/)
      expect(() => db.query("INSERT OR IGNORE INTO report_dismissals (report_id, moderator, dismissed_at) VALUES (?, 'other@example.com', '2026-03-01T00:00:00.000Z')").run(report)).toThrow(/already dismissed/)
      expect(dismissalRows(db)).toEqual([{ report_id: report, moderator: MODERATOR, dismissed_at: DISMISSED_AT }])
      expect(reportRows(db)[0]!.resolved_at).toBe(DISMISSED_AT)
    } finally { db.close() }
  })

  test('rejects a missing report and a report that is already resolved', () => {
    const db = testDatabase()
    try {
      expect(() => insertDismissal(db, 999)).toThrow(/unknown report/)

      const entry = insertEntry(db)
      const report = insertReport(db, entry)
      db.query('UPDATE entry_reports SET resolved_at = ? WHERE id = ?').run('2026-01-06T00:00:00.000Z', report)
      expect(() => insertDismissal(db, report)).toThrow(/not open/)
      expect(dismissalRows(db)).toHaveLength(0)
    } finally { db.close() }
  })

  test('rejects a report whose entry is hidden', () => {
    const db = testDatabase()
    try {
      const entry = insertEntry(db)
      const report = insertReport(db, entry)
      db.query('UPDATE entries SET visible = 0 WHERE id = ?').run(entry)

      expect(() => insertDismissal(db, report)).toThrow(/entry is not visible/)
      expect(dismissalRows(db)).toHaveLength(0)
      expect(reportRows(db)[0]!.resolved_at).toBeNull()
      expect(entryVisible(db, entry)).toBe(0)
    } finally { db.close() }
  })

  test('rejects malformed moderator and dismissal time values', () => {
    const db = testDatabase()
    try {
      const entry = insertEntry(db)
      const report = insertReport(db, entry)
      expect(() => insertDismissal(db, report, 'xx')).toThrow(/CHECK/i)
      expect(() => insertDismissal(db, report, 'x'.repeat(321))).toThrow(/CHECK/i)
      expect(() => db.query("INSERT INTO report_dismissals (report_id, moderator, dismissed_at) VALUES (?, 'mod@example.com', NULL)").run(report)).toThrow(/NOT NULL/i)
      expect(dismissalRows(db)).toHaveLength(0)
      expect(reportRows(db)[0]!.resolved_at).toBeNull()
    } finally { db.close() }
  })

  test('keeps dismissal rows append-only', () => {
    const db = testDatabase()
    try {
      const entry = insertEntry(db)
      const report = insertReport(db, entry)
      insertDismissal(db, report)

      expect(() => db.query("UPDATE report_dismissals SET moderator = 'evil@example.com' WHERE report_id = ?").run(report)).toThrow(/append-only/)
      expect(() => db.query("UPDATE report_dismissals SET dismissed_at = '2026-03-01T00:00:00.000Z' WHERE report_id = ?").run(report)).toThrow(/append-only/)
      expect(() => db.query('UPDATE report_dismissals SET report_id = ? WHERE report_id = ?').run(report + 1, report)).toThrow(/append-only/)
      expect(() => db.query('DELETE FROM report_dismissals WHERE report_id = ?').run(report)).toThrow(/append-only/)
      expect(() => db.query("INSERT OR REPLACE INTO report_dismissals (report_id, moderator, dismissed_at) VALUES (?, 'evil@example.com', '2026-03-01T00:00:00.000Z')").run(report)).toThrow(/already dismissed/)

      expect(dismissalRows(db)).toEqual([{ report_id: report, moderator: MODERATOR, dismissed_at: DISMISSED_AT }])
      expect(reportRows(db)[0]!.resolved_at).toBe(DISMISSED_AT)
    } finally { db.close() }
  })

  test('ignored inserts never resolve a report', () => {
    const db = testDatabase()
    try {
      const entry = insertEntry(db)
      const report = insertReport(db, entry)

      const shortModerator = db.query("INSERT OR IGNORE INTO report_dismissals (report_id, moderator, dismissed_at) VALUES (?, 'xx', '2026-03-01T00:00:00.000Z')").run(report)
      expect(shortModerator.changes).toBe(0)
      const missingTime = db.query("INSERT OR IGNORE INTO report_dismissals (report_id, moderator, dismissed_at) VALUES (?, 'mod@example.com', NULL)").run(report)
      expect(missingTime.changes).toBe(0)

      expect(dismissalRows(db)).toHaveLength(0)
      expect(reportRows(db)[0]!.resolved_at).toBeNull()
    } finally { db.close() }
  })

  test('rolls back the resolution when an injected after trigger fails', () => {
    const db = testDatabase()
    try {
      const entry = insertEntry(db)
      const report = insertReport(db, entry)
      db.exec(`CREATE TRIGGER test_reject_resolution AFTER UPDATE ON entry_reports
        WHEN NEW.resolved_at IS NOT NULL
        BEGIN SELECT RAISE(ABORT, 'test resolution failure'); END;`)

      expect(() => insertDismissal(db, report)).toThrow(/test resolution failure/)
      expect(dismissalRows(db)).toHaveLength(0)
      expect(reportRows(db)[0]!.resolved_at).toBeNull()
      expect(entryVisible(db, entry)).toBe(1)
    } finally { db.close() }
  })

  test('hiding resolves the remaining reports and dismissed reports stay resolved after restore', () => {
    const db = testDatabase()
    try {
      const entry = insertEntry(db)
      const dismissed = insertReport(db, entry, 'spam', 'dismissed')
      const remaining = insertReport(db, entry, 'rights', 'remaining')

      insertDismissal(db, dismissed, MODERATOR, DISMISSED_AT)
      audit(db, entry, 'hide', '2026-02-04T00:00:00.000Z')

      expect(entryVisible(db, entry)).toBe(0)
      let rows = reportRows(db)
      expect(rows.find(row => row.id === dismissed)?.resolved_at).toBe(DISMISSED_AT)
      expect(rows.find(row => row.id === remaining)?.resolved_at).toBe('2026-02-04T00:00:00.000Z')
      expect(dismissalRows(db)).toHaveLength(1)

      audit(db, entry, 'restore', '2026-02-05T00:00:00.000Z')

      expect(entryVisible(db, entry)).toBe(1)
      rows = reportRows(db)
      expect(rows.find(row => row.id === dismissed)?.resolved_at).toBe(DISMISSED_AT)
      expect(rows.find(row => row.id === remaining)?.resolved_at).toBe('2026-02-04T00:00:00.000Z')
      expect(dismissalRows(db)).toHaveLength(1)
    } finally { db.close() }
  })
})
