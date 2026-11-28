import { expect, test } from 'bun:test'
import { parseDescriptions } from './character-tables'
import { descriptionsOf, suggest } from './search-suggestions'

const table = parseDescriptions(['水\t⿰㇇𰛅(GHTJKPV) ⿰𰛄{24}(X)', '𰛅\t⿰亅{24}(B) ㇯水㇇(X)', '蒔\t⿱艹時(GTJK)', '時\t⿰日寺(GTJK)', '木\t木(G)', '林\t⿰木木(G)'].join('\n'))
const near = async (ids: string) => ids.includes('艹') ? [{ char: '蒔', ids: '⿱艹時' }] : []

test('a character typed is offered as each description it has, and is searched in the strokes it is drawn from', async () => {
  expect(descriptionsOf('水', table)).toEqual(['⿰㇇𰛅'])
  expect(await suggest('水', table, near, ['氵', '氺'])).toEqual({ also: ['㇇𰛅'], written: [{ text: '⿰㇇𰛅', kind: 'description' }], characters: [{ char: '氵', ids: null }, { char: '氺', ids: null }] })
  expect(await suggest('木', table, near)).toEqual({ also: [], written: [], characters: [] })
})

test('parts and descriptions typed are offered under their other spellings, with the characters near them', async () => {
  expect(await suggest('艹時', table, near)).toEqual({ also: ['艹日寺', '蒔'], written: [{ text: '艹日寺', kind: 'spelling' }, { text: '蒔', kind: 'spelling' }], characters: [{ char: '蒔', ids: '⿱艹時' }] })
  const whole = await suggest('⿱艹時', table, near)
  expect(whole.also).toEqual(expect.arrayContaining(['⿱艹⿰日寺', '⿱艸時']))
  expect(whole.written[0]).toEqual({ text: '⿱艹⿰日寺', kind: 'spelling' })
  expect(whole.written.filter(item => item.kind === 'similar')).toEqual([{ text: '⿱？時', kind: 'similar' }, { text: '⿱艹？', kind: 'similar' }])
  expect(whole.characters).toEqual([{ char: '蒔', ids: '⿱艹時' }])
  for (const text of ['', 'tainan', '⿰氵', '⿲']) expect(await suggest(text, table, near)).toEqual({ also: [], written: [], characters: [] })
})
