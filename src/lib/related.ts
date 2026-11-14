// `unifiable` says the character should be unified with the other, encoded one; the rest compare the two.
export const RELATION_KINDS = ['unifiable', 'variant', 'erroneous', 'not_variant', 'homograph', 'similar', 'sound', 'meaning', 'glyph', 'usage', 'uncertain'] as const
export type RelationKind = (typeof RELATION_KINDS)[number]
export const isRelationKind = (value: unknown): value is RelationKind => RELATION_KINDS.includes(value as RelationKind)

// A value that is one code point of the Unicode standard's own character set: not private use and not
// an ideographic description character. Whether the runtime has assigned it is not asked, because its
// Unicode data can be older than the code point.
export const encodedCharacter = (value: string) => {
  const points = [...value.normalize('NFC')]
  if (points.length !== 1) return false
  const code = points[0].codePointAt(0)!
  return !/\p{Co}/u.test(points[0]) && !(code >= 0x2ff0 && code <= 0x2fff) && code !== 0x31ef
}
