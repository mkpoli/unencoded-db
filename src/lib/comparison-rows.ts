import { t, type Locale } from './i18n'

/** Relations offered on the add form, one row of boxes each. */
export const COMPARISON_KINDS = ['variant', 'erroneous'] as const
export type ComparisonKind = (typeof COMPARISON_KINDS)[number]
export const COMPARISON_BOXES = 10

export type Comparison = { character: string; relationship: string }
export type ComparisonBoxes = Record<ComparisonKind, string[]>

const ATTACHED = /^[\p{M}\uFE00-\uFE0F\u{E0100}-\u{E01EF}]$/u

/** Split text into user-perceived characters, keeping variation selectors and combining marks attached. */
export function splitCharacters(value: string): string[] {
  const characters: string[] = []
  for (const character of value.normalize('NFC')) {
    if (characters.length > 0 && ATTACHED.test(character)) characters[characters.length - 1] += character
    else characters.push(character)
  }
  return characters
}

/** Seed the add form's boxes with at most one character per slot. */
export function boxesFromComparisons(rows: readonly Comparison[]): ComparisonBoxes {
  const boxes = Object.fromEntries(COMPARISON_KINDS.map(kind => [kind, Array<string>(COMPARISON_BOXES).fill('')])) as ComparisonBoxes
  for (const row of rows) {
    const list = (boxes as Record<string, string[]>)[row.relationship]
    if (!list || list.includes(row.character)) continue
    const empty = list.indexOf('')
    if (empty !== -1) list[empty] = row.character
  }
  return boxes
}

const KIND_ORDER = ['variant', 'erroneous', 'similar', 'not_variant', 'uncertain', 'sound', 'meaning', 'glyph', 'usage']

/** Stored comparisons as one row per relationship, in a stable order. */
export function groupedComparisons(rows: readonly Comparison[]): { relationship: string; characters: string[] }[] {
  const kinds = [...KIND_ORDER, ...rows.map(row => row.relationship).filter(kind => !KIND_ORDER.includes(kind))]
  return [...new Set(kinds)]
    .map(relationship => ({
      relationship,
      characters: [...new Set(rows.filter(row => row.relationship === relationship).map(row => row.character))],
    }))
    .filter(group => group.characters.length > 0)
}

/** The localized label for a stored comparison relationship. */
export function relationshipLabel(locale: Locale, relationship: string): string {
  switch (relationship) {
    case 'variant': return t(locale, 'relationship.variant')
    case 'erroneous': return t(locale, 'relationship.erroneous')
    case 'not_variant': return t(locale, 'relationship.notVariant')
    case 'similar': return t(locale, 'relationship.similar')
    case 'sound': return t(locale, 'relationship.sound')
    case 'meaning': return t(locale, 'relationship.meaning')
    case 'glyph': return t(locale, 'relationship.glyph')
    case 'usage': return t(locale, 'relationship.usage')
    default: return t(locale, 'relationship.uncertain')
  }
}
