import { expect, test } from 'bun:test'
import { CODE_DIGITS, recordCode, recordName } from './code'

test('a record id is written in hexadecimal and spelled in 千字文 digits', () => {
  expect(CODE_DIGITS).toHaveLength(16)
  expect(new Set(CODE_DIGITS).size).toBe(16)
  for (const [id, code, name] of [
    [0x0000, 'R+0000', '天天天天'],
    [0x0001, 'R+0001', '天天天地'],
    [0xa1c2, 'R+A1C2', '盈地辰玄'],
    [0xffff, 'R+FFFF', '張張張張'],
    [0x10000, 'R+10000', '地天天天天'],
  ] as const) {
    expect(recordCode(id)).toBe(code)
    expect(recordName(id)).toBe(name)
  }
})
