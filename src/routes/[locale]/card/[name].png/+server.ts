import { error } from '@sveltejs/kit'
import { recordCode } from '$lib/code'
import { isLocale, translate } from '$lib/i18n'
import { getSocialPage, socialPageTitle } from '$lib/social-pages'
import { getCoverPicture, getEntryRow, getSourceArtwork, getVisibleSource } from '$lib/server/entries'
import { env } from '$lib/server/guard'
import { evidenceArtwork, recordArtwork, renderCard } from '$lib/server/social-card'
import type { RequestHandler } from './$types'

export const GET: RequestHandler = async event => {
  const { name, locale } = event.params
  const card = getSocialPage(name)
  if (!card || !isLocale(locale)) error(404)
  const { ASSETS, DB, MEDIA } = env(event)
  const row = card.specimen ? await getEntryRow(DB, card.specimen) : null
  const entry = row && !row.hidden_at && !row.merged_into ? row : null
  const cover = !card.glyphOnly && entry?.cover_key ? await getCoverPicture(DB, entry.cover_key) : null
  const source = card.source ? await getVisibleSource(DB, card.source) : null
  const image = source ? await getSourceArtwork(DB, source.id) : null
  const detail = card.detail ? translate(locale, card.detail) : [source?.title, source?.report_date].filter(Boolean).join(' · ')
  try {
    return await renderCard(ASSETS, event.url.origin, {
      key: JSON.stringify([locale, name, entry?.id, entry?.ids, entry?.layout, cover, source?.id, image]),
      label: translate(locale, name === 'home' || name === 'fallback' ? 'nav.browse' : 'app.name'),
      title: socialPageTitle(locale, card.title), detail, caption: entry ? recordCode(entry.id) : undefined,
      art: entry ? () => recordArtwork(MEDIA, entry, cover, { assets: ASSETS, origin: event.url.origin, locale })
        : image ? () => evidenceArtwork(MEDIA, image) : undefined,
    })
  } catch (cause) {
    console.error('Could not render section social card', cause)
    return new Response(null, { status: 302, headers: { location: '/social-card.png', 'cache-control': 'no-store' } })
  }
}
