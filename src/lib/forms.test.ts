import { expect, test } from 'bun:test'
import { newClaim } from './claims'
import { formOf, formsOf } from './forms'

test('spellings of one form and IWDS-equivalent parts share a key', () => {
  expect(formOf('⿱ 赤相')).toBe(formOf('⿱赤相'))
  expect(formOf('⿰⺅路')).toBe(formOf('⿰亻路'))
  expect(formOf('⿰王甲')).toBe(formOf('⿰壬甲'))
})

test('another structure, another part and a part written out do not', () => {
  expect(formOf('⿰赤相')).not.toBe(formOf('⿱赤相'))
  expect(formOf('⿱赤木')).not.toBe(formOf('⿱赤相'))
  expect(formOf('⿱⿰女子看')).not.toBe(formOf('⿱好看'))
})

test('a text that is no description or has an unknown part has no key', () => {
  for (const ids of ['艹時', '⿱赤', '⿱赤？', '⿰①木', '']) expect(formOf(ids)).toBeNull()
})

test('a record has the key of each of its descriptions once', () => {
  expect(formsOf([newClaim('ids', '⿰王甲'), newClaim('ids', '⿰壬甲'), newClaim('ids', '⿱？木'), newClaim('meaning', '⿰木木')])).toEqual([formOf('⿰王甲')!])
})
