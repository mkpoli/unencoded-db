import { error } from '@sveltejs/kit'
import { recordCode, recordName } from '$lib/code'
import { translate } from '$lib/i18n'
import { shownLabel } from '$lib/tags'
import { entryScriptTags, getCoverPicture, getEntryRow } from '$lib/server/entries'
import { env } from '$lib/server/guard'
import { recordArtwork, renderCard } from '$lib/server/social-card'
import { recordIdParam } from '../../../_submission.server'
import type { RequestHandler } from './$types'

export const GET: RequestHandler = async event => {
  const { code, locale } = event.params
  const id = recordIdParam(code)
  if (!id) error(404)
  const bindings = env(event)
  const entry = await getEntryRow(bindings.DB, id)
  if (!entry || entry.hidden_at || entry.merged_into) error(404)
  try {
    const [cover, scripts] = await Promise.all([
      entry.cover_key ? getCoverPicture(bindings.DB, entry.cover_key) : null,
      event.url.searchParams.get('view') === 'history' ? [] : entryScriptTags(bindings.DB, id),
    ])
    const label = event.url.searchParams.get('view') === 'history'
      ? translate(locale, 'history.globalTitle')
      : scripts.map(tag => shownLabel(tag, locale)).join(' · ') || translate(locale, 'app.name')
    return await renderCard(event, bindings.ASSETS, {
      key: JSON.stringify(['entry', locale, id, label, entry.ids, entry.layout, cover]),
      label, title: recordCode(entry.id), detail: recordName(entry.id),
      size: 78,
      art: () => recordArtwork(bindings.MEDIA, entry, cover, { assets: bindings.ASSETS, origin: event.url.origin, locale }),
    })
  } catch (cause) {
    console.error('Could not render social card', cause)
  }
  return new Response(null, { status: 302, headers: { location: '/social-card.png', 'cache-control': 'no-store' } })
}
