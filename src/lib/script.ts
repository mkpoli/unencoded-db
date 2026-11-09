export const SCRIPT_MAX = 80

// The writing systems a record can name. The value is stored as written here.
export const SCRIPTS = [
  'Han',
  'Chữ Nôm',
  'Sawndip',
  'Gugyeol',
  'Kana',
  'Bai',
  'Square Miao',
  'Square Yao',
  'Square Bouyei',
  'Dong',
  'Tangut',
  'Khitan',
  'Jurchen',
  'Shuishu',
  'Nüshu',
] as const

export type Script = (typeof SCRIPTS)[number]

export const DEFAULT_SCRIPT: Script = 'Han'

export const normalizeScript = (script: string) => script.normalize('NFC').trim()

/** The known scripts, keeping the record's current value when it is not one of them. */
export function scriptOptions(current: string): string[] {
  const value = normalizeScript(current)
  return value && !(SCRIPTS as readonly string[]).includes(value) ? [...SCRIPTS, value] : [...SCRIPTS]
}

export const isHanScript = (script: string) => normalizeScript(script).toLowerCase() === 'han'
