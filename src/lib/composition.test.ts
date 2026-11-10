import { describe, expect, test } from 'bun:test'
import { analyze, formationOf, parseComposition, serializeComposition, type RoleChoice } from './composition'

const roles = (...values: RoleChoice[]) => values

describe('formation', () => {
  test('reads a semantic and a phonetic part as a phono-semantic character', () => {
    expect(formationOf(roles('semantic', 'phonetic'))).toBe('phonoSemantic')
    expect(formationOf(roles('phonetic', 'semantic', 'semantic'))).toBe('phonoSemantic')
  })

  test('reads semantic parts as a compound ideograph', () => {
    expect(formationOf(roles('semantic', 'semantic'))).toBe('ideographic')
  })

  test('reads a symbol beside a semantic part as an indicative character', () => {
    expect(formationOf(roles('semantic', 'symbol'))).toBe('indicative')
  })

  test('reads symbols on their own as a sign', () => {
    expect(formationOf(roles('symbol', 'symbol'))).toBe('sign')
  })

  test('leaves a phonetic part without a semantic one undecided', () => {
    expect(formationOf(roles('phonetic', 'symbol'))).toBeNull()
  })

  test('leaves a description with an untagged part undecided', () => {
    expect(formationOf(roles('semantic', ''))).toBeNull()
    expect(formationOf(roles('', ''))).toBeNull()
  })
})

describe('stored composition', () => {
  test('round-trips the roles of one sequence', () => {
    const value = serializeComposition('⿰亻七', roles('semantic', 'phonetic'))
    expect(parseComposition(value)).toEqual({ ids: '⿰亻七', roles: ['semantic', 'phonetic'] })
  })

  test('writes nothing while no role is chosen', () => {
    expect(serializeComposition('⿰亻七', roles('', ''))).toBe('')
  })

  test('rejects other values', () => {
    expect(parseComposition('')).toBeNull()
    expect(parseComposition('{}')).toBeNull()
    expect(parseComposition('nope')).toBeNull()
    expect(parseComposition('{"ids":"⿰亻七","roles":["unknown"]}')).toBeNull()
    expect(parseComposition('{"ids":"⿰亻七","roles":["semantic"],"extra":1}')).toEqual({ ids: '⿰亻七', roles: ['semantic'] })
  })
})

describe('analysis', () => {
  test('gives the top-level parts of the first description', () => {
    expect(analyze('⿰亻七')).toEqual({ ids: '⿰亻七', parts: ['亻', '七'], roles: ['', ''], formation: 'unknown' })
  })

  test('keeps a nested part whole', () => {
    expect(analyze('⿰亻⿱七木')?.parts).toEqual(['亻', '⿱七木'])
  })

  test('reads a single component as a single-part character', () => {
    expect(analyze('木')).toEqual({ ids: '木', parts: [], roles: [], formation: 'single' })
    expect(analyze('𠀀')).toEqual({ ids: '𠀀', parts: [], roles: [], formation: 'single' })
  })

  test('uses the roles stored for the same sequence', () => {
    const stored = parseComposition(serializeComposition('⿰亻七', roles('semantic', 'phonetic')))
    expect(analyze('⿰亻七', stored)).toEqual({ ids: '⿰亻七', parts: ['亻', '七'], roles: ['semantic', 'phonetic'], formation: 'phonoSemantic' })
  })

  test('drops roles stored for another sequence', () => {
    const stored = parseComposition(serializeComposition('⿰木木', roles('semantic', 'phonetic')))
    expect(analyze('⿰亻七', stored)?.roles).toEqual(['', ''])
  })

  test('looks through a variant marker', () => {
    expect(analyze('〾⿰亻七')?.parts).toEqual(['亻', '七'])
  })

  test('rejects drafts and non-descriptions', () => {
    expect(analyze('')).toBeNull()
    expect(analyze(null)).toBeNull()
    expect(analyze('⿰亻')).toBeNull()
    expect(analyze('⿰⬚木')).toBeNull()
    expect(analyze('not an ids')).toBeNull()
  })
})
