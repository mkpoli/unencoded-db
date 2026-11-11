import { describe, expect, test } from 'bun:test'
import { analyze, composeValue, formationOf, parseComposition } from './composition'

const roles = (...values: string[]) => values
const stored = (value: unknown) => parseComposition(JSON.stringify(value))

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

  test('leaves one part, a missing role and a phonetic-only pair undecided', () => {
    expect(formationOf(roles('semantic'))).toBeNull()
    expect(formationOf(roles('semantic', ''))).toBeNull()
    expect(formationOf(roles('phonetic', 'symbol'))).toBeNull()
  })

  test('reads 亦聲 as a compound ideograph and phono-semantic character', () => {
    expect(formationOf(roles('also', 'semantic'))).toBe('compoundPhonoSemantic')
    expect(formationOf(roles('also', 'phonetic'))).toBe('compoundPhonoSemantic')
  })

  test('reads abbreviated and fanqie roles by what they spell', () => {
    expect(formationOf(roles('abbreviatedSound', 'semantic'))).toBe('phonoSemantic')
    expect(formationOf(roles('abbreviatedForm', 'phonetic'))).toBe('phonoSemantic')
    expect(formationOf(roles('fanqieUpper', 'semantic'))).toBe('phonoSemantic')
    expect(formationOf(roles('fanqieUpper', 'fanqieLower'))).toBe('qieshen')
  })

  test('leaves a custom role outside the presets undecided', () => {
    expect(formationOf(roles('兼義', 'semantic'))).toBeNull()
    expect(formationOf(roles('semantic', 'semantic', '自訂'))).toBeNull()
  })
})

describe('stored composition', () => {
  test('keeps parts, roles and a custom formation', () => {
    expect(stored({ ids: '⿰青鳥', parts: ['青', '鳥'], roles: ['phonetic', 'semantic'], formation: '形聲兼會意' }))
      .toEqual({ ids: '⿰青鳥', parts: ['青', '鳥'], roles: ['phonetic', 'semantic'], formation: '形聲兼會意' })
  })

  test('reads a record tagged before parts could be edited', () => {
    expect(stored({ ids: '⿰亻七', roles: ['semantic', 'phonetic'] }))
      .toEqual({ ids: '⿰亻七', roles: ['semantic', 'phonetic'], formation: null })
  })

  test('pairs an empty part with its role and drops both', () => {
    expect(stored({ ids: '⿰亻七', parts: ['亻', ''], roles: ['semantic', 'phonetic'] }))
      .toEqual({ ids: '⿰亻七', parts: ['亻'], roles: ['semantic'], formation: null })
  })

  test('keeps a formation alone and parts without roles', () => {
    expect(stored({ ids: '⿰亻七', formation: '指事' }))
      .toEqual({ ids: '⿰亻七', roles: [], formation: '指事' })
    expect(stored({ ids: '⿰亻七', parts: ['亻', '七'], roles: ['', ''] }))
      .toEqual({ ids: '⿰亻七', parts: ['亻', '七'], roles: ['', ''], formation: null })
  })

  test('keeps a nested part whole and caps only what exceeds the field', () => {
    const nested = `⿱${'木'.repeat(30)}`
    const long = '木'.repeat(250)
    const role = '聲'.repeat(50), formation = '形'.repeat(50)
    const value = stored({ ids: '⿰木木', parts: [nested, long], roles: [role, role], formation })
    expect(value?.parts?.[0]).toBe(nested)
    expect([...value!.parts![1]!]).toHaveLength(200)
    expect(value?.roles[0]).toHaveLength(40)
    expect(value?.formation).toHaveLength(40)
  })

  test('caps at code points, not UTF-16 units', () => {
    const head = '木'.repeat(199)
    const value = stored({ ids: '⿰木木', parts: [head + '𠀀', head + '𠀀'], roles: ['semantic', 'semantic'] })
    expect([...value!.parts![0]!]).toHaveLength(200)
    expect(value!.parts![0]!.endsWith('𠀀')).toBe(true)
  })

  test('rejects other values', () => {
    expect(parseComposition('')).toBeNull()
    expect(parseComposition('{}')).toBeNull()
    expect(parseComposition('nope')).toBeNull()
    expect(parseComposition('{"ids":""}')).toBeNull()
    expect(parseComposition('{"ids":"⿰亻七"}')).toBeNull()
    expect(parseComposition('{"ids":"⿰亻七","parts":[],"roles":[]}')).toBeNull()
  })

  test('writes the value a form carries', () => {
    expect(composeValue('⿰青鳥', ['青', '鳥'], ['phonetic', 'semantic'], null))
      .toBe('{"ids":"⿰青鳥","parts":["青","鳥"],"roles":["phonetic","semantic"],"formation":null}')
    expect(composeValue('⿰青鳥', [], [], '形聲兼會意'))
      .toBe('{"ids":"⿰青鳥","parts":[],"roles":[],"formation":"形聲兼會意"}')
    expect(composeValue('⿰青鳥', [], [], null)).toBe('')
  })
})

describe('analysis', () => {
  test('gives the top-level parts of the first description', () => {
    expect(analyze('⿰青鳥')).toEqual({
      ids: '⿰青鳥',
      parts: [{ part: '青', role: '' }, { part: '鳥', role: '' }],
      formation: 'unknown',
      tagged: false,
    })
  })

  test('uses the parts and roles stored for the same sequence', () => {
    const composition = stored({ ids: '⿰青鳥', parts: ['青', '鳥'], roles: ['phonetic', 'semantic'] })
    expect(analyze('⿰青鳥', composition)).toEqual({
      ids: '⿰青鳥',
      parts: [{ part: '青', role: 'phonetic' }, { part: '鳥', role: 'semantic' }],
      formation: 'phonoSemantic',
      tagged: true,
    })
  })

  test('takes custom parts, custom roles and a custom formation', () => {
    const composition = stored({ ids: '⿰青鳥', parts: ['青', '鳥'], roles: ['亦聲', 'semantic'], formation: '形聲兼會意' })
    expect(analyze('⿰青鳥', composition)).toEqual({
      ids: '⿰青鳥',
      parts: [{ part: '青', role: '亦聲' }, { part: '鳥', role: 'semantic' }],
      formation: '形聲兼會意',
      tagged: true,
    })
  })

  test('gives a record tagged before parts could be edited the parsed parts', () => {
    const composition = stored({ ids: '⿰亻七', roles: ['semantic', 'phonetic'] })
    expect(analyze('⿰亻七', composition)?.parts).toEqual([{ part: '亻', role: 'semantic' }, { part: '七', role: 'phonetic' }])
    expect(analyze('⿰亻七', composition)?.tagged).toBe(true)
  })

  test('treats parts without roles or a formation as untagged', () => {
    const composition = stored({ ids: '⿰亻七', parts: ['亻', '七'], roles: ['', ''] })
    expect(analyze('⿰亻七', composition)?.tagged).toBe(false)
  })

  test('derives 會意兼形聲 and 切身 from the presets', () => {
    const also = stored({ ids: '⿰取女', parts: ['取', '女'], roles: ['also', 'semantic'] })
    expect(analyze('⿰取女', also)?.formation).toBe('compoundPhonoSemantic')
    const qieshen = stored({ ids: '⿰取女', parts: ['取', '女'], roles: ['fanqieUpper', 'fanqieLower'] })
    expect(analyze('⿰取女', qieshen)?.formation).toBe('qieshen')
  })

  test('ignores parts and roles stored for another sequence', () => {
    const composition = stored({ ids: '⿰木木', parts: ['木', '木'], roles: ['semantic', 'phonetic'] })
    expect(analyze('⿰亻七', composition)).toEqual({
      ids: '⿰亻七',
      parts: [{ part: '亻', role: '' }, { part: '七', role: '' }],
      formation: 'unknown',
      tagged: false,
    })
  })

  test('reads a single component as a single-part character', () => {
    expect(analyze('木')).toEqual({ ids: '木', parts: [], formation: 'single', tagged: false })
    expect(analyze('木', stored({ ids: '木', parts: ['木'], roles: ['semantic'] }))?.formation).toBe('unknown')
    expect(analyze('木', stored({ ids: '木', parts: ['木'], roles: ['semantic'], formation: '指事' }))?.formation).toBe('指事')
  })

  test('looks through a variant marker', () => {
    expect(analyze('〾⿰亻七')?.parts).toEqual([{ part: '亻', role: '' }, { part: '七', role: '' }])
  })

  test('rejects drafts and non-descriptions', () => {
    expect(analyze('')).toBeNull()
    expect(analyze(null)).toBeNull()
    expect(analyze('⿰亻')).toBeNull()
    expect(analyze('⿰⬚木')).toBeNull()
    expect(analyze('not an ids')).toBeNull()
  })
})
