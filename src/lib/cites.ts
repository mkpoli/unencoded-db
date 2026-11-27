import { westernDate, yearOfDay, type DateReading } from './dates'
import { datesOriginal } from './scripts'

export type DateWarning =
  | { side: 'via'; index: number; viaYear: number; workYear: number }
  | { side: 'cite'; index: number; citeYear: number; workYear: number }

type DateLookup = ReadonlyMap<string, DateReading | null>

function yearOf(text: string | null | undefined, book?: DateLookup): number | null {
  if (!text) return null
  const reading = book?.has(text) ? book.get(text) : westernDate(text)
  return reading ? yearOfDay(reading.start) : null
}

/**
 * Checks whether any discovery relay (`via`) predates the sighting's work or any cited older work
 * (`cite`) postdates it. Returns advisory warnings; callers never refuse a write for date order.
 */
export function dateOrderWarnings(
  work: { report_date?: string | null; original_date?: string | null; closeness?: string | null },
  vias: readonly { report_date?: string | null }[],
  cites: readonly { report_date?: string | null; target_report_date?: string | null; target_original_date?: string | null }[],
  book?: DateLookup,
): DateWarning[] {
  const reportYear = yearOf(work.report_date, book)
  const originalYear = datesOriginal(work.closeness) ? yearOf(work.original_date, book) : null
  const workYears = [reportYear, originalYear].filter((year): year is number => year !== null)
  if (!workYears.length) return []
  const earliestWork = Math.min(...workYears)
  const latestWork = Math.max(...workYears)
  const warnings: DateWarning[] = []
  for (const [index, via] of vias.entries()) {
    const viaYear = yearOf(via.report_date, book)
    if (viaYear !== null && viaYear < earliestWork) warnings.push({ side: 'via', index, viaYear, workYear: earliestWork })
  }
  for (const [index, cite] of cites.entries()) {
    const targetYears = [yearOf(cite.target_original_date, book), yearOf(cite.target_report_date, book), yearOf(cite.report_date, book)].filter((year): year is number => year !== null)
    const citeYear = targetYears.length ? Math.min(...targetYears) : null
    if (citeYear !== null && citeYear > latestWork) warnings.push({ side: 'cite', index, citeYear, workYear: latestWork })
  }
  return warnings
}
