import { catalogues } from './i18n'

// The language or dialect a reading belongs to. The listed ones are stored as their ISO 639 code and named
// from the message catalogues; any other doculect, such as a town's speech, is stored as the text given.
// Early Modern Chinese (近古漢語, the Song to Qing readings of the rhyme books and character dictionaries)
// has no ISO 639 code, so it takes `qem` from the range ISO 639 reserves for local use (qaa–qtz).
export const DOCULECTS = ['cmn', 'yue', 'nan', 'hak', 'wuu', 'cdo', 'hsn', 'gan', 'cjy', 'qem', 'ltc', 'och', 'ja', 'ko', 'vi', 'za', 'bca'] as const
export type Doculect = (typeof DOCULECTS)[number]
export const OTHER_DOCULECT = 'other'
export const DOCULECT_MAX = 40

export const isDoculect = (value: unknown): value is Doculect => DOCULECTS.includes(value as Doculect)

const CATALOGUES = Object.values(catalogues)

// Each listed doculect's name in every catalogue, so a name typed under Other is stored as the code it names.
const CODE_OF = new Map(CATALOGUES.flatMap(catalogue => DOCULECTS.flatMap(code => catalogue[`doculect.${code}`] ? [[catalogue[`doculect.${code}`].normalize('NFC').trim(), code] as const] : [])))

/** Whether text is a doculect as stored: a listed code or a custom name without line breaks. */
export const validDoculect = (text: string) => Boolean(text) && text.length <= DOCULECT_MAX && !/[\p{Cc}]/u.test(text) && text !== OTHER_DOCULECT && text === text.normalize('NFC').trim()

/** A doculect as stored: a listed code, the code of a listed language's name in any catalogue, or a custom name without line breaks, or null for none or a bad one. */
export function cleanDoculect(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const text = value.normalize('NFC').trim()
  return CODE_OF.get(text) ?? (validDoculect(text) ? text : null)
}

/** The message key of a listed doculect's name, or null for a custom one, which is shown as written. */
export const doculectKey = (value: string) => isDoculect(value) ? `doculect.${value}` as const : null
