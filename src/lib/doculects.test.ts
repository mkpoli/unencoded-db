import { expect, test } from 'bun:test'
import { catalogues } from './i18n'
import { DOCULECTS, cleanDoculect } from './doculects'

test('a name a catalogue gives a listed language is stored as its code, and other text as typed', () => {
  expect(cleanDoculect('近古汉语')).toBe('qem')
  expect(cleanDoculect('近古漢語')).toBe('qem')
  expect(cleanDoculect(' Middle Chinese ')).toBe('ltc')
  expect(cleanDoculect('毛南語')).toBe('毛南語')
  expect(cleanDoculect('pcc')).toBe('pcc')
  expect(cleanDoculect('ja')).toBe('ja')
  expect(cleanDoculect('other')).toBeNull()
  expect(cleanDoculect('')).toBeNull()
})

test('no name is shared by two listed languages', () => {
  const names = Object.values(catalogues).flatMap(catalogue => DOCULECTS.map(code => [catalogue[`doculect.${code}`].normalize('NFC'), code]))
  const codes = new Map<string, string>()
  for (const [name, code] of names) expect(codes.get(name) ?? code).toBe(code), codes.set(name, code)
})
