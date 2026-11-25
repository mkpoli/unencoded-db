import { expect, test } from 'bun:test'
import { sourceKeys } from './name-key'

test('a source is found by each of its authors, its container, its link and the account or number given with a name', () => {
  const keys = (author: string | null, container: string | null = null, url: string | null = null) => sourceKeys({ author, container, url })
  expect(keys(null)).toEqual([])
  expect(keys('甲（1234567）', '某討論羣（7654321）')).toEqual(['甲(1234567)', '1234567', '某討論羣(7654321)', '7654321'])
  expect(keys('丁（@Someone）', null, 'https://X.com/Someone/1')).toEqual(['丁(@someone)', 'someone', '@someone', 'x.com/someone/1'])
  expect(keys('@a; @b')).toEqual(['@a; @b', '@a', 'a', '@b', 'b'])
  expect(keys('乙、丙')).toEqual(['乙、丙', '乙', '丙'])
  for (const name of ['甲（QQ 1234567）', '甲【1234567】', '甲［1234567］']) expect(keys(name)).toContain('1234567')
  expect(keys('甲（@漢字君）')).toContain('漢字君')
  expect(keys('甲（@user@example.social）')).toContain('@user@example.social')
  // A year or a note in brackets is no number of an account, and a number alone is the name.
  expect(keys('許某（1920）')).toEqual(['許某(1920)'])
  expect(keys('許某（編）')).toEqual(['許某(編)'])
})
