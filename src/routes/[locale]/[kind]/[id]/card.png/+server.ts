import { error } from '@sveltejs/kit'
import { recordCode, recordName } from '$lib/code'
import { translate } from '$lib/i18n'
import { shownLabel } from '$lib/tags'
import { sourceByline, sourceName } from '$lib/source-name'
import { entryScriptTags, getCoverPicture, getEntryRow, getSourceArtwork, getVisibleSource } from '$lib/server/entries'
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
      const [cover, scripts] = await Promise.all([
        entry.cover_key ? getCoverPicture(bindings.DB, entry.cover_key) : null,
        event.url.searchParams.get('view') === 'history' ? [] : entryScriptTags(bindings.DB, id),
      ])
      const label = event.url.searchParams.get('view') === 'history'
        ? translate(locale, 'history.globalTitle')
        : scripts.map(tag => shownLabel(tag, locale)).join(' · ') || translate(locale, 'app.name')
      return await renderCard(event, bindings.ASSETS, {
        key: JSON.stringify([kind, locale, id, label, entry.ids, entry.layout, cover]),
        label, title: recordCode(entry.id), detail: recordName(entry.id),
        size: 78,
        art: () => recordArtwork(bindings.MEDIA, entry, cover, { assets: bindings.ASSETS, origin: event.url.origin, locale }),
      })
    }
    if (source) {
      const image = await getSourceArtwork(bindings.DB, id)
      const label = (key: string) => translate(locale, key)
      const { text, fields } = sourceName(source, label)
      return await renderCard(event, bindings.ASSETS, {
        key: JSON.stringify([kind, locale, source, image]),
        label: label('source.title'), title: text,
        detail: sourceByline(source, fields, label, ['author', 'report_date']), size: 55,
        art: image ? () => evidenceArtwork(bindings.MEDIA, image) : undefined,
      })
    }
  } catch (cause) {
    console.error('Could not render social card', cause)
  }
  return new Response(null, { status: 302, headers: { location: '/social-card.png', 'cache-control': 'no-store' } })
}
