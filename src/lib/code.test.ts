import { expect, test } from 'bun:test'
import { CODE_DIGITS, parseRecordCode, recordCode, recordName } from './code'

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

test('a typed code names its record in either spelling', () => {
  for (const [text, id] of [
    ['R+0022', 34], ['r+a1c2', 0xa1c2], [' R+10000 ', 0x10000], ['Ｒ＋００２２', 34], ['R 0022', 34],
    ['天天玄玄', 34], ['盈地辰玄', 0xa1c2], ['張張張張', 0xffff], ['张张张黄', 0xfff3], ['地天天天天', 0x10000],
  ] as const) expect(parseRecordCode(text)).toBe(id)
  for (const text of ['', 'R+22', 'R+00022', 'R+0000', '天天天天', '玄玄', '天天天天玄玄', 'R+00G1', '天天玄木', 'R+0022 x', '34'])
    expect(parseRecordCode(text)).toBeNull()
})
