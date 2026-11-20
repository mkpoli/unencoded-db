// The tables behind what is known of an encoded character: BabelStone's IDS table as ids-input carries it,
// and Unihan 18.0.0's radical, stroke count, definition, readings and variants (scripts/build-unihan.ts).
import { codePoints } from './ids'

/** `all` holds every description of a character, in the table's order, leaving out one that is the character itself. */
export type Descriptions = { encoded: Map<string, string>; described: Map<string, string>; all: Map<string, string[]> }
export type CharacterFacts = {
  char: string; code: string; ids: string | null; radical: string | null; strokes: number | null
  /** Unihan's English definition. */
  meaning: string | null
  /** Readings, each with the ISO 639 code of its language. */
  readings: { doculect: string; value: string }[]
  /** The characters Unihan names as variants, each with the field that names it. */
  variants: { character: string; field: string }[]
}

/** What a form takes from an encoded character. For a different character of the same form (`homograph`)
 * that is only what belongs to the form: its description, radical and strokes. */
export type Fill = CharacterFacts & { homograph: boolean }
export const fillOf = (facts: CharacterFacts, homograph: boolean): Fill =>
  homograph ? { ...facts, code: '', meaning: null, readings: [], variants: [], homograph } : { ...facts, homograph }

/** Each description to the first character it describes, each character to its first description, and to all of them. */
export function parseDescriptions(text: string): Descriptions {
  const encoded = new Map<string, string>()
  const described = new Map<string, string>()
  const all = new Map<string, string[]>()
  for (const line of text.split('\n')) {
    if (!line || line.startsWith('#')) continue
    const [char, sequences] = line.split('\t')
    for (const sequence of sequences?.split(' ') ?? []) {
      const plain = sequence.replace(/\([^)]*\)$/, '').replace(/^〾/, '')
      if (!encoded.has(plain)) encoded.set(plain, char)
      if (plain === char) continue
      if (!described.has(char)) described.set(char, plain)
      const list = all.get(char)
      if (list) { if (!list.includes(plain)) list.push(plain) } else all.set(char, [plain])
    }
  }
  return { encoded, described, all }
}

/** The columns of a Unihan file after the character, in order. */
export const UNIHAN_COLUMNS = ['radical', 'strokes', 'definition', 'cmn', 'yue', 'ja', 'ko', 'vi', 'variants'] as const
/** The Unihan fields that name a variant of the same character. */
export const UNIHAN_VARIANTS = ['kSemanticVariant', 'kSpecializedSemanticVariant', 'kSimplifiedVariant', 'kTraditionalVariant', 'kZVariant', 'kJapaneseOldVariant'] as const
export const READING_LANGUAGES = ['cmn', 'yue', 'ja', 'ko', 'vi'] as const
export type UnihanRow = Record<(typeof UNIHAN_COLUMNS)[number], string>

/** The name of the Unihan file that holds a character. */
export const unihanBlock = (char: string) => (char.codePointAt(0)! >> 8).toString(16)

/** Each character of a Unihan file to its row. */
export function parseUnihan(text: string) {
  const rows = new Map<string, UnihanRow>()
  for (const line of text.split('\n')) {
    const [char, ...values] = line.split('\t')
    if (char) rows.set(char, Object.fromEntries(UNIHAN_COLUMNS.map((column, index) => [column, values[index] ?? ''])) as UnihanRow)
  }
  return rows
}

/** The Kangxi radical of a number from 1 to 214, as the ideograph it unifies with. */
export const radicalCharacter = (number: number) => Number.isInteger(number) && number >= 1 && number <= 214 ? String.fromCodePoint(0x2F00 + number - 1).normalize('NFKC') : null

/** What the tables hold for one encoded character, or null for a text they do not know. */
export function factsOf(char: string, descriptions: Descriptions, unihan: Map<string, UnihanRow>): CharacterFacts | null {
  if ([...char].length !== 1) return null
  const row = unihan.get(char)
  const ids = descriptions.described.get(char) ?? null
  if (!row && !ids) return null
  const variants = new Map<string, string>()
  for (const item of row?.variants ? row.variants.split(' ') : []) {
    const [field, character] = item.split(':')
    if (character && character !== char && !variants.has(character)) variants.set(character, field)
  }
  return {
    char, code: codePoints(char), ids,
    radical: row?.radical ? radicalCharacter(Number(row.radical)) : null,
    strokes: row?.strokes ? Number(row.strokes) : null,
    meaning: row?.definition || null,
    readings: READING_LANGUAGES.filter(language => row?.[language]).map(language => ({ doculect: language, value: row![language] })),
    variants: [...variants].map(([character, field]) => ({ character, field })),
  }
}

/** The characters a description is built from, or null for one that edits strokes or names a part some
 * other way than by a character: its count cannot be had by adding. */
export function descriptionParts(ids: string): string[] | null {
  const parts = [...ids].filter(char => !/[\u2FF0-\u2FFF\u31EF]/u.test(char))
  if (parts.length < 2 || parts.length === [...ids].length) return null
  return parts.every(char => /\p{Script=Han}/u.test(char)) && !ids.includes('\u31EF') ? parts : null
}

/** The total strokes of a description, as the sum of its parts' counts; null when one is not known. */
export function totalStrokes(counts: readonly (number | null | undefined)[]): number | null {
  let total = 0
  for (const count of counts) { if (!count) return null; total += count }
  return counts.length ? total : null
}
