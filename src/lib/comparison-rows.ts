import { t, type Locale } from './i18n'

export function newComparison() {
  return { character: '', relationship: 'uncertain', differences: '', evidence: '' }
}

export function removeComparison<T, E>(rows: T[], errors: E[], index: number) {
  return { rows: rows.filter((_, i) => i !== index), errors: errors.filter((_, i) => i !== index) }
}

/** The localized label for a stored comparison relationship. */
export function relationshipLabel(locale: Locale, relationship: string): string {
  switch (relationship) {
    case 'variant': return t(locale, 'relationship.variant')
    case 'not_variant': return t(locale, 'relationship.notVariant')
    case 'similar': return t(locale, 'relationship.similar')
    case 'sound': return t(locale, 'relationship.sound')
    case 'meaning': return t(locale, 'relationship.meaning')
    case 'glyph': return t(locale, 'relationship.glyph')
    case 'usage': return t(locale, 'relationship.usage')
    default: return t(locale, 'relationship.uncertain')
  }
}
