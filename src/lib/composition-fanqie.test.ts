import { expect, test } from 'bun:test'
import { formationOf } from './composition'
import { formationLabel, roleFromLabel, roleLabel } from './composition-labels'

test('an initial speller and a final speller make a 切身', () => {
  expect(formationOf(['initial', 'final'])).toBe('fanqie')
  expect(formationOf(['final', 'initial'])).toBe('fanqie')
})

test('one speller alone, or a speller beside another role, implies no formation', () => {
  expect(formationOf(['initial', 'initial'])).toBeNull()
  expect(formationOf(['initial', 'semantic'])).toBeNull()
  expect(formationOf(['initial', 'final', 'symbol'])).toBeNull()
})

test('the other formations stand as before', () => {
  expect(formationOf(['semantic', 'phonetic'])).toBe('phonoSemantic')
  expect(formationOf(['semantic', 'semantic'])).toBe('ideographic')
})

test('the speller roles and the formation are labelled and read back', () => {
  expect(roleLabel('zh-Hant', 'initial')).toBe('切上字')
  expect(roleLabel('zh-Hant', 'final')).toBe('切下字')
  expect(roleFromLabel('zh-Hant', '切下字')).toBe('final')
  expect(formationLabel('zh-Hant', 'fanqie')).toBe('切身')
})
