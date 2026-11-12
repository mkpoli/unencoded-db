import { expect, test } from 'bun:test'
import { gunzipSync } from 'node:zlib'
import { readFileSync } from 'node:fs'
import { factsOf, parseDescriptions, parseUnihan, radicalCharacter, unihanBlock } from './character-tables'

const text = (path: string) => new TextDecoder().decode(gunzipSync(readFileSync(path)))
const descriptions = parseDescriptions(text('node_modules/ids-input/data/babelstone-ids.tsv.gz'))
const unihan = new Map(['56', '5d', '7e', '200'].flatMap(block => [...parseUnihan(readFileSync(`static/unihan/${block}.tsv`, 'utf8'))]))

test('an encoded character gives its description, code, radical and strokes', () => {
  expect(factsOf('噐', descriptions, unihan)).toEqual({
    char: '噐', code: 'U+5650', ids: '⿳吅工吅', radical: '口', strokes: 15, meaning: 'receptacle, vessel; instrument',
    readings: ['cmn: qì', 'yue: hei3', 'ja: キ うつわ'], variants: [{ character: '器', field: 'kSemanticVariant' }],
  })
  expect(factsOf('崠', descriptions, unihan)).toMatchObject({ char: '崠', code: 'U+5D20', ids: '⿰山東', radical: '山', strokes: 11 })
  expect(factsOf('红', descriptions, unihan)).toMatchObject({ radical: '糸', variants: [{ character: '紅', field: 'kTraditionalVariant' }] })
})

test('a character described only by itself has no description', () => {
  expect(factsOf('𠀀', descriptions, unihan)?.ids).toBeNull()
})

test('a text the tables do not know gives nothing', () => {
  expect(factsOf('a', descriptions, unihan)).toBeNull()
  expect(factsOf('⿰', descriptions, unihan)).toBeNull()
  expect(factsOf('山東', descriptions, unihan)).toBeNull()
})

test('a description leads back to its character', () => {
  expect(descriptions.encoded.get('⿳吅工吅')).toBe('噐')
})

test('radical numbers name Kangxi radicals', () => {
  expect(radicalCharacter(1)).toBe('一')
  expect(radicalCharacter(214)).toBe('龠')
  expect(radicalCharacter(0)).toBeNull()
  expect(radicalCharacter(215)).toBeNull()
})

test('a character names its Unihan file', () => {
  expect(unihanBlock('噐')).toBe('56')
  expect(unihanBlock('𠀀')).toBe('200')
})
