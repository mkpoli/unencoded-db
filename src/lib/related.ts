// `unifiable` says the character should be unified with the other, encoded one; the rest compare the two.
export const RELATION_KINDS = ['unifiable', 'variant', 'erroneous', 'not_variant', 'similar', 'sound', 'meaning', 'glyph', 'usage', 'uncertain'] as const
export type RelationKind = (typeof RELATION_KINDS)[number]
export const isRelationKind = (value: unknown): value is RelationKind => RELATION_KINDS.includes(value as RelationKind)
