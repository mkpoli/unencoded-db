import { error } from '@sveltejs/kit'
import { recordCode, recordName } from '$lib/code'
import { translate } from '$lib/i18n'
import { scriptName } from '$lib/scripts'
import { getEntryRow, getSourceArtwork, getVisibleSource, mediaVisible } from '$lib/server/entries'
import { env } from '$lib/server/guard'
import { evidenceArtwork, recordArtwork, renderCard } from '$lib/server/social-card'
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
    if (entry) {
      const cover = entry.cover_key && await mediaVisible(bindings.DB, entry.cover_key) ? entry.cover_key : null
      const label = event.url.searchParams.get('view') === 'history'
        ? translate(locale, 'history.globalTitle')
        : scriptName(locale, entry.script, entry.script_other)
      return await renderCard(bindings.ASSETS, event.url.origin, {
        key: JSON.stringify([kind, locale, id, label, entry.ids, entry.layout, cover]),
        label, title: recordCode(entry.id), detail: recordName(entry.id),
        size: 78,
        art: () => recordArtwork(bindings.MEDIA, entry, cover),
      })
    }
    if (source) {
      const image = await getSourceArtwork(bindings.DB, id)
      return await renderCard(bindings.ASSETS, event.url.origin, {
        key: JSON.stringify([kind, locale, source, image]),
        label: translate(locale, 'source.title'), title: source.title || source.url || `#${source.id}`,
        detail: [source.author, source.report_date].filter(Boolean).join(' · '), size: 55,
        art: image ? async () => (await evidenceArtwork(bindings.MEDIA, image.image_key)) || evidenceArtwork(bindings.MEDIA, image.thumb_key) : undefined,
      })
    }
  } catch (cause) {
    console.error('Could not render social card', cause)
  }
  return new Response(null, { status: 302, headers: { location: '/social-card.png', 'cache-control': 'no-store' } })
}
