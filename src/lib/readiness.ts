// What IRG asks of the evidence for a new ideograph, read against one record. Each check quotes a rule of
// IRG Principles & Procedures, Version 18 (IRG N2850R, 2026-04-17, https://www.unicode.org/irg/pp/),
// alongside the 2026 IWDS guidelines for stroke counting and radical assignment:
//   - Consolidated FS & SC Guidelines (IRG N2951, 2026-04-02, https://www.unicode.org/irg/docs/n2951-FSSC.pdf)
//   - Rules for Assignment of Radicals, Version 1 (IRG N2952, 2026-09-25, https://www.unicode.org/irg/docs/n2952-RadicalAssignments.pdf)
// The checks describe a record and decide nothing about it: any record may stay as it is.
import { parseContexts } from './scripts'

export type SightingFacts = { media: { box: string | null }[]; title: string | null; author: string | null; publisher: string | null; report_date: string | null; page: string | null; contexts: string | null; style: string | null }
export type EntryFacts = { ids: string | null; radical: string | null; strokes: number | null }

export const CHECKS = ['page', 'mark', 'reference', 'ids', 'radical', 'regular', 'running', 'second'] as const
export type Check = (typeof CHECKS)[number]

export type IrgReference = {
  id: 'pp' | 'fssc' | 'radicals'
  doc: string
  date: string
  href: string
  labelKey: 'ready.rules' | 'ready.fssc' | 'ready.radicals'
}

/** Official IRG normative references linked beside the evidence readiness checklist. */
export const IRG_REFERENCES: readonly IrgReference[] = [
  { id: 'pp', doc: 'IRG N2850R', date: '2026-04-17', href: 'https://www.unicode.org/irg/pp/', labelKey: 'ready.rules' },
  { id: 'fssc', doc: 'IRG N2951', date: '2026-04-02', href: 'https://www.unicode.org/irg/docs/n2951-FSSC.pdf', labelKey: 'ready.fssc' },
  { id: 'radicals', doc: 'IRG N2952', date: '2026-09-25', href: 'https://www.unicode.org/irg/docs/n2952-RadicalAssignments.pdf', labelKey: 'ready.radicals' },
]

export const referenceComplete = (s: Pick<SightingFacts, 'title' | 'author' | 'publisher' | 'report_date' | 'page'>) => Boolean(s.title && s.author && s.publisher && s.report_date && s.page)

export function readiness(entry: EntryFacts, sightings: SightingFacts[]): Record<Check, boolean> {
  return {
    page: sightings.some(s => s.media.length > 0),
    mark: sightings.some(s => s.media.some(image => image.box)),
    reference: sightings.some(referenceComplete),
    ids: Boolean(entry.ids),
    radical: Boolean(entry.radical && entry.strokes != null),
    regular: sightings.some(s => s.style === 'regular'),
    running: sightings.some(s => parseContexts(s.contexts).includes('running_text')),
    second: sightings.length >= 2,
  }
}
