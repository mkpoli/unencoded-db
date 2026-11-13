import { describe, expect, test } from 'bun:test'
import { CLAIM_LIMITS, CLAIM_SCOPES_MAX, CLAIM_SIGHTINGS_MAX, claimsUnder, isClaimKey, mapSightings, newClaimKey, parseClaims, readClaims, scopesOf, splitCharacters, supportedBy, validClaim, type Claim } from './claims'
import { IDS_LENGTH_MAX, IDS_MAX } from './ids'

// A claim without its key, which a test names only where the key matters.
type Stated = Omit<Claim, 'key'>
const claim = (kind: Claim['kind'], value: string, data: Claim['data'] = null, links: Partial<Pick<Claim, 'sightings' | 'under'>> = {}): Stated => ({ kind, value, data, sightings: [], under: [], ...links })
const keyed = (claims: Stated[], prefix = 'base'): Claim[] => claims.map((item, index) => ({ key: `${prefix}${String(index).padStart(8 - prefix.length, '0')}`, ...item }))
const stated = ({ key, ...rest }: Claim): Stated => rest
const form = (entries: [string, string][]) => { const data = new FormData(); for (const [name, value] of entries) data.append(name, value); return data }
// What a route acts on: the claims to store, or the error that stops it.
const read = (entries: [string, string][], base: Stated[] = []) => {
  const { claims, error } = readClaims(form(entries), keyed(base))
  return error ? { error } : { claims: claims.map(stated) }
}
const valid = (item: Stated) => validClaim({ key: 'abcd1234', ...item })

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

  test('a relation rests on the sightings its row names', () => {
    const result = read([['related_characters_present', '1'], ['related_key', 'rel00001'], ['sightings.rel00001', '7'], ['sightings.rel00001', '3'], ['sightings.rel00001', '7'], ['sightings.rel00001', 'x'], ...row('木')])
    expect(result).toEqual({ claims: [claim('relation', '木', { relationship: 'variant' }, { sightings: [3, 7] })] })
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
    expect(valid(doculect('nan', 'ê'))).toBe(true)
    expect(valid(claim('reading', 'ê', { doculect: ' nan' }))).toBe(false)
    expect(valid(claim('reading', 'ê', { doculect: 'nan', extra: 1 }))).toBe(false)
    expect(valid(claim('reading', 'ê', { language: 'nan' }))).toBe(false)
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
    expect(valid(claim('encoding', 'U+5D20', { charset: 'unicode' }))).toBe(true)
    expect(valid(claim('encoding', 'U+5D20'))).toBe(false)
    expect(valid(claim('relation', '木', { relationship: 'nope' }))).toBe(false)
    expect(valid(claim('ivd', 'U+20000'))).toBe(false)
    expect(valid(claim('genre', 'not-a-genre'))).toBe(false)
    const stored = keyed([claim('reading', 'a')])
    expect(parseClaims(JSON.stringify(stored))).toEqual(stored)
    expect(parseClaims('{broken')).toBeNull()
    expect(parseClaims(keyed([claim('reading', 'a'), claim('reading', '')]))).toBeNull()
    expect(parseClaims(keyed(Array.from({ length: CLAIM_LIMITS.reading.max + 1 }, (_, i) => claim('reading', `r${i}`))))).toBeNull()
  })

  test('a stored claim has a key, a bounded list of distinct sightings and a scope its kind allows', () => {
    expect(validClaim(claim('reading', 'a'))).toBe(false)
    expect(validClaim({ key: 'Short', ...claim('reading', 'a') })).toBe(false)
    expect(valid(claim('reading', 'a', null, { sightings: [3, 7] }))).toBe(true)
    for (const sightings of [[0], [1.5], [3, 3], ['3'], Array.from({ length: CLAIM_SIGHTINGS_MAX + 1 }, (_, i) => i + 1)]) expect(valid(claim('reading', 'a', null, { sightings: sightings as number[] }))).toBe(false)
    expect(valid({ ...claim('reading', 'a'), sightings: undefined as unknown as number[] })).toBe(false)
    expect(valid(claim('reading', 'a', null, { under: ['mean0001'] }))).toBe(true)
    expect(valid(claim('reading', 'a', null, { under: ['mean0001', 'mean0001'] }))).toBe(false)
    expect(valid(claim('reading', 'a', null, { under: Array.from({ length: CLAIM_SCOPES_MAX + 1 }, (_, i) => `mean${String(i).padStart(4, '0')}`) }))).toBe(false)
    // A meaning and a code are facts of the whole record.
    expect(valid(claim('meaning', 'east', null, { under: ['mean0001'] }))).toBe(false)
    expect(valid(claim('encoding', 'U+5D20', { charset: 'unicode' }, { under: ['mean0001'] }))).toBe(false)
  })

  test('a stored list names each claim once and scopes only to its own meanings and readings', () => {
    const [meaning, reading] = keyed([claim('meaning', 'east'), claim('reading', 'tung')])
    const scoped = (item: Stated, key = 'rel00000'): Claim => ({ key, ...item })
    expect(parseClaims([meaning, reading, scoped(claim('relation', '東', { relationship: 'variant' }, { under: [meaning.key, reading.key] }))])).not.toBeNull()
    expect(parseClaims([meaning, scoped(claim('reading', 'dong', null, { under: [meaning.key] }))])).not.toBeNull()
    expect(parseClaims([meaning, { ...reading, key: meaning.key }])).toBeNull()
    expect(parseClaims([meaning, scoped(claim('relation', '東', { relationship: 'variant' }, { under: ['gone0000'] }))])).toBeNull()
    expect(parseClaims([reading, scoped(claim('reading', 'dong', null, { under: [reading.key] }))])).toBeNull()
  })

  test('characters keep their marks and variation selectors attached', () => {
    expect(splitCharacters('木𠀀󠄀x\u20DD')).toEqual(['木', '𠀀󠄀', 'x\u20DD'])
  })
})

describe('keys', () => {
  test('a key is eight lowercase letters and digits', () => {
    const keys = Array.from({ length: 200 }, newClaimKey)
    expect(keys.every(isClaimKey)).toBe(true)
    expect(new Set(keys).size).toBe(200)
    for (const bad of ['', 'abc', 'ABCD1234', 'abcd12345', 'abcd-123', 7, null]) expect(isClaimKey(bad)).toBe(false)
  })

  test('every claim a form states has a key of its own', () => {
    const { claims } = readClaims(form([['ids', '⿰木木 ⿱木木'], ['reading', 'tung'], ['meaning', 'east'], ['tags', 'a b'], ['related_characters_present', '1'], ['related_character', '木'], ['related_relationship', 'variant'], ['related_difference', ''], ['related_evidence', '']]))
    expect(claims).toHaveLength(7)
    expect(claims.every(item => isClaimKey(item.key))).toBe(true)
    expect(new Set(claims.map(item => item.key)).size).toBe(7)
  })

  test('a row keeps its key when its text, doculect or relationship is edited', () => {
    const base = keyed([claim('reading', 'tung', null, { sightings: [4] }), claim('meaning', 'east'), claim('relation', '木', { relationship: 'variant' })])
    const { claims, error } = readClaims(form([
      ['reading', 'tang'], ['reading_doculect', 'nan'], ['reading_key', base[0].key],
      ['meaning', 'east hill'], ['meaning_key', base[1].key],
      ['related_characters_present', '1'], ['related_character', '林'], ['related_relationship', 'unifiable'], ['related_difference', ''], ['related_evidence', ''], ['related_key', base[2].key],
    ]), base)
    expect(error).toBeNull()
    expect(claims.map(item => [item.key, item.value])).toEqual([[base[0].key, 'tang'], [base[1].key, 'east hill'], [base[2].key, '林']])
    // A keyed row's links are the ones its own fields give.
    expect(claims[0].sightings).toEqual([])
  })

  test('a row made in the browser keeps the key it was made with', () => {
    const { claims } = readClaims(form([['meaning', 'east'], ['meaning_key', 'new00001'], ['meaning', 'west'], ['meaning_key', '']]))
    expect(claims[0].key).toBe('new00001')
    expect(isClaimKey(claims[1].key)).toBe(true)
  })

  test('a claim stated again without a key continues the one the record holds', () => {
    const base = keyed([claim('ids', '⿰木木'), claim('ids', '⿱木木'), claim('reading', 'ki', { doculect: 'ja' }, { sightings: [2] }), claim('reading', 'ki', { doculect: 'ko' }), claim('encoding', 'A140', { charset: 'big5' }), claim('ivd', 'none'), claim('genre', 'hakka'), claim('tag', 'IRG')])
    const { claims } = readClaims(form([
      ['ids', '⿱木木 ⿰木水'], ['reading', 'ki'], ['reading_doculect', 'ko'], ['reading', 'ki'], ['reading_doculect', 'ja'],
      ['encodings_present', '1'], ['encoding_charset', 'cns11643'], ['encoding_code', 'A140'], ['encoding_charset', 'big5'], ['encoding_code', 'A140'],
      ['ivd_status', 'registered'], ['ivd_sequence', 'U+20000 U+E0100'], ['genres_present', '1'], ['genre', 'hakka'], ['tags', 'new IRG'],
    ]), base)
    const key = (kind: Claim['kind'], value: string, data?: string) => claims.find(item => item.kind === kind && item.value === value && (!data || Object.values(item.data ?? {}).includes(data)))!.key
    expect(key('ids', '⿱木木')).toBe(base[1].key)
    expect(base.map(item => item.key)).not.toContain(key('ids', '⿰木水'))
    expect(key('reading', 'ki', 'ko')).toBe(base[3].key)
    expect(key('reading', 'ki', 'ja')).toBe(base[2].key)
    expect(claims.find(item => item.key === base[2].key)!.sightings).toEqual([2])
    expect(key('encoding', 'A140', 'big5')).toBe(base[4].key)
    expect(base.map(item => item.key)).not.toContain(key('encoding', 'A140', 'cns11643'))
    // A kind a record holds once is the same claim whatever it now says.
    expect(key('ivd', 'U+20000 U+E0100')).toBe(base[5].key)
    expect(key('genre', 'hakka')).toBe(base[6].key)
    expect(key('tag', 'IRG')).toBe(base[7].key)
    expect(new Set(claims.map(item => item.key)).size).toBe(claims.length)
  })

  test('a key given twice, or one that names a claim of another kind, is not taken', () => {
    const base = keyed([claim('meaning', 'east')])
    const { claims } = readClaims(form([['reading', 'a'], ['reading_key', 'dup00001'], ['reading', 'b'], ['reading_key', 'dup00001'], ['reading', 'c'], ['reading_key', base[0].key]]), base)
    expect(claims.map(item => item.kind)).toEqual(['reading', 'reading', 'reading', 'meaning'])
    expect(claims[0].key).toBe('dup00001')
    expect(new Set(claims.map(item => item.key)).size).toBe(4)
    expect(claims[3].key).toBe(base[0].key)
  })
})

describe('scopes', () => {
  const related = (character: string, key: string): [string, string][] => [['related_character', character], ['related_relationship', 'usage'], ['related_difference', ''], ['related_evidence', ''], ['related_key', key]]

  test('rows of one form name each other: a relation under a meaning and a reading, a reading under a meaning', () => {
    const { claims, error } = readClaims(form([
      ['meaning', 'a boastful person'], ['meaning_key', 'mean0001'], ['meaning', 'east'], ['meaning_key', 'mean0002'],
      ['reading', 'kua'], ['reading_key', 'read0001'], ['under.read0001', 'mean0001'],
      ['related_characters_present', '1'], ...related('侉', 'rela0001'), ...related('東', 'rela0002'),
      ['under.rela0001', 'mean0001'], ['under.rela0001', 'read0001'], ['under.rela0002', 'mean0002'],
    ]))
    expect(error).toBeNull()
    const [reading, first, second, 侉, 東] = claims
    expect(reading.under).toEqual([first.key])
    expect(侉.under).toEqual([first.key, reading.key])
    expect(東.under).toEqual([second.key])
    // Read from the other side.
    expect(claimsUnder(claims, first.key).map(item => item.value)).toEqual(['kua', '侉'])
    expect(claimsUnder(claims, second.key).map(item => item.value)).toEqual(['東'])
    expect(scopesOf(claims, 侉).map(item => item.value)).toEqual(['a boastful person', 'kua'])
    expect(parseClaims(claims)).toEqual(claims)
  })

  test('a name for no claim, or for a claim that cannot be a scope, is refused', () => {
    const base = keyed([claim('meaning', 'east'), claim('reading', 'tung'), claim('tag', 'IRG')])
    const [meaning, reading, tag] = base.map(item => item.key)
    const under = (target: string, kind: 'reading' | 'related' = 'related'): [string, string][] => kind === 'reading'
      ? [['reading', 'tung'], ['reading_key', reading], ['under.' + reading, target]]
      : [['related_characters_present', '1'], ...related('東', 'rela0001'), ['under.rela0001', target]]
    expect(readClaims(form(under(meaning)), base).error).toBeNull()
    expect(readClaims(form(under(reading)), base).error).toBeNull()
    expect(readClaims(form(under(meaning, 'reading')), base).error).toBeNull()
    expect(readClaims(form(under('nosuch00')), base).error).toBe('links')
    expect(readClaims(form(under('not a key')), base).error).toBe('links')
    expect(readClaims(form(under(tag)), base).error).toBe('links')
    // A reading holds under a meaning, not under itself or another reading; a relation not under a relation.
    expect(readClaims(form(under(reading, 'reading')), base).error).toBe('links')
    expect(readClaims(form([['related_characters_present', '1'], ...related('東', 'rela0001'), ...related('侉', 'rela0002'), ['under.rela0001', 'rela0002']]), base).error).toBe('links')
    // A meaning has no scope, whatever the form sends for it.
    expect(readClaims(form([['meaning', 'east'], ['meaning_key', meaning], ['under.' + meaning, reading]]), base).error).toBe('links')
  })

  test('a scope that is removed leaves every claim that held under it, in the same read', () => {
    const base = keyed([claim('reading', 'tung'), claim('meaning', 'east'), claim('meaning', 'hill')])
    const [reading, east, hill] = base.map(item => item.key)
    base[0].under = [east, hill]
    base.push({ key: 'rela0001', ...claim('relation', '東', { relationship: 'usage' }, { under: [reading, east] }) })
    // The form carries the meanings alone, and the readings and relations stay as the record has them.
    const kept = readClaims(form([['meaning', 'hill'], ['meaning_key', hill]]), base)
    expect(kept.error).toBeNull()
    expect(kept.claims.map(item => [item.value, item.under])).toEqual([['tung', [hill]], ['hill', []], ['東', [reading]]])
    // A removed row and what was under it travel in one form.
    const both = readClaims(form([['readings_present', '1'], ['meanings_present', '1'], ['related_characters_present', '1'], ...related('東', 'rela0001'), ['under.rela0001', reading], ['under.rela0001', east]]), base)
    expect(both).toEqual({ error: null, claims: [{ ...base[3], under: [] }] })
  })

  test('a row left empty or left out as a repeat is not a scope, and the repeat means the row that is kept', () => {
    const { claims, error } = readClaims(form([
      ['meaning', ''], ['meaning_key', 'mean0001'], ['meaning', 'east'], ['meaning_key', 'mean0002'], ['meaning', 'east'], ['meaning_key', 'mean0003'],
      ['related_characters_present', '1'], ...related('東', 'rela0001'), ['under.rela0001', 'mean0001'], ['under.rela0001', 'mean0003'], ['under.rela0001', 'mean0002'],
    ]))
    expect(error).toBeNull()
    expect(claims.map(item => [item.key, item.under])).toEqual([['mean0002', []], ['rela0001', ['mean0002']]])
  })

  test('a claim names a bounded number of sightings and scopes', () => {
    const many = (name: string, values: string[]): [string, string][] => values.map(value => [name, value])
    const sightings = Array.from({ length: CLAIM_SIGHTINGS_MAX + 1 }, (_, i) => String(i + 1))
    expect(readClaims(form([['meaning', 'east'], ['meaning_key', 'mean0001'], ...many('sightings.mean0001', sightings.slice(1))])).error).toBeNull()
    expect(readClaims(form([['meaning', 'east'], ['meaning_key', 'mean0001'], ...many('sightings.mean0001', sightings)])).error).toBe('links')
  })

  test('sightings are renamed or dropped together, and read from the sighting', () => {
    const claims = keyed([claim('reading', 'a', null, { sightings: [1, 2, 3] }), claim('meaning', 'b', null, { sightings: [3] }), claim('tag', 'c')])
    const mapped = mapSightings(claims, id => id === 2 ? null : id === 3 ? 10 : 30)
    expect(mapped.map(item => item.sightings)).toEqual([[10, 30], [10], []])
    expect(mapped[2]).toBe(claims[2])
    expect(supportedBy(mapped, 10).map(item => item.value)).toEqual(['a', 'b'])
  })
})
