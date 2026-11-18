import { expect, test } from 'bun:test'
import { pictureAlt } from './picture'

test('a picture is described by its record and where it was seen, numbered only among several', () => {
  expect(pictureAlt(['⿳羔口⿵𦉪十', 'R+06C6', '合併字學集韻', ''], 0, 1)).toBe('⿳羔口⿵𦉪十 · R+06C6 · 合併字學集韻')
  expect(pictureAlt([null, 'R+06C6', 'Book', 'Book'], 1, 3)).toBe('R+06C6 · Book (2/3)')
})
