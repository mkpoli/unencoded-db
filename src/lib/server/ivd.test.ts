import { describe, expect, test } from 'bun:test'
import { createTestDatabase } from '../../test-support'
import { ivdSequence, readIvd } from './ivd'

describe('IVD membership', () => {
  test('canonicalizes a registered sequence and keeps none empty', () => {
    expect(ivdSequence('u+4e00 u+e0100')).toBe('U+4E00 U+E0100')
    expect(ivdSequence('4E00 E0100')).toBe('U+4E00 U+E0100')
    expect(ivdSequence('<4E00, E0100>')).toBe('U+4E00 U+E0100')
    expect(ivdSequence('U+20000 U+E01EF')).toBe('U+20000 U+E01EF')
    expect(ivdSequence('一\u{E0100}')).toBe('U+4E00 U+E0100')
    expect(readIvd('registered', '4E00 E0100')).toEqual({ status: 'registered', sequence: 'U+4E00 U+E0100' })
    expect(readIvd('none', '')).toEqual({ status: 'none', sequence: null })
    expect(readIvd('', '')).toEqual({ status: null, sequence: null })
    expect(readIvd(' none ', '  ')).toEqual({ status: 'none', sequence: null })
  })

  test('rejects a sequence that is not an IVS, and a choice that disagrees with it', () => {
    for (const value of ['', 'U+4E00', 'U+4E00 U+FE00', 'U+4E00 U+E00FF', 'U+4E00 U+E01F0', 'U+4E00 U+E0100; Adobe-Japan1', 'x'.repeat(81), '一']) {
      expect(ivdSequence(value), value).toBeNull()
    }
    expect(readIvd('registered', '')).toBeNull()
    expect(readIvd('registered', 'U+4E00 U+FE00')).toBeNull()
    expect(readIvd('none', 'U+4E00 U+E0100')).toBeNull()
    expect(readIvd('', 'U+4E00 U+E0100')).toBeNull()
    expect(readIvd('unknown', '')).toBeNull()
    expect(readIvd(1, '')).toBeNull()
  })

  test('the columns keep a registered sequence and an explicit none apart', () => {
    const db = createTestDatabase()
    try {
      db.exec("INSERT INTO entries (script, place, created_at) VALUES ('Han', 'Book', '2026')")
      expect(db.query('SELECT ivd_status, ivd_sequence FROM entries').get()).toEqual({ ivd_status: null, ivd_sequence: null })
      expect(() => db.exec("UPDATE entries SET ivd_status = 'registered' WHERE id = 1")).toThrow()
      expect(() => db.exec("UPDATE entries SET ivd_status = 'none', ivd_sequence = 'U+4E00 U+E0100' WHERE id = 1")).toThrow()
      expect(() => db.exec("UPDATE entries SET ivd_status = 'other' WHERE id = 1")).toThrow()
      db.exec("UPDATE entries SET ivd_status = 'none' WHERE id = 1")
      expect(db.query('SELECT ivd_status, ivd_sequence FROM entries').get()).toEqual({ ivd_status: 'none', ivd_sequence: null })
      db.exec("UPDATE entries SET ivd_status = 'registered', ivd_sequence = 'U+4E00 U+E0100' WHERE id = 1")
      expect(db.query('SELECT ivd_status, ivd_sequence FROM entries').get()).toEqual({ ivd_status: 'registered', ivd_sequence: 'U+4E00 U+E0100' })
    } finally { db.close() }
  })
})
