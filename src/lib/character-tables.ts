// The tables behind what is known of an encoded character: BabelStone's IDS table as ids-input carries it,
// and the radical and stroke count Unihan 18.0.0 gives (kRSUnicode, kTotalStrokes; scripts/build-unihan.ts).
import { codePoints } from './ids'

export type Descriptions = { encoded: Map<string, string>; described: Map<string, string> }
export type CharacterFacts = { char: string; code: string; ids: string | null; radical: string | null; strokes: number | null }

/** Each description to the character it describes, and each character to its first description. */
export function parseDescriptions(text: string): Descriptions {
  const encoded = new Map<string, string>()
  const described = new Map<string, string>()
  for (const line of text.split('\n')) {
    if (!line || line.startsWith('#')) continue
    const [char, sequences] = line.split('\t')
    for (const sequence of sequences?.split(' ') ?? []) {
      const plain = sequence.replace(/\([^)]*\)$/, '').replace(/^〾/, '')
      if (!encoded.has(plain)) encoded.set(plain, char)
      if (plain !== char && !described.has(char)) described.set(char, plain)
    }
  }
  return { encoded, described }
}

/** Each character to its radical number and stroke count, either of which may be empty. */
export function parseUnihan(text: string) {
  const rows = new Map<string, [string, string]>()
  for (const line of text.split('\n')) {
    const [char, radical, strokes] = line.split('\t')
    if (char) rows.set(char, [radical ?? '', strokes ?? ''])
  }
  return rows
}

/** The Kangxi radical of a number from 1 to 214, as the ideograph it unifies with. */
export const radicalCharacter = (number: number) => Number.isInteger(number) && number >= 1 && number <= 214 ? String.fromCodePoint(0x2F00 + number - 1).normalize('NFKC') : null

/** What the tables hold for one encoded character, or null for a text they do not know. */
export function factsOf(char: string, descriptions: Descriptions, unihan: Map<string, [string, string]>): CharacterFacts | null {
  if ([...char].length !== 1) return null
  const row = unihan.get(char)
  const ids = descriptions.described.get(char) ?? null
  if (!row && !ids) return null
  return { char, code: codePoints(char), ids, radical: row?.[0] ? radicalCharacter(Number(row[0])) : null, strokes: row?.[1] ? Number(row[1]) : null }
}
