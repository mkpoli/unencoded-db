export const RELATION_KINDS = ['variant', 'erroneous', 'not_variant', 'similar', 'sound', 'meaning', 'glyph', 'usage', 'uncertain'] as const
export type RelationKind = (typeof RELATION_KINDS)[number]
export const isRelationKind = (value: unknown): value is RelationKind => RELATION_KINDS.includes(value as RelationKind)
export type RelatedDraft = { character: string; relationship: string; difference: string; evidence: string }
