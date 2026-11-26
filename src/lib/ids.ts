import { compatibilitySequences } from 'ids-input'

// Alternate descriptions for the same part, mapped to the canonical form drawn by han-compose.
// Headless 鬼 (鬼 without its top stroke) is drawn natively as ⿷⿱田儿厶 (mkpoli/han-compose#385).
export const IDS_SPELLING_ALIASES: readonly (readonly [string, string])[] = [['⿱田⿺儿厶', '⿷⿱田儿厶']]
const HEADLESS_GUI_PATTERN = /(?:⿱[田⽥]⿺[儿⼉][厶⼛]|⿷⿱[田⽥][儿⼉][厶⼛])/gu

/** Rewrite known alternate component descriptions (including Kangxi radical spellings) to their canonical form. */
export function canonicalizeIds(text: string): string {
  return text.replace(HEADLESS_GUI_PATTERN, '⿷⿱田儿厶')
}

/** Normalize compatibility glyphs and strip whitespace without rewriting structural spelling aliases. */
export const normalizeIdsRaw = (text: string) => compatibilitySequences(text).normalize('NFC').replace(/\s+/gu, '')

// A description sequence as a person types it: the operators and the parts, with spaces taken out.
// Encode compatibility glyphs as their standardized sequences and normalize known alternate spellings.
export const cleanIds = (text: string) => canonicalizeIds(normalizeIdsRaw(text))

/** All known alternate spellings for a description (canonical first), for matching records across spellings. */
export function idsSpellingVariants(ids: string, limit = 16): string[] {
  const start = cleanIds(ids)
  const found = [start], seen = new Set(found)
  for (let at = 0; at < found.length && found.length < limit; at++) {
    const current = found[at]
    for (const [alias, canonical] of IDS_SPELLING_ALIASES) {
      for (const [from, to] of [[canonical, alias], [alias, canonical]] as const) {
        let pos = current.indexOf(from)
        while (pos !== -1 && found.length < limit) {
          const next = current.slice(0, pos) + to + current.slice(pos + from.length)
          if (!seen.has(next)) { seen.add(next); found.push(next) }
          pos = current.indexOf(from, pos + 1)
        }
      }
    }
  }
  return found
}

export const IDS_MAX = 20
export const IDS_LENGTH_MAX = 200

/** One character may be described more than one way. A form sends each description as a value of its own;
 * a pasted list separates them with commas, and the stored value keeps the same order separated by spaces.
 * The first description draws the glyph. */
export function splitIds(text: string | null | undefined): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const part of (text ?? '').split(/[\s,，、]+/u)) {
    const sequence = cleanIds(part)
    if (!sequence || seen.has(sequence)) continue
    seen.add(sequence)
    out.push(sequence)
  }
  return out
}

/** A stored value for these descriptions, or null when there are none. */
export function joinIds(values: Iterable<string>): string | null {
  const sequences = splitIds([...values].join(' '))
  return sequences.length ? sequences.join(' ') : null
}

/** The description whose glyph the record draws. */
export function primaryIds(text: string | null | undefined): string | null {
  return splitIds(text)[0] ?? null
}

/** The IDS Workshop URL for a description, or its empty editor for none. */
export function workshopUrl(ids = '') {
  const base = 'https://ids.mkpo.li/'
  const sequence = cleanIds(ids)
  return /[./]/.test(sequence) ? `${base}?ids=${encodeURIComponent(sequence)}` : base + encodeURIComponent(sequence)
}

/** The code points of a text, written U+XXXX. */
export const codePoints = (text: string) => [...text].map(c => 'U+' + c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')).join(' ')

/** The character a Unicode code such as `U+5D20` names, or '' when the text does not start with one. */
export function encodedCharacter(code: string) {
  const point = /^U\+([0-9A-F]{4,6})(?![0-9A-F])/i.exec(code.trim())
  const value = point ? parseInt(point[1], 16) : -1
  return value >= 0x20 && value <= 0x10FFFF && !(value >= 0xD800 && value <= 0xDFFF) ? String.fromCodePoint(value) : ''
}

/** The characters a text of Unicode codes such as `U+5D20 U+E0100` names, or '' when the text is not only codes. */
export function codePointCharacters(text: string) {
  const tokens = text.trim().split(/\s+/u)
  if (!tokens[0]) return ''
  const characters: string[] = []
  for (const token of tokens) {
    const point = /^U\+([0-9A-F]{4,6})$/i.exec(token)
    if (!point) return ''
    const value = parseInt(point[1], 16)
    if (value < 0x20 || value > 0x10FFFF || (value >= 0xD800 && value <= 0xDFFF)) return ''
    characters.push(String.fromCodePoint(value))
  }
  return characters.join('')
}
