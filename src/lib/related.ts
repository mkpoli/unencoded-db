export const RELATION_KINDS = ['variant', 'not_variant', 'similar', 'uncertain'] as const
export type RelatedCharacter = { character: string; relationship: typeof RELATION_KINDS[number]; difference: string; evidence: string }
export type RelatedDraft = Omit<RelatedCharacter, 'relationship'> & { relationship: string }

export function parseRelatedDraft(raw: string | null | undefined): RelatedDraft[] {
  try {
    const value: unknown = JSON.parse(raw || '[]')
    if (!Array.isArray(value)) return []
    return value.filter(item => item && typeof item.character === 'string' && typeof item.relationship === 'string' && typeof item.difference === 'string' && typeof item.evidence === 'string')
      .map(({ character, relationship, difference, evidence }) => ({ character, relationship, difference, evidence }))
  } catch { return [] }
}

export function parseRelatedCharacters(raw: string | null | undefined): RelatedCharacter[] {
  try {
    const value: unknown = JSON.parse(raw || '[]')
    if (!Array.isArray(value) || value.length > 50) return []
    if (!value.every(item => item && typeof item.character === 'string' && item.character.length > 0 && item.character.length <= 80 && RELATION_KINDS.includes(item.relationship) && typeof item.difference === 'string' && item.difference.length <= 5000 && typeof item.evidence === 'string' && item.evidence.length <= 5000)) return []
    return value.map(({ character, relationship, difference, evidence }) => ({ character, relationship, difference, evidence }))
  } catch { return [] }
}
