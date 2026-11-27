import { catalogues, translate } from './i18n'

// The scripts a record can name. Each name is the script's own or its usual Chinese-character name, and
// `other` takes a name in the visitor's words.
export const SCRIPTS = [
  { id: 'han', own: '漢字' },
  { id: 'nom', own: '𡨸喃' },
  { id: 'sawndip', own: '方塊壯字' },
  { id: 'gugyeol', own: '口訣字' },
  { id: 'kana', own: '仮名' },
  { id: 'bopomofo', own: '注音符號' },
  { id: 'bai', own: '白文' },
  { id: 'miao', own: '方塊苗文' },
  { id: 'yao', own: '方塊瑤文' },
  { id: 'bouyei', own: '方塊布依字' },
  { id: 'dong', own: '侗字' },
  { id: 'tangut', own: '西夏文字' },
  { id: 'khitan', own: '契丹文字' },
  { id: 'jurchen', own: '女真文字' },
  { id: 'shuishu', own: '水書' },
  { id: 'nushu', own: '女書' },
  { id: 'other', own: '' },
] as const

export type ScriptId = (typeof SCRIPTS)[number]['id']
export const isScript = (value: unknown): value is ScriptId => SCRIPTS.some(script => script.id === value)

export const SCRIPT_NAME_MAX = 80
const fold = (text: string) => text.normalize('NFKC').toLowerCase().replace(/\s+/gu, ' ').trim()
let known: Map<string, ScriptId> | null = null
function knownNames() {
  if (known) return known
  known = new Map()
  for (const { id, own } of SCRIPTS) for (const name of [id, own, ...Object.values(catalogues).map(catalogue => catalogue[`script.${id}`])]) if (name) known.set(fold(name), id)
  return known
}

// The script a form names: a script of the list by its id, its own name or its name in any language, or
// else `other` with the name as typed. Nothing typed is `other` without a name.
export function resolveScript(raw: string): { script: ScriptId; script_other: string | null } {
  const text = raw.normalize('NFC').replace(/\s+/gu, ' ').trim().slice(0, SCRIPT_NAME_MAX)
  const script = knownNames().get(fold(text))
  return script ? { script, script_other: null } : { script: 'other', script_other: text || null }
}

/** The script of a record as a reader sees it, and as the form's field holds it. */
export const scriptName = (locale: string, script: string, other?: string | null) => script === 'other' && other ? other : translate(locale, `script.${script}`)

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

// How close a sighting stands to the original: the work itself or a direct reproduction of it (a photo, a scan, a
// rubbing, a tracing, a line drawing); a compilation, a dictionary or a typeset transcription that names its own
// source, or one that names none; or a form given from memory. One work can hold entries of either secondary kind.
export const CLOSENESS = ['primary', 'secondary_cited', 'secondary_uncited', 'memory'] as const
export type Closeness = (typeof CLOSENESS)[number]
export const closenessOf = (raw: string | null | undefined): Closeness | null => CLOSENESS.find(kind => kind === raw) ?? null

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
