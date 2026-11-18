import { error } from '@sveltejs/kit'
import { recordCode, recordName } from '$lib/code'
import { translate } from '$lib/i18n'
import { scriptName } from '$lib/scripts'
import { getEntryRow, getVisibleSource } from '$lib/server/entries'
import { env } from '$lib/server/guard'
import { recordArtwork, renderCard } from '$lib/server/social-card'
import { positiveId } from '../../../../_submission.server'
import type { RequestHandler } from './$types'

export const GET: RequestHandler = async event => {
  const { id: rawId, kind, locale } = event.params
  const id = positiveId(rawId)
  if (!id || (kind !== 'entry' && kind !== 'source')) error(404)
  const bindings = env(event)
  const entry = kind === 'entry' ? await getEntryRow(bindings.DB, id) : null
  const source = kind === 'source' ? await getVisibleSource(bindings.DB, id) : null
  if (!(source || entry && !entry.hidden_at && !entry.merged_into)) error(404)
  try {
    if (entry) return await renderCard(bindings.ASSETS, event.url.origin, {
      label: scriptName(locale, entry.script, entry.script_other), title: recordCode(entry.id), detail: recordName(entry.id),
      art: await recordArtwork(bindings, entry),
    })
    if (source) return await renderCard(bindings.ASSETS, event.url.origin, {
      label: translate(locale, 'source.title'), title: source.title || source.url || `#${source.id}`,
      detail: [source.author, source.report_date].filter(Boolean).join(' · '), source: true,
    })
  } catch (cause) {
    console.error('Could not render social card', cause)
  }
  return new Response(null, { status: 302, headers: { location: '/social-card.png', 'cache-control': 'no-store' } })
}
