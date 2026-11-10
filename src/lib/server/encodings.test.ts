import { describe, expect, test } from 'bun:test'
import { parseEncodings, primaryEncoding } from './encodings'

describe('character encodings', () => {
  test('keeps one row per character set and code', () => {
    const form = new FormData()
    form.append('encoding_charset', 'unicode')
    form.append('encoding_charset_other', '')
    form.append('encoding_code', 'U+2D6DD')
    form.append('encoding_charset', 'other')
    form.append('encoding_charset_other', 'Kangxi')
    form.append('encoding_code', '0642.17')
    expect(parseEncodings(form)).toEqual([
      { charset: 'unicode', code: 'U+2D6DD' },
      { charset: 'Kangxi', code: '0642.17' },
    ])
  })

  test('drops empty rows and falls back to the old column', () => {
    const empty = new FormData()
    empty.append('encoding_charset', 'unicode')
    empty.append('encoding_code', '')
    expect(parseEncodings(empty)).toEqual([])
    const legacy = new FormData()
    legacy.set('encoded_as', ' U+4E00 ')
    expect(parseEncodings(legacy)).toEqual([{ charset: 'unicode', code: 'U+4E00' }])
  })

  test('rejects a row missing its code or charset', () => {
    const missingCode = new FormData()
    missingCode.append('encoding_charset', 'unicode')
    missingCode.append('encoding_code', '')
    missingCode.append('encoding_charset_other', '')
    expect(parseEncodings(missingCode)).toEqual([])
    const missingCharset = new FormData()
    missingCharset.append('encoding_charset', 'other')
    missingCharset.append('encoding_charset_other', '')
    missingCharset.append('encoding_code', 'A1')
    expect(parseEncodings(missingCharset)).toBeNull()
  })

  test('uses Unicode as the primary legacy code', () => {
    expect(primaryEncoding([{ charset: 'cns11643', code: '1-4421' }, { charset: 'unicode', code: 'U+2D6DD' }])).toBe('U+2D6DD')
    expect(primaryEncoding([])).toBeNull()
  })
})
