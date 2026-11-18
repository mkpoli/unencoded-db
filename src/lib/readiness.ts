// What IRG asks of the evidence for a new ideograph, read against one record. Each check quotes a rule of
// IRG Principles & Procedures, Version 18 (IRG N2850R, 2026-04-17, https://www.unicode.org/irg/pp/). The
// checks describe a record and decide nothing about it: any record may stay as it is.
export type SightingFacts = { media: { box: string | null }[]; title: string | null; author: string | null; publisher: string | null; report_date: string | null; page: string | null; context: string | null; style: string | null }
export type EntryFacts = { ids: string | null; radical: string | null; strokes: number | null }

export const CHECKS = ['page', 'mark', 'reference', 'ids', 'radical', 'regular', 'running', 'second'] as const
export type Check = (typeof CHECKS)[number]

export const referenceComplete = (s: Pick<SightingFacts, 'title' | 'author' | 'publisher' | 'report_date' | 'page'>) => Boolean(s.title && s.author && s.publisher && s.report_date && s.page)

// The part of a sighting's edit form that fills one check: its pictures, its citation, or a field in the
// citation panel.
export type SightingCheck = 'page' | 'mark' | 'reference' | 'regular' | 'running'
export type ReadySighting = SightingFacts & { id: number }
export type ReadyTarget = { id: number; place: 'pictures' | 'source' | 'source-style' | 'source-context' }

export function readyTarget(check: SightingCheck, sightings: ReadySighting[]): ReadyTarget | null {
  const first = sightings[0]
  if (check === 'page') return firstTarget(sightings.find(s => !s.media.length) ?? first, 'pictures')
  if (check === 'mark') return firstTarget(sightings.find(s => s.media.length && !s.media.some(image => image.box)) ?? first, 'pictures')
  if (check === 'reference') return firstTarget(sightings.find(s => !referenceComplete(s)) ?? first, 'source')
  if (check === 'regular') return firstTarget(sightings.find(s => s.style !== 'regular') ?? first, 'source-style')
  return firstTarget(sightings.find(s => s.context !== 'running_text') ?? first, 'source-context')
}

const firstTarget = (sighting: ReadySighting | undefined, place: ReadyTarget['place']): ReadyTarget | null =>
  sighting ? { id: sighting.id, place } : null

export function readiness(entry: EntryFacts, sightings: SightingFacts[]): Record<Check, boolean> {
  return {
    page: sightings.some(s => s.media.length > 0),
    mark: sightings.some(s => s.media.some(image => image.box)),
    reference: sightings.some(referenceComplete),
    ids: Boolean(entry.ids),
    radical: Boolean(entry.radical && entry.strokes != null),
    regular: sightings.some(s => s.style === 'regular'),
    running: sightings.some(s => s.context === 'running_text'),
    second: sightings.length >= 2,
  }
}
