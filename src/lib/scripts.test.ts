import { expect, test } from 'bun:test'
import { resolveScript, scriptName } from './scripts'

test('a script is found by its id, its own name or its name in any language', () => {
  for (const name of ['han', '漢字', 'Han', ' 汉字 ', 'tangut', '西夏文', 'Tangut']) expect(resolveScript(name).script).not.toBe('other')
  expect(resolveScript('漢字')).toEqual({ script: 'han', script_other: null })
  expect(resolveScript('KANA')).toEqual({ script: 'kana', script_other: null })
})

test('any other name is kept as typed, and nothing typed is other without a name', () => {
  expect(resolveScript('  臺灣  方音符號 ')).toEqual({ script: 'other', script_other: '臺灣 方音符號' })
  expect(resolveScript('')).toEqual({ script: 'other', script_other: null })
  expect(resolveScript('Other or not sure')).toEqual({ script: 'other', script_other: null })
  expect(resolveScript('x'.repeat(200)).script_other).toHaveLength(80)
})

test('a record shows its own script name, or the name of the listed one', () => {
  expect(scriptName('ja', 'other', '方音符號')).toBe('方音符號')
  expect(scriptName('zh-Hant', 'han', null)).toBe('漢字')
  expect(scriptName('en', 'other', null)).toBe('Other or not sure')
})
