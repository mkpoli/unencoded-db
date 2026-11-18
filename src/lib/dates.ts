// Western calendar 101.1 uses Julian dates through 1582-10-04 and Gregorian dates from 1582-10-15.
export type DateReading = {
  start: string
  end: string
  precision: 'year' | 'month' | 'day' | 'range'
  approximate?: boolean
  query?: string
}

export function dateText(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : null
}

const pad = (n: number) => String(n).padStart(2, '0')
function westernPeriod(value: string): DateReading | null {
  const match = /^(\d{1,4})(?:年(?:([0-9]{1,2})月(?:([0-9]{1,2})日)?)?|(?:-([0-9]{1,2})(?:-([0-9]{1,2}))?)?)$/.exec(value)
  if (!match) return null
  const year = Number(match[1]), month = Number(match[2] ?? match[4] ?? 1), day = Number(match[3] ?? match[5] ?? 1)
  const leap = year % 4 === 0 && (year < 1582 || year % 100 !== 0 || year % 400 === 0)
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  if (!year || month < 1 || month > 12 || day < 1 || day > days[month - 1]) return null
  const precision = match[3] || match[5] ? 'day' : match[2] || match[4] ? 'month' : 'year'
  const prefix = String(year).padStart(4, '0')
  const start = `${prefix}-${pad(month)}-${pad(day)}`
  if (start > '1582-10-04' && start < '1582-10-15') return null
  const end = precision === 'day' ? start : precision === 'month' ? `${prefix}-${pad(month)}-${days[month - 1]}` : `${prefix}-12-31`
  return { start, end, precision }
}

// Interpret the whole expression. A number embedded in an arbitrary transcription cannot date a work.
export function westernDate(raw: string): DateReading | null {
  let value = raw.normalize('NFKC').trim()
  const approx = /^(?:c\.|ca\.|circa|約|约)\s*/i
  const approximate = approx.test(value)
  value = value.replace(approx, '')
  // An explicit Western year supplied alongside an era date.
  const stated = /^\p{Script=Han}+[\d元一二三四五六七八九十]+年\s*\((\d{3,4})\)$/u.exec(value)
  const single = westernPeriod(stated?.[1] ?? value)
  if (single) return approximate ? { ...single, approximate } : single
  const range = /^(.*?)\s*(?:[–—〜～~至]|\s+to\s+)\s*(.*?)$/i.exec(value) ?? /^(\d{3,4})\s*-\s*(\d{3,4})$/.exec(value)
  if (!range) return null
  const first = westernPeriod(range[1]), last = westernPeriod(range[2])
  return first && last && first.start <= last.end ? { start: first.start, end: last.end, precision: 'range', ...(approximate && { approximate }) } : null
}
