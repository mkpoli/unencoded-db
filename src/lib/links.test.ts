import { expect, test } from 'bun:test'
import { characterLinks, descriptionLinks } from './links'

test('an encoded character links to its pages on the sister sites', () => {
  expect(characterLinks('噐', 'ja').map(link => link.href)).toEqual([
    'https://glyphatlas.org/ja/character/U+5650', 'https://han.mkpo.li/?c=5650', 'https://ids.mkpo.li/%E5%99%90',
    'https://zi.tools/zi/%E5%99%90', 'http://www.yedict.com/z/U05650',
  ])
  expect(characterLinks('𠀀', 'en')[1].href).toBe('https://han.mkpo.li/?c=20000')
  expect(characterLinks('𠀀', 'en')[4].href).toBe('http://www.yedict.com/z/U20000')
})

test('a description links to its described card and to the editor', () => {
  expect(descriptionLinks('⿰山東', 'en').map(link => link.href)).toEqual([
    'https://glyphatlas.org/en/character/U+2FF0-U+5C71-U+6771', 'https://ids.mkpo.li/%E2%BF%B0%E5%B1%B1%E6%9D%B1',
    'https://zi.tools/?secondary=ids&seq=%E2%BF%B0%E5%B1%B1%E6%9D%B1',
  ])
  expect(descriptionLinks('', 'en')).toEqual([])
})
