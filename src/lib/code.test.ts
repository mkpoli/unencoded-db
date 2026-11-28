import { expect, test } from 'bun:test'
import { canonicalRecordSubpath, CODE_DIGITS, parseRecordCode, parseRecordUrlCode, recordCode, recordName, recordPath } from './code'

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

test('record URL helpers parse flexible codes and canonicalize legacy or non-canonical paths', () => {
  expect(recordPath(9)).toBe('/R+0009')
  expect(recordPath(9, '/history')).toBe('/R+0009/history')
  for (const [text, id] of [
    ['R+0009', 9], ['r+9', 9], ['R+9', 9], ['R+00009', 9], ['R 9', 9], ['r+beef', 0xbeef], ['天天天月', 9],
  ] as const) expect(parseRecordUrlCode(text)).toBe(id)
  for (const text of ['', 'R+0', 'R+0000', 'entry', 'about', '9', 'R+123456789']) expect(parseRecordUrlCode(text)).toBeNull()

  for (const [input, expected] of [
    ['/entry/9', '/R+0009'],
    ['/entry/9/', '/R+0009'],
    ['/entry/9/history', '/R+0009/history'],
    ['/entry/1734/sighting/5/edit', '/R+06C6/sighting/5/edit'],
    ['/r+9', '/R+0009'],
    ['/R+9/history', '/R+0009/history'],
    ['/R%2B0009', '/R+0009'],
    ['/R%200009/history', '/R+0009/history'],
    ['/%E5%A4%A9%E5%A4%A9%E5%A4%A9%E6%9C%88', '/R+0009'],
    ['/R+0009', null],
    ['/R+0009/history', null],
    ['/entry/0', null],
    ['/entry/abc', null],
    ['/about', null],
  ] as const) expect(canonicalRecordSubpath(input)).toBe(expected)
})
