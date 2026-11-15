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

export const STATUSES = ['unchecked', 'encoded', 'unifiable', 'homograph', 'variant'] as const
export type Status = (typeof STATUSES)[number]

export const CONTEXTS = ['running_text', 'heading', 'logo', 'handwriting', 'other'] as const
export const STYLES = ['regular', 'semi_cursive', 'seal', 'clerical', 'other'] as const

// What one source provides: it may mention a character as a topic, attest it in running text, describe its
// shape, give a meaning or a reading, or relate it to another character. A dictionary entry often does
// several at once.
export const SIGHTING_TYPES = ['mention', 'attestation', 'description', 'definition', 'reading', 'relation'] as const
export type SightingType = (typeof SIGHTING_TYPES)[number]
export const isSightingType = (value: unknown): value is SightingType => SIGHTING_TYPES.includes(value as SightingType)
export function parseSightingTypes(raw: string | null | undefined): SightingType[] {
  try {
    const value: unknown = JSON.parse(raw || '[]')
    return Array.isArray(value) ? SIGHTING_TYPES.filter(type => value.includes(type)) : []
  } catch { return [] }
}
export function isStoredSightingTypes(raw: string | null): boolean {
  if (raw === null) return true
  try {
    const value: unknown = JSON.parse(raw)
    return Array.isArray(value) && value.length <= SIGHTING_TYPES.length && value.every(isSightingType)
  } catch { return false }
}

// A form that holds several sightings opens each of them with this field, so the fields after it, up to
// the next one, are read as that sighting's.
export const SIGHTING_START = 'sighting_start'

export const NEEDS = ['image', 'ids', 'source'] as const
export type Need = (typeof NEEDS)[number]
