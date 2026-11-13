import { describe, expect, test } from 'bun:test'
import { CLAIM_LIMITS, parseClaims, readClaims, splitCharacters, validClaim, type Claim } from './claims'
import { IDS_LENGTH_MAX, IDS_MAX } from './ids'

const claim = (kind: Claim['kind'], value: string, data: Claim['data'] = null): Claim => ({ kind, value, data, sighting_id: null })
const form = (entries: [string, string][]) => { const data = new FormData(); for (const [name, value] of entries) data.append(name, value); return data }
// What a route acts on: the claims to store, or the error that stops it.
const read = (entries: [string, string][], base: Claim[] = []) => {
  const { claims, error } = readClaims(form(entries), base)
  return error ? { error } : { claims }
}

describe('descriptions', () => {
  test('several sequences are split, cleaned and kept in order', () => {
    expect(read([['ids', '⿰木木, ⿱木木'], ['ids', '⿰木水']])).toEqual({ claims: [claim('ids', '⿰木木'), claim('ids', '⿱木木'), claim('ids', '⿰木水')] })
  })

  test('more sequences than a record holds are refused', () => {
    expect(read([['ids', Array.from({ length: IDS_MAX + 1 }, (_, i) => `⿰木${String.fromCodePoint(0x4e00 + i)}`).join(' ')]])).toEqual({ error: 'ids' })
    expect(read([['ids', Array.from({ length: IDS_MAX }, (_, i) => `⿰木${String.fromCodePoint(0x4e00 + i)}`).join(' ')]])).toHaveProperty('claims')
  })

  test('a sequence past the length limit is refused', () => {
    expect(read([['ids', `⿰木${'木'.repeat(IDS_LENGTH_MAX)}`]])).toEqual({ error: 'ids' })
  })

  test('a form without the field keeps the record\'s sequences', () => {
    const base = [claim('ids', '⿰木木')]
    expect(read([], base)).toEqual({ claims: base })
    expect(read([['ids', '']], base)).toEqual({ claims: [] })
  })
})

describe('encodings', () => {
  test('rows pair a set with a code and drop empty and repeated rows', () => {
    const result = read([['encodings_present', '1'], ['encoding_charset', 'unicode'], ['encoding_code', 'U+5D20'], ['encoding_charset', 'big5'], ['encoding_code', '  A140 '], ['encoding_charset', 'unicode'], ['encoding_code', 'U+5D20'], ['encoding_charset', 'gb2312'], ['encoding_code', '']])
    expect(result).toEqual({ claims: [claim('encoding', 'U+5D20', { charset: 'unicode' }), claim('encoding', 'A140', { charset: 'big5' })] })
  })

  test('a code without a set is refused', () => {
    expect(read([['encoding_charset', ''], ['encoding_code', 'U+5D20']])).toEqual({ error: 'encodings' })
  })

  test('an empty list clears the record\'s codes', () => {
    expect(read([['encodings_present', '1']], [claim('encoding', 'U+5D20', { charset: 'unicode' })])).toEqual({ claims: [] })
  })

  test('columns of different lengths are refused', () => {
    expect(read([['encoding_charset', 'big5'], ['encoding_code', 'A140'], ['encoding_code', 'A141']])).toEqual({ error: 'encodings' })
  })

  test('a code or set name that is too long, or a custom set name with a bar, is refused', () => {
    expect(read([['encoding_charset', 'unicode'], ['encoding_code', 'U'.repeat(CLAIM_LIMITS.encoding.length + 1)]])).toEqual({ error: 'encodings' })
    expect(read([['encoding_charset', 'x'.repeat(41)], ['encoding_code', 'A']])).toEqual({ error: 'encodings' })
    expect(read([['encoding_charset', 'my|set'], ['encoding_code', 'A']])).toEqual({ error: 'encodings' })
    expect(read([['encoding_charset', 'my set'], ['encoding_code', 'A']])).toEqual({ claims: [claim('encoding', 'A', { charset: 'my set' })] })
  })

  test('more codes than a record holds are refused', () => {
    const rows = Array.from({ length: CLAIM_LIMITS.encoding.max + 1 }, (_, i): [string, string][] => [['encoding_charset', 'unicode'], ['encoding_code', `U+${(0x5d20 + i).toString(16)}`]]).flat()
    expect(read(rows)).toEqual({ error: 'encodings' })
  })
})

describe('related characters', () => {
  const row = (character: string, relationship = 'variant', difference = '', evidence = ''): [string, string][] => [['related_character', character], ['related_relationship', relationship], ['related_difference', difference], ['related_evidence', evidence]]

  test('rows become relations with only the text they carry', () => {
    expect(read([['related_characters_present', '1'], ...row('木', 'variant', 'a stroke'), ...row('林', 'sound')])).toEqual({
      claims: [claim('relation', '木', { relationship: 'variant', difference: 'a stroke' }), claim('relation', '林', { relationship: 'sound' })],
    })
  })

  test('an empty character, unknown relationship, long text or too many rows are refused', () => {
    expect(read([['related_characters_present', '1'], ...row('  ')])).toEqual({ error: 'relatedCharacters' })
    expect(read([['related_characters_present', '1'], ...row('木', 'invented')])).toEqual({ error: 'relatedCharacters' })
    expect(read([['related_characters_present', '1'], ...row('木', 'variant', 'x'.repeat(5001))])).toEqual({ error: 'relatedCharacters' })
    expect(read([['related_characters_present', '1'], ...row('木', 'variant', '', 'x'.repeat(5001))])).toEqual({ error: 'relatedCharacters' })
    expect(read([['related_characters_present', '1'], ...Array.from({ length: CLAIM_LIMITS.relation.max + 1 }, () => row('木')).flat()])).toEqual({ error: 'relatedCharacters' })
  })

  test('a row beside a column of another length is refused', () => {
    expect(read([['related_characters_present', '1'], ...row('木'), ['related_evidence', 'extra']])).toEqual({ error: 'relatedCharacters' })
  })

  test('a relation rests on the sighting its row names, when it names one', () => {
    const result = read([['related_characters_present', '1'], ['related_sighting', '7'], ...row('木')])
    expect(result).toEqual({ claims: [{ ...claim('relation', '木', { relationship: 'variant' }), sighting_id: 7 }] })
  })
})

describe('unification', () => {
  test('the character a record should be unified with is a relation', () => {
    const result = read([['related_characters_present', '1'], ['related_character', '木'], ['related_relationship', 'unifiable'], ['related_difference', ''], ['related_evidence', '']])
    expect(result).toEqual({ claims: [claim('relation', '木', { relationship: 'unifiable' })] })
  })

  test('the former field is not read', () => {
    expect(read([['normalizes_to', '木']])).toEqual({ claims: [] })
  })
})

describe('variation sequences', () => {
  test('a registered sequence is stored in its canonical form, and none is its own value', () => {
    expect(read([['ivd_status', 'registered'], ['ivd_sequence', 'u+20000 e0100']])).toEqual({ claims: [claim('ivd', 'U+20000 U+E0100')] })
    expect(read([['ivd_status', 'none']])).toEqual({ claims: [claim('ivd', 'none')] })
    expect(read([['ivd_status', '']], [claim('ivd', 'none')])).toEqual({ claims: [] })
  })

  test('a malformed sequence, an unknown status, or a sequence beside "none" is refused', () => {
    expect(read([['ivd_status', 'registered'], ['ivd_sequence', 'U+20000']])).toEqual({ error: 'ivd' })
    expect(read([['ivd_status', 'registered'], ['ivd_sequence', 'U+20000 U+FE00']])).toEqual({ error: 'ivd' })
    expect(read([['ivd_status', 'registered'], ['ivd_sequence', '']])).toEqual({ error: 'ivd' })
    expect(read([['ivd_status', 'maybe']])).toEqual({ error: 'ivd' })
    expect(read([['ivd_status', 'none'], ['ivd_sequence', 'U+20000 U+E0100']])).toEqual({ error: 'ivd' })
  })
})

describe('doculects', () => {
  const doculect = (code: string, value: string) => claim('reading', value, { doculect: code })

  test('a reading keeps the doculect given beside it', () => {
    expect(read([['reading', 'ê'], ['reading_doculect', 'nan'], ['reading', 'tung'], ['reading_doculect', ''], ['reading', 'e5'], ['reading_doculect', '潮州話']]))
      .toEqual({ claims: [doculect('nan', 'ê'), claim('reading', 'tung'), doculect('潮州話', 'e5')] })
  })

  test('the same reading in two doculects is two readings', () => {
    expect(read([['reading', 'ki'], ['reading_doculect', 'ja'], ['reading', 'ki'], ['reading_doculect', 'ko'], ['reading', 'ki'], ['reading_doculect', 'ja']]))
      .toEqual({ claims: [doculect('ja', 'ki'), doculect('ko', 'ki')] })
  })

  test('a doculect list out of step, a long name or a control character is refused', () => {
    expect(read([['reading', 'a'], ['reading', 'b'], ['reading_doculect', 'nan']])).toMatchObject({ error: 'readings' })
    expect(read([['reading', 'a'], ['reading_doculect', 'x'.repeat(41)]])).toMatchObject({ error: 'readings' })
    expect(read([['reading', 'a'], ['reading_doculect', 'a\u0007b']])).toMatchObject({ error: 'readings' })
  })

  test('a stored reading carries only a doculect', () => {
    expect(validClaim(doculect('nan', 'ê'))).toBe(true)
    expect(validClaim(claim('reading', 'ê', { doculect: ' nan' }))).toBe(false)
    expect(validClaim(claim('reading', 'ê', { doculect: 'nan', extra: 1 }))).toBe(false)
    expect(validClaim(claim('reading', 'ê', { language: 'nan' }))).toBe(false)
  })
})

describe('readings, meanings and tags', () => {
  test('texts are deduplicated and limited', () => {
    expect(read([['reading', 'tung'], ['reading', ' tung '], ['reading', 'dong'], ['meaning', 'east']])).toEqual({ claims: [claim('reading', 'tung'), claim('reading', 'dong'), claim('meaning', 'east')] })
    expect(read([['reading', 'x'.repeat(CLAIM_LIMITS.reading.length + 1)]])).toEqual({ error: 'readings' })
    expect(read(Array.from({ length: CLAIM_LIMITS.reading.max + 1 }, (_, i): [string, string] => ['reading', `r${i}`]))).toEqual({ error: 'readings' })
  })

  test('tags split on separators, lose a leading hash and are bounded', () => {
    expect(read([['tags', '#IRG, IDS|new  IRG']])).toEqual({ claims: [claim('tag', 'IRG'), claim('tag', 'IDS'), claim('tag', 'new')] })
    expect(read([['tags', 'x'.repeat(41)]])).toEqual({ error: 'tags' })
    expect(read([['tags', Array.from({ length: CLAIM_LIMITS.tag.max + 1 }, (_, i) => `t${i}`).join(' ')]])).toEqual({ error: 'tags' })
  })

  test('a group the form does not carry is left as the record has it', () => {
    const base = [claim('reading', 'tung'), claim('tag', 'IRG'), claim('genre', 'hakka')]
    expect(read([['meaning', 'east']], base)).toEqual({ claims: [claim('reading', 'tung'), claim('meaning', 'east'), claim('genre', 'hakka'), claim('tag', 'IRG')] })
  })
})

describe('stored claims', () => {
  test('a claim this app writes is valid, and a list with a bad or surplus claim is not parsed', () => {
    expect(validClaim(claim('encoding', 'U+5D20', { charset: 'unicode' }))).toBe(true)
    expect(validClaim(claim('encoding', 'U+5D20'))).toBe(false)
    expect(validClaim(claim('relation', '木', { relationship: 'nope' }))).toBe(false)
    expect(validClaim(claim('ivd', 'U+20000'))).toBe(false)
    expect(validClaim(claim('genre', 'not-a-genre'))).toBe(false)
    expect(validClaim({ ...claim('reading', 'a'), sighting_id: 0 })).toBe(false)
    expect(parseClaims(JSON.stringify([claim('reading', 'a')]))).toEqual([claim('reading', 'a')])
    expect(parseClaims('{broken')).toBeNull()
    expect(parseClaims([claim('reading', 'a'), claim('reading', '')])).toBeNull()
    expect(parseClaims(Array.from({ length: CLAIM_LIMITS.reading.max + 1 }, (_, i) => claim('reading', `r${i}`)))).toBeNull()
  })

  test('characters keep their marks and variation selectors attached', () => {
    expect(splitCharacters('木𠀀󠄀x\u20DD')).toEqual(['木', '𠀀󠄀', 'x\u20DD'])
  })
})
