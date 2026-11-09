import { expect, test } from 'bun:test'
import { boxesFromComparisons, groupedComparisons, relationshipLabel, splitCharacters } from './comparison-rows'

test('seeds one box per stored character in its relationship row', () => {
  const boxes = boxesFromComparisons([
    { character: '漢', relationship: 'variant' },
    { character: '叓', relationship: 'erroneous' },
    { character: '字', relationship: 'variant' },
    { character: '字', relationship: 'variant' },
    { character: '古', relationship: 'similar' },
  ])
  expect(boxes.variant.slice(0, 3)).toEqual(['漢', '字', ''])
  expect(boxes.erroneous.slice(0, 2)).toEqual(['叓', ''])
  expect(boxes.variant).toHaveLength(10)
})

test('groups stored comparisons by relationship, variants first', () => {
  expect(groupedComparisons([
    { character: '古', relationship: 'similar' },
    { character: '漢', relationship: 'variant' },
    { character: '叓', relationship: 'erroneous' },
    { character: '字', relationship: 'variant' },
    { character: '字', relationship: 'variant' },
  ])).toEqual([
    { relationship: 'variant', characters: ['漢', '字'] },
    { relationship: 'erroneous', characters: ['叓'] },
    { relationship: 'similar', characters: ['古'] },
  ])
})

test('keeps a relationship the form no longer offers', () => {
  expect(groupedComparisons([{ character: '木', relationship: 'invented' }]))
    .toEqual([{ relationship: 'invented', characters: ['木'] }])
})

test('splits text into characters and keeps marks attached', () => {
  expect(splitCharacters('木𠀀')).toEqual(['木', '𠀀'])
  expect(splitCharacters('木\uFE00林')).toEqual(['木\uFE00', '林'])
  expect(splitCharacters('x\u0338b')).toEqual(['x\u0338', 'b'])
})

test('keeps ten boxes and drops characters beyond them', () => {
  const rows = Array.from({ length: 12 }, (_, i) => ({ character: String.fromCharCode(0x4e00 + i), relationship: 'variant' }))
  expect(boxesFromComparisons(rows).variant.filter(Boolean)).toHaveLength(10)
})

test('labels the erroneous relationship', () => {
  expect(relationshipLabel('en', 'erroneous')).toBe('Erroneous variant')
  expect(relationshipLabel('zh-Hant', 'erroneous')).toBe('訛體')
})
