// The works a character can be registered in: character sets, online dictionaries and glyph registries.
// A record states a registration as the work and the code the character has there. The works with a mark,
// the short tag a gallery tile prints, are the ones every record is counted in or out of, and a record that states
// a Unicode code is in each work that holds every encoded ideograph. A new work is an entry in this list.
// The page addresses of zi.tools, yedict, GlyphWiki and Unicode follow Han Input's list of sites; the MJ
// address is the character page of the Moji Jōhō Kiban search at moji.or.jp.
import { isDescription } from 'ids-input'
import { encodedCharacter } from './ids'
import { UNICODE_AGES } from './unicode-age'

export type Encoding = { charset: string; code: string }
export type Registry = {
  id: string
  label: string
  /** The short tag that names the work on a gallery tile. Its name in each language is the message `registry.<id>`. */
  mark?: string
  /** A code as the work writes it. */
  example?: string
  /** Whether a stated code names a place in the work; any code does where this is left out. */
  names?: (code: string) => boolean
  /** The page of a code, or null for a code that names none. */
  page?: (code: string) => string | null
  /** The code of an encoded ideograph, in a work that holds every one of them. */
  encoded?: (char: string) => string
}

const hex = (char: string) => char.codePointAt(0)!.toString(16)

export const REGISTRIES: readonly Registry[] = [
  {
    // A note in place of a code, such as `pending`, is no code point.
    id: 'unicode', label: 'Unicode', mark: 'U', example: 'U+2D6DD', names: code => Boolean(encodedCharacter(code)),
    page: code => { const char = encodedCharacter(code); return char ? `https://util.unicode.org/UnicodeJsps/character.jsp?a=${hex(char).toUpperCase()}` : null },
  },
  {
    // A character zi.tools files without a code point is found by its description.
    id: 'zitools', label: '字統網 zi.tools', mark: '統', example: '𭛝',
    page: code => [...code].length === 1 ? `https://zi.tools/zi/${encodeURIComponent(code)}` : isDescription(code) ? `https://zi.tools/?secondary=ids&seq=${encodeURIComponent(code)}` : null,
    encoded: char => char,
  },
  {
    id: 'yedict', label: '新葉典 yedict', mark: '葉', example: 'U2D6DD',
    page: code => /^U[0-9A-F]{5,6}$/.test(code) ? `http://www.yedict.com/z/${code}` : null,
    encoded: char => `U${hex(char).toUpperCase().padStart(5, '0')}`,
  },
  {
    id: 'glyphwiki', label: 'GlyphWiki', mark: 'GW', example: 'u2d6dd',
    page: code => /^[a-z0-9][a-z0-9_-]*$/.test(code) ? `https://glyphwiki.org/wiki/${code}` : null,
    encoded: char => `u${hex(char).padStart(4, '0')}`,
  },
  {
    id: 'mj', label: '文字情報基盤 MJ', mark: 'MJ', example: 'MJ059588',
    page: code => /^MJ\d{6}$/.test(code) ? `https://moji.or.jp/mojikibansearch/info?${encodeURIComponent('MJ文字図形名')}=${code}` : null,
  },
  { id: 'cns11643', label: 'CNS 11643' },
  { id: 'big5', label: 'Big5' },
  { id: 'big5-hkscs', label: 'Big5-HKSCS' },
  { id: 'gb18030', label: 'GB 18030' },
  { id: 'gb2312', label: 'GB 2312' },
  { id: 'jis0208', label: 'JIS X 0208' },
  { id: 'jis0213', label: 'JIS X 0213' },
  { id: 'ksx1001', label: 'KS X 1001' },
  { id: 'tca-cns', label: 'TCA-CNS 11643' },
  { id: 'iso10646', label: 'ISO/IEC 10646' },
]

/** The works every record is counted in or out of. */
export const MARKED = REGISTRIES.filter((registry): registry is Registry & { mark: string } => Boolean(registry.mark))

export const OTHER_REGISTRY = 'other'

export const registryOf = (id: string) => REGISTRIES.find(registry => registry.id === id) ?? null
export const isRegistry = (id: string) => Boolean(registryOf(id))
/** The label a stored work presents: a listed work's label, or a name as it was written. */
export const registryLabel = (id: string) => registryOf(id)?.label ?? id
export const cleanCode = (value: string) => value.normalize('NFC').trim()

/** The page of a stated code, or null where the work has none for it. */
export const codePage = ({ charset, code }: Encoding) => registryOf(charset)?.page?.(code) ?? null

// The blocks of unified and compatibility ideographs and the two ideographic planes, by number, so that
// a character counts the same whatever version of Unicode the runtime knows.
export const IDEOGRAPHS = [[0x3400, 0x4DBF], [0x4E00, 0x9FFF], [0xF900, 0xFAFF], [0x20000, 0x3FFFF]]
export const isIdeograph = (char: string) => { const point = char.codePointAt(0) ?? 0; return IDEOGRAPHS.some(([from, to]) => point >= from && point <= to) }
// The encoded ideograph a record names, which the works that hold every one of them hold too.
const ideographOf = (encodings: readonly Encoding[]) => encodings.filter(encoding => encoding.charset === 'unicode').map(encoding => encodedCharacter(encoding.code)).find(char => char && isIdeograph(char)) ?? null

/** The version of Unicode that first assigned an ideograph, or null for any other character. */
export function unicodeAge(char: string) {
  const point = char.codePointAt(0) ?? 0
  return UNICODE_AGES.find(([from, to]) => point >= from && point <= to)?.[2] ?? null
}

export type Mark = { registry: Registry & { mark: string }; code: string | null; href: string | null; /** The version of Unicode that assigned the code, on the Unicode mark. */ since: string | null }

/** Each marked work with the code the character has there: the one the record states, the one its
 * Unicode code brings, or null for a work the record is not known to be in. */
export function marksOf(encodings: readonly Encoding[]): Mark[] {
  const ideograph = ideographOf(encodings)
  return MARKED.map(registry => {
    const code = encodings.find(encoding => encoding.charset === registry.id && (registry.names?.(encoding.code) ?? true))?.code ?? (ideograph && registry.encoded ? registry.encoded(ideograph) : null)
    return { registry, code, href: code === null ? null : registry.page?.(code) ?? null, since: registry.id === 'unicode' && code !== null ? unicodeAge(encodedCharacter(code)) : null }
  })
}

/** The marked works a record is in. */
export const registeredIn = (encodings: readonly Encoding[]) => new Set(marksOf(encodings).filter(mark => mark.code !== null).map(mark => mark.registry.id))
