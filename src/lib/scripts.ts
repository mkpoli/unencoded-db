// The scripts a record can name. Each name is the script's own or its usual Chinese-character name, and
// `other` takes a name in the visitor's words.
export const SCRIPTS = [
  { id: 'han', own: '漢字' },
  { id: 'nom', own: '𡨸喃' },
  { id: 'sawndip', own: '方塊壯字' },
  { id: 'gugyeol', own: '口訣字' },
  { id: 'kana', own: '仮名' },
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

export const STATUSES = ['unchecked', 'unencoded', 'variant', 'encoded', 'doubtful'] as const
export type Status = (typeof STATUSES)[number]
export const isStatus = (value: unknown): value is Status => STATUSES.includes(value as Status)

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

export const NEEDS = ['image', 'ids', 'source'] as const
export type Need = (typeof NEEDS)[number]
