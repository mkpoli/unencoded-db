import { splitCharacters } from './comparison-rows'

export const EQUIVALENT_TO_MAX = 80

// A lone combining mark, variation selector or format control is not a character a reader can point at.
const ATTACHED_ONLY = /^[\p{M}\p{Cf}\uFE00-\uFE0F\u{E0100}-\u{E01EF}]/u

export type EquivalentTo = { value: string | null; valid: boolean }

/** The single existing character a record normalizes to, or null when it names none. */
export function readEquivalentTo(raw: unknown): EquivalentTo {
  const text = (typeof raw === 'string' ? raw : '').normalize('NFC').trim().slice(0, EQUIVALENT_TO_MAX)
  if (!text) return { value: null, valid: true }
  return { value: text, valid: splitCharacters(text).length === 1 && !ATTACHED_ONLY.test(text) }
}
