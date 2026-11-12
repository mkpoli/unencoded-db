// An Ideographic Variation Sequence is one base scalar plus a variation selector
// in U+E0100–U+E01EF. Unicode Technical Standard #37:
// https://www.unicode.org/reports/tr37/

const VS_MIN = 0xE0100
const VS_MAX = 0xE01EF
const SEQUENCE_MAX = 80

export type IvdStatus = 'registered' | 'none'

export type IvdMembership = {
  status: IvdStatus | null
  sequence: string | null
}

function scalar(hex: string): number {
  return Number.parseInt(hex, 16)
}

function validPair(base: number, vs: number): boolean {
  if (!Number.isInteger(base) || !Number.isInteger(vs)) return false
  if (base < 0 || base > 0x10FFFF || (base >= 0xD800 && base <= 0xDFFF)) return false
  return vs >= VS_MIN && vs <= VS_MAX
}

function canonical(base: number, vs: number): string {
  return `U+${base.toString(16).toUpperCase().padStart(4, '0')} U+${vs.toString(16).toUpperCase()}`
}

/** The canonical U+ form of an IVD sequence, or null when the text is not one. */
export function ivdSequence(value: string): string | null {
  const text = value.normalize('NFC').trim()
  if (!text || text.length > SEQUENCE_MAX) return null
  const written = text.match(/^<?(?:U\+|0x)?([0-9A-Fa-f]{4,6})\s*(?:[+,;，]\s*|\s+)(?:U\+|0x)?([0-9A-Fa-f]{4,6})>?$/i)
  if (written) {
    const base = scalar(written[1])
    const vs = scalar(written[2])
    return validPair(base, vs) ? canonical(base, vs) : null
  }
  const chars = [...text]
  if (chars.length !== 2) return null
  const base = chars[0].codePointAt(0)
  const vs = chars[1].codePointAt(0)
  if (base === undefined || vs === undefined || !validPair(base, vs)) return null
  return canonical(base, vs)
}

/** null when the submitted choice and sequence disagree or the sequence is not an IVS. */
export function readIvd(statusValue: unknown, sequenceValue: unknown): IvdMembership | null {
  if ((statusValue !== null && typeof statusValue !== 'string') || (sequenceValue !== null && typeof sequenceValue !== 'string')) return null
  const status = (statusValue ?? '').normalize('NFC').trim()
  const sequence = (sequenceValue ?? '').normalize('NFC').trim()
  if (status === '') return sequence ? null : { status: null, sequence: null }
  if (status === 'none') return sequence ? null : { status: 'none', sequence: null }
  if (status !== 'registered') return null
  const canonicalSequence = ivdSequence(sequence)
  return canonicalSequence ? { status: 'registered', sequence: canonicalSequence } : null
}
