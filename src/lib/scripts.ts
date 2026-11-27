export const STATUSES = ['encoded', 'unifiable', 'homograph', 'variant'] as const
export type Status = (typeof STATUSES)[number]

// The most vias a sighting's chain holds.
export const VIAS_MAX = 4
// The most older works a sighting cites, re-sets, or derives from.
export const CITES_MAX = 8
export const CITE_KINDS = ['quotes', 'edition', 'derived'] as const
export type CiteKind = (typeof CITE_KINDS)[number]
export const isCiteKind = (value: unknown): value is CiteKind => typeof value === 'string' && (CITE_KINDS as readonly string[]).includes(value)
// How a character appears in a source. One page can show it several ways, as in both the title and the text.
export const CONTEXTS = ['running_text', 'heading', 'logo', 'handwriting', 'other'] as const
export type Context = (typeof CONTEXTS)[number]
export const STYLES = ['regular', 'semi_cursive', 'seal', 'clerical', 'other'] as const

// What one source provides: it may mention a character as a topic, attest it in running text, describe its
// shape, give a meaning or a reading, or relate it to another character. A dictionary entry often does
// several at once.
export const SIGHTING_TYPES = ['mention', 'attestation', 'description', 'definition', 'reading', 'relation'] as const
export type SightingType = (typeof SIGHTING_TYPES)[number]

// A source nobody else can look up: a letter, a private message, a conversation. Other sources have no kind.
export const SOURCE_KINDS = ['personal'] as const
export type SourceKind = (typeof SOURCE_KINDS)[number]
export const sourceKind = (raw: string | null | undefined): SourceKind | null => SOURCE_KINDS.find(kind => kind === raw) ?? null

// A sighting stores the options chosen from a list as a JSON array in the order of the list, or null for none.
function parseChosen<T extends string>(options: readonly T[], raw: string | null | undefined): T[] {
  try {
    const value: unknown = JSON.parse(raw || '[]')
    return Array.isArray(value) ? options.filter(option => value.includes(option)) : []
  } catch { return [] }
}
function isStoredChosen(options: readonly string[], raw: string | null): boolean {
  if (raw === null) return true
  try {
    const value: unknown = JSON.parse(raw)
    return Array.isArray(value) && value.length <= options.length && value.every(item => options.includes(item))
  } catch { return false }
}
export const storeChosen = (options: readonly string[], chosen: ReadonlySet<string>) => {
  const kept = options.filter(option => chosen.has(option))
  return kept.length ? JSON.stringify(kept) : null
}
export const parseSightingTypes = (raw: string | null | undefined) => parseChosen(SIGHTING_TYPES, raw)
export const isStoredSightingTypes = (raw: string | null) => isStoredChosen(SIGHTING_TYPES, raw)
export const parseContexts = (raw: string | null | undefined) => parseChosen(CONTEXTS, raw)
export const isStoredContexts = (raw: string | null) => isStoredChosen(CONTEXTS, raw)

// A form that holds several sightings opens each of them with this field, so the fields after it, up to
// the next one, are read as that sighting's.
export const SIGHTING_START = 'sighting_start'

export const NEEDS = ['image', 'ids', 'source'] as const
export type Need = (typeof NEEDS)[number]
