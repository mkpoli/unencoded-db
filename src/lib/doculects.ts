// The language or dialect a reading belongs to. The listed ones are stored as their ISO 639 code and named
// from the message catalogues; any other doculect, such as a town's speech, is stored as the text given.
export const DOCULECTS = ['cmn', 'yue', 'nan', 'hak', 'wuu', 'cdo', 'hsn', 'gan', 'cjy', 'ltc', 'och', 'ja', 'ko', 'vi', 'za', 'bca'] as const
export type Doculect = (typeof DOCULECTS)[number]
export const OTHER_DOCULECT = 'other'
export const DOCULECT_MAX = 40

export const isDoculect = (value: unknown): value is Doculect => DOCULECTS.includes(value as Doculect)

/** A doculect as stored: a listed code, or a custom name without line breaks, or null for none or a bad one. */
export function cleanDoculect(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const text = value.normalize('NFC').trim()
  return text && text.length <= DOCULECT_MAX && !/[\p{Cc}]/u.test(text) && text !== OTHER_DOCULECT ? text : null
}

/** The message key of a listed doculect's name, or null for a custom one, which is shown as written. */
export const doculectKey = (value: string) => isDoculect(value) ? `doculect.${value}` as const : null
