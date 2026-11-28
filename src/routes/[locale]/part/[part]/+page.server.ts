import { error, redirect } from '@sveltejs/kit'
import { FUNCTION_MAX, partKey, validPartKey } from '$lib/composition'
import { parsePath, radicalBase, radicalForms } from '$lib/radicals'
import { tileGlyphs } from '$lib/server/glyphs'
import { env } from '$lib/server/guard'
import { parsePartCursor, partEntries, partSummary, radicalRecordCount, relatedPartCounts, type PartCursor } from '$lib/server/parts'
import type { PageServerLoad } from './$types'

export const load: PageServerLoad = async (event) => {
  const raw = event.params.part
  const canonical = partKey(raw)
  if (!validPartKey(canonical)) error(404)
  if (canonical !== raw) {
    redirect(301, `/${event.params.locale}/part/${encodeURIComponent(canonical)}${event.url.search}`)
  }

  const { searchParams } = event.url
  const hasFunc = searchParams.has('func')
  const unlabeled = searchParams.get('unlabeled') === '1'
  if (hasFunc && unlabeled) error(404)
  if (searchParams.has('unlabeled') && !unlabeled) error(404)

  let selected: string | null = null
  if (unlabeled) {
    selected = ''
  } else if (hasFunc) {
    const rawFunc = searchParams.get('func')?.normalize('NFC').trim() ?? ''
    if (!rawFunc || [...rawFunc].length > FUNCTION_MAX) error(404)
    selected = rawFunc
  }

  const rawAfter = searchParams.get('after')
  let after: PartCursor | null = null
  if (rawAfter !== null) {
    after = parsePartCursor(rawAfter)
    if (!after) error(404)
  }

  const radical = radicalBase(canonical) ?? parsePath(canonical)
  const siblingCandidates = radical
    ? [...new Set(radicalForms(radical).map(partKey))].filter(form => form !== canonical)
    : []

  const db = env(event).DB
  const [summary, page, radicalCount, related] = await Promise.all([
    partSummary(db, canonical),
    partEntries(db, canonical, { func: selected, after }),
    radical ? radicalRecordCount(db, radical) : Promise.resolve(0),
    siblingCandidates.length ? relatedPartCounts(db, siblingCandidates) : Promise.resolve([]),
  ])
  const glyphs = await tileGlyphs(
    event.platform,
    event.url.origin,
    page.entries.map(item => item.tile),
    event.locals.glyphStyle,
  )

  return {
    part: canonical,
    total: summary.total,
    slices: summary.slices,
    selected,
    entries: page.entries,
    more: page.more,
    glyphs,
    radical: radical && radicalCount > 0 ? { path: radical, records: radicalCount } : null,
    related,
  }
}
