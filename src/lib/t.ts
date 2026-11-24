import { page } from '$app/state'
import { bceOf, decadeNumber, namesEra, yearOfDay, type DateReading } from './dates'
import { translate, type MessageKey } from './i18n'

export const locale = () => page.params.locale ?? 'en'
export const t = (key: MessageKey | `${string}.${string}`, values?: Record<string, string | number>) => translate(locale(), key, values)
export const href = (path = '') => `/${locale()}${path}`
/** A year as it stands by itself: 1921, or 前168年 for -167. `bare` leaves out 年, for a sentence that adds its own. */
export const yearName = (year: number, bare = false) => { const n = bceOf(year); return n === null ? String(year) : t(bare ? 'date.bce' : 'date.bceYear', { n }) }
/** The years from one to another: 前206–前168年, 前206年–220. */
export function yearsName(from: number, to: number) {
  const first = bceOf(from), last = bceOf(to)
  return from === to ? yearName(from) : first !== null && last !== null ? t('date.bceYears', { from: first, to: last }) : `${yearName(from)}–${yearName(to)}`
}
/** The years a date before the common era is read as, when its wording leaves the era unsaid, as -168 does. */
export function eraRead(text: string, reading: DateReading | null | undefined) {
  if (!reading || reading.query || namesEra(text)) return null
  const from = yearOfDay(reading.start)
  return bceOf(from) === null ? null : yearsName(from, yearOfDay(reading.end))
}
export const decadeName = (decade: number) => t(decade < 0 ? 'browse.decadeBce' : 'browse.decade', { n: decadeNumber(decade) })
export const when = (iso: string) => iso.slice(0, 16).replace('T', ' ') + ' UTC'
export const day = (iso: string) => iso.slice(0, 10)
export { media } from './media'
