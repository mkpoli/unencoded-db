import { expect, test } from 'bun:test'
import { characterLinks, descriptionLinks } from './links'

test('an encoded character links to its pages on the sister sites', () => {
  expect(characterLinks('噐', 'ja').map(link => link.href)).toEqual([
    'https://glyphatlas.org/ja/character/U+5650', 'https://han.mkpo.li/?c=5650', 'https://ids.mkpo.li/%E5%99%90',
  ])
  expect(characterLinks('𠀀', 'en')[1].href).toBe('https://han.mkpo.li/?c=20000')
})

test('an encoded character appends IRG Working Set and UAX #45 links from Unihan IRG sources', () => {
  const extG = characterLinks('\u{30002}', 'en', ['UTC-00969'])
  expect(extG.slice(3)).toEqual([
    { name: 'IRG WS2015', href: 'https://hc.jsecs.org/irg/ws2015/app/index.php?find=UTC-00969', title: 'UTC-00969' },
    { name: 'UAX #45', href: 'https://www.unicode.org/Public/UCD/latest/ucd/USourceData.txt#:~:text=UTC%2D00969%3B', title: 'UTC-00969' },
  ])
  const extE = characterLinks('\u{2B88A}', 'en', ['UTC-00001'])
  expect(extE.slice(3)).toEqual([
    { name: 'UAX #45', href: 'https://www.unicode.org/Public/UCD/latest/ucd/USourceData.txt#:~:text=UTC%2D00001%3B', title: 'UTC-00001' },
  ])
})

test('a description links to its described card, the editor, zi.tools and IRG WS2024', () => {
  expect(descriptionLinks('⿰山東', 'en').map(link => link.href)).toEqual([
    'https://glyphatlas.org/en/character/U+2FF0-U+5C71-U+6771', 'https://ids.mkpo.li/%E2%BF%B0%E5%B1%B1%E6%9D%B1',
    'https://zi.tools/?secondary=ids&seq=%E2%BF%B0%E5%B1%B1%E6%9D%B1',
    'https://hc.jsecs.org/irg/ws2024/app/index.php?ids=%E2%BF%B0%E5%B1%B1%E6%9D%B1',
  ])
  expect(descriptionLinks('', 'en')).toEqual([])
})
