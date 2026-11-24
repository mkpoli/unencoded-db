// Western calendar 101.1 uses Julian dates through 1582-10-04 and Gregorian dates from 1582-10-15.
export type DateReading = {
  start: string
  end: string
  precision: 'year' | 'month' | 'day' | 'range'
  approximate?: boolean
  query?: string
}

// Longer transcriptions remain in the evidence verbatim. Only bounded expressions enter the calendar parser or cache.
export const MAX_READING_LENGTH = 256

export function dateText(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : null
}

const pad = (n: number) => String(n).padStart(2, '0')

// Years are numbered as ISO 8601 numbers them: 0 is 1 BCE and -167 is 168 BCE, so they sort and subtract as integers.
const yearText = (year: number) => (year < 0 ? '-' : '') + String(Math.abs(year)).padStart(4, '0')
/** The year of a day written `0980-01-31` or `-0167-01-31`. */
export const yearOfDay = (day: string) => Number(day.slice(0, -6))
export const compareDays = (a: string, b: string) => yearOfDay(a) - yearOfDay(b) || (a.slice(-5) < b.slice(-5) ? -1 : a.slice(-5) > b.slice(-5) ? 1 : 0)

/** The year before the common era a year number stands for, counted back from 1, or null in the common era. */
export const bceOf = (year: number) => year > 0 ? null : 1 - year
// Decades are counted away from the turn of the era on both sides, as they are named: the 160s BCE run from 169 to
// 160 BCE, and 9 to 1 BCE are the decade before the years 1 to 9. A decade is known by its first year's number.
export const decadeOf = (year: number) => year > 0 ? Math.floor(year / 10) * 10 : -8 - Math.floor((1 - year) / 10) * 10
/** A decade's number: 1930 in the 1930s, 160 in the 160s BCE. */
export const decadeNumber = (decade: number) => decade < 0 ? 1 - decade - 9 : decade
export const isDecade = (text: string) => /^(0|[1-9]\d{0,2}0|-(?:[1-9]\d{0,2})?8)$/.test(text)
const nextDecade = (decade: number) => decade === -8 ? 0 : decade + 10
/** Every decade from the first to the last of those given in order, empty ones too, in runs: the empty decades between two runs are more than `gap`. */
export function decadeRuns(decades: readonly number[], gap: number) {
  const runs: number[][] = []
  for (const decade of decades) {
    const missed: number[] = []
    const last = runs.at(-1)?.at(-1)
    if (last !== undefined) for (let next = nextDecade(last); next < decade; next = nextDecade(next)) missed.push(next)
    if (last === undefined || missed.length > gap) runs.push([decade])
    else runs.at(-1)!.push(...missed, decade)
  }
  return runs
}

const BEFORE = String.raw`(?:(?:公元|西元|紀元|纪元|西暦)?前|기원전|b\.\s?c\.(?:\s?e\.)?|bce?)\s*`
const AFTER = String.raw`\s*(?:b\.\s?c\.(?:\s?e\.)?|bce?|tcn)`
const before = new RegExp(`^${BEFORE}(?=\\d)`, 'i'), after = new RegExp(`${AFTER}$`, 'i')
// An expression with the mark of the era before the common one taken off. A year with a minus sign is one too;
// a signed year padded to four digits is left unread, since ISO 8601 numbers those one year apart.
function unmarked(value: string) {
  const marked = value.replace(before, '')
  if (marked !== value) return marked
  const named = value.replace(after, '')
  if (named !== value) return named
  return /^-[1-9]\d{0,3}年?$/.test(value) ? value.slice(1) : null
}
/** Whether an expression names the era before the common one in words. */
export const namesEra = (text: string) => new RegExp(`${BEFORE}\\d|\\d(?:年代?|s)?${AFTER}(?![a-z])`, 'i').test(text.normalize('NFKC'))

function westernPeriod(value: string): DateReading | null {
  const bce = unmarked(value)
  if (bce !== null) value = bce.replace('년', '年')
  if (/^\d{3,4}\/\d{1,2}(?:\/\d{1,2})?$/.test(value)) value = value.replaceAll('/', '-')
  const match = /^(\d{1,4})(?:年(?:([0-9]{1,2})月(?:([0-9]{1,2})日)?)?|(?:-([0-9]{1,2})(?:-([0-9]{1,2}))?)?)$/.exec(value)
  // A number of one or two digits is a year only when its era is named.
  // Joined by hyphens, a year and a number before the common era are the ends of a range.
  if (!match || !Number(match[1]) || (bce === null ? match[1].length < 3 : match[4])) return null
  const year = bce === null ? Number(match[1]) : 1 - Number(match[1]), month = Number(match[2] ?? match[4] ?? 1), day = Number(match[3] ?? match[5] ?? 1)
  const leap = year % 4 === 0 && (year < 1582 || year % 100 !== 0 || year % 400 === 0)
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  if (month < 1 || month > 12 || day < 1 || day > days[month - 1]) return null
  const precision = match[3] || match[5] ? 'day' : match[2] || match[4] ? 'month' : 'year'
  const prefix = yearText(year)
  const start = `${prefix}-${pad(month)}-${pad(day)}`
  if (year === 1582 && start > '1582-10-04' && start < '1582-10-15') return null
  const end = precision === 'day' ? start : precision === 'month' ? `${prefix}-${pad(month)}-${days[month - 1]}` : `${prefix}-12-31`
  return { start, end, precision }
}

function westernDecade(value: string): DateReading | null {
  const bce = unmarked(value), match = /^(\d{1,3}0)(?:年代|s)$/.exec(bce ?? value)
  if (!match || (bce === null && match[1].length < 3)) return null
  const n = Number(match[1]), [first, last] = bce === null ? [n, n + 9] : [1 - (n + 9), 1 - n]
  return { start: `${yearText(first)}-01-01`, end: `${yearText(last)}-12-31`, precision: 'range' }
}

// Interpret the whole expression. A number embedded in an arbitrary transcription cannot date a work.
export function westernDate(raw: string): DateReading | null {
  if (raw.length > MAX_READING_LENGTH) return null
  let value = raw.normalize('NFKC').replaceAll('−', '-').trim()
  const approx = /^(?:c\.|ca\.|circa|約|约)\s*/i
  const suffix = /(?:頃|ごろ|\?)$/
  const approximate = approx.test(value) || suffix.test(value)
  value = value.replace(approx, '').replace(suffix, '').trim().replace(/^\[(.+)\]$/, '$1')
  const single = westernDecade(value) ?? westernPeriod(value)
  if (single) return approximate ? { ...single, approximate } : single
  const range = /^(.*?)\s*(?:[–—〜～~至]|\s+(?:to|-)\s+)\s*(.*?)$/i.exec(value) ?? /^(\d{1,4})\s*-\s*(\d{1,4}(?:\D.*)?)$/.exec(value) ?? /^(\D+\d{1,4}年?)\s*-\s*(\D+\d{1,4}年?)$/.exec(value)
  if (!range) return null
  // 206–168 BCE: the era named after the last year covers the first one too.
  const shared = /^\d{1,4}$/.test(range[1]) && after.test(range[2])
  const first = westernPeriod(shared ? `${range[1]} BCE` : range[1]), last = westernPeriod(range[2])
  // 前206–168年 leaves open which era 168 is in; 前206–220年 can only end in the common era.
  const from = first && bceOf(yearOfDay(first.start)), to = last && yearOfDay(last.start)
  if (from && to && to > 0 && to < from) return null
  return first && last && compareDays(first.start, last.end) <= 0 ? { start: first.start, end: last.end, precision: 'range', ...(approximate && { approximate }) } : null
}
