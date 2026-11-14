import { expect, test } from 'bun:test'
import { codePage, marksOf, registryLabel, unicodeAge } from './registries'

const marks = (encodings: { charset: string; code: string }[]) => Object.fromEntries(marksOf(encodings).map(mark => [mark.registry.mark, mark.code]))
const pages = (encodings: { charset: string; code: string }[]) => Object.fromEntries(marksOf(encodings).map(mark => [mark.registry.mark, mark.href]))

test('a record without a code is in no marked work', () => {
  expect(marks([])).toEqual({ U: null, 統: null, 葉: null, GW: null, MJ: null })
  expect(marks([{ charset: 'big5', code: 'A140' }])).toEqual({ U: null, 統: null, 葉: null, GW: null, MJ: null })
})

test('an encoded ideograph is in the works that hold every one of them', () => {
  const encodings = [{ charset: 'unicode', code: 'U+2D6DD' }]
  expect(marks(encodings)).toEqual({ U: 'U+2D6DD', 統: '𭛝', 葉: 'U2D6DD', GW: 'u2d6dd', MJ: null })
  expect(pages(encodings)).toEqual({
    U: 'https://util.unicode.org/UnicodeJsps/character.jsp?a=2D6DD',
    統: 'https://zi.tools/zi/%F0%AD%9B%9D',
    葉: 'http://www.yedict.com/z/U2D6DD',
    GW: 'https://glyphwiki.org/wiki/u2d6dd',
    MJ: null,
  })
  expect(marks([{ charset: 'unicode', code: 'U+5650' }])).toMatchObject({ 葉: 'U05650', GW: 'u5650' })
})

test('a Unicode code that names no ideograph brings no other work', () => {
  expect(marks([{ charset: 'unicode', code: 'U+3042' }])).toEqual({ U: 'U+3042', 統: null, 葉: null, GW: null, MJ: null })
  expect(marks([{ charset: 'unicode', code: 'pending' }])).toEqual({ U: null, 統: null, 葉: null, GW: null, MJ: null })
  expect(marks([{ charset: 'unicode', code: 'pending' }, { charset: 'unicode', code: 'U+4E00 U+E0100' }])).toMatchObject({ U: 'U+4E00 U+E0100', 統: '一' })
})

test('a stated code stands over the one a Unicode code brings', () => {
  const encodings = [{ charset: 'glyphwiki', code: 'zihai-012345' }, { charset: 'mj', code: 'MJ059588' }, { charset: 'unicode', code: 'U+2D6DD' }]
  expect(marks(encodings)).toMatchObject({ GW: 'zihai-012345', MJ: 'MJ059588', 統: '𭛝' })
  expect(pages(encodings)).toMatchObject({ GW: 'https://glyphwiki.org/wiki/zihai-012345', MJ: 'https://moji.or.jp/mojikibansearch/info?MJ%E6%96%87%E5%AD%97%E5%9B%B3%E5%BD%A2%E5%90%8D=MJ059588' })
})

test('a code links to its page only in the form the work writes', () => {
  expect(codePage({ charset: 'zitools', code: '⿰山東' })).toBe('https://zi.tools/?secondary=ids&seq=%E2%BF%B0%E5%B1%B1%E6%9D%B1')
  expect(codePage({ charset: 'zitools', code: 'see page 3' })).toBeNull()
  expect(codePage({ charset: 'yedict', code: 'page 12' })).toBeNull()
  expect(codePage({ charset: 'glyphwiki', code: 'Zihai 12' })).toBeNull()
  expect(codePage({ charset: 'mj', code: '059588' })).toBeNull()
  expect(codePage({ charset: 'big5', code: 'A140' })).toBeNull()
  expect(codePage({ charset: 'my set', code: 'A140' })).toBeNull()
})

test('a work outside the list is labelled as written', () => {
  expect(registryLabel('zitools')).toBe('字統網 zi.tools')
  expect(registryLabel('my set')).toBe('my set')
})

test('the Unicode mark carries the version that assigned an ideograph', () => {
  const since = (code: string) => marksOf([{ charset: 'unicode', code }])[0].since
  expect(since('U+4E00')).toBe('1.1')
  expect(since('U+2D6DD')).toBe('10.0')
  expect(since('U+323B0')).toBe('17.0')
  expect(since('U+3042')).toBeNull()
  expect(since('U+2FFFD')).toBeNull()
  expect(marksOf([])[0].since).toBeNull()
  expect(unicodeAge('一')).toBe('1.1')
})
