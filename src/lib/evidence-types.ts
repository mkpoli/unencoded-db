// What one piece of evidence shows about a character: a mention, an attestation, a description of the
// glyph, a meaning, a reading, or a relation to another character. A dictionary entry often does several
// at once.
export const EVIDENCE_TYPES = ['mention', 'attestation', 'description', 'definition', 'reading', 'relation'] as const
export type EvidenceType = (typeof EVIDENCE_TYPES)[number]

export const isEvidenceType = (value: unknown): value is EvidenceType => EVIDENCE_TYPES.includes(value as EvidenceType)

/** The types an evidence row holds, in the order they appear in the form. */
export function parseEvidenceTypes(raw: string | null | undefined): EvidenceType[] {
  try {
    const value: unknown = JSON.parse(raw || '[]')
    return Array.isArray(value) ? EVIDENCE_TYPES.filter(type => value.includes(type)) : []
  } catch { return [] }
}

export function readEvidenceTypes(form: FormData): EvidenceType[] {
  const chosen = new Set(form.getAll('types').map(String))
  return EVIDENCE_TYPES.filter(type => chosen.has(type))
}

export function serializeEvidenceTypes(types: readonly EvidenceType[]): string {
  const chosen = new Set(types)
  return JSON.stringify(EVIDENCE_TYPES.filter(type => chosen.has(type)))
}
