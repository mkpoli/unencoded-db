import { describe, expect, test } from 'bun:test'
import type { Database } from 'bun:sqlite'
import { auditRows, entryVisible, insertEntry, testDatabase } from './test-db'

function audit(db: Database, entryId: number, action: string, moderator = 'mod@example.com', createdAt = '2026-01-02T03:04:05.000Z') {
  return db.query('INSERT INTO moderation_audit (entry_id, action, moderator, created_at) VALUES (?, ?, ?, ?)').run(entryId, action, moderator, createdAt)
}

function auditCount(db: Database): number {
  return (db.query('SELECT count(*) AS count FROM moderation_audit').get() as { count: number }).count
}

describe('moderation migration', () => {
  test('hide and restore transition visibility and append audit rows', () => {
    const db = testDatabase()
    try {
      const first = insertEntry(db, 1)
      const second = insertEntry(db, 1)

      audit(db, first, 'hide')
      expect(entryVisible(db, first)).toBe(0)
      expect(entryVisible(db, second)).toBe(1)
      expect(auditRows(db)).toEqual([{
        id: 1,
        entry_id: first,
        action: 'hide',
        moderator: 'mod@example.com',
        created_at: '2026-01-02T03:04:05.000Z',
      }])

      audit(db, first, 'restore')
      expect(entryVisible(db, first)).toBe(1)
      expect(auditRows(db).map(row => row.action)).toEqual(['hide', 'restore'])
    } finally { db.close() }
  })

  test('rejects a second hide and a restore of a visible entry', () => {
    const db = testDatabase()
    try {
      const id = insertEntry(db, 1)
      audit(db, id, 'hide')
      expect(() => audit(db, id, 'hide')).toThrow(/not visible/)
      expect(entryVisible(db, id)).toBe(0)
      expect(auditCount(db)).toBe(1)

      audit(db, id, 'restore')
      expect(() => audit(db, id, 'restore')).toThrow(/not hidden/)
      expect(entryVisible(db, id)).toBe(1)
      expect(auditCount(db)).toBe(2)
    } finally { db.close() }
  })

  test('rejects unknown actions and missing entries', () => {
    const db = testDatabase()
    try {
      const id = insertEntry(db, 1)
      expect(() => audit(db, id, 'delete')).toThrow(/unknown action/)
      expect(entryVisible(db, id)).toBe(1)
      expect(auditCount(db)).toBe(0)

      expect(() => audit(db, 999, 'hide')).toThrow(/not visible/)
      expect(auditCount(db)).toBe(0)
    } finally { db.close() }
  })

  test('keeps audit rows append-only', () => {
    const db = testDatabase()
    try {
      const id = insertEntry(db, 1)
      audit(db, id, 'hide')

      expect(() => db.query("UPDATE moderation_audit SET action = 'restore' WHERE id = 1").run()).toThrow(/append-only/)
      expect(() => db.query('DELETE FROM moderation_audit WHERE id = 1').run()).toThrow(/append-only/)
      expect(() => db.query("INSERT OR REPLACE INTO moderation_audit (id, entry_id, action, moderator, created_at) VALUES (1, ?, 'restore', 'mod@example.com', '2026-01-03T00:00:00.000Z')").run(id)).toThrow(/append-only/)

      expect(auditRows(db)).toHaveLength(1)
      expect(auditRows(db)[0]!.action).toBe('hide')
      expect(entryVisible(db, id)).toBe(0)
    } finally { db.close() }
  })

  test('ignored audit inserts leave visibility unchanged', () => {
    const db = testDatabase()
    try {
      const id = insertEntry(db, 1)
      const ignored = db.query("INSERT OR IGNORE INTO moderation_audit (entry_id, action, moderator, created_at) VALUES (?, 'hide', 'x', 'now')").run(id)
      expect(ignored.changes).toBe(0)
      expect(entryVisible(db, id)).toBe(1)
      expect(auditCount(db)).toBe(0)

      const missingTime = db.query("INSERT OR IGNORE INTO moderation_audit (entry_id, action, moderator, created_at) VALUES (?, 'hide', 'mod@example.com', NULL)").run(id)
      expect(missingTime.changes).toBe(0)
      expect(entryVisible(db, id)).toBe(1)
      expect(auditCount(db)).toBe(0)
    } finally { db.close() }
  })

  test('rolls back the visibility transition when the audit insert fails', () => {
    const db = testDatabase()
    try {
      const id = insertEntry(db, 1)
      db.exec(`CREATE TRIGGER test_reject AFTER INSERT ON moderation_audit
        WHEN NEW.moderator = 'fail@example.com'
        BEGIN SELECT RAISE(ABORT, 'test failure'); END;`)

      expect(() => audit(db, id, 'hide', 'fail@example.com')).toThrow(/test failure/)
      expect(entryVisible(db, id)).toBe(1)
      expect(auditCount(db)).toBe(0)

      expect(() => audit(db, id, 'hide', 'x'.repeat(321))).toThrow()
      expect(entryVisible(db, id)).toBe(1)
      expect(auditCount(db)).toBe(0)
    } finally { db.close() }
  })

  test('audit rows contain only identifiers, action, moderator and time', () => {
    const db = testDatabase()
    try {
      const columns = db.query('PRAGMA table_info(moderation_audit)').all() as { name: string }[]
      expect(columns.map(column => column.name)).toEqual(['id', 'entry_id', 'action', 'moderator', 'created_at'])
    } finally { db.close() }
  })
})
