import { error, redirect } from '@sveltejs/kit'
import { FUNCTION_MAX, partKey, validPartKey } from '$lib/composition'
import { tileGlyphs } from '$lib/server/glyphs'
import { env } from '$lib/server/guard'
import { partEntries, partSummary } from '$lib/server/parts'
import type { PageServerLoad } from './$types'

const AFTER_RE = /^[1-9]\d{0,15}$/

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
  let after: number | null = null
  if (rawAfter !== null) {
    if (!AFTER_RE.test(rawAfter)) error(404)
    const parsed = Number(rawAfter)
    if (!Number.isSafeInteger(parsed) || parsed < 1) error(404)
    after = parsed
  }

  const db = env(event).DB
  const [summary, page] = await Promise.all([
    partSummary(db, canonical),
    partEntries(db, canonical, { func: selected, after }),
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
  }
}
