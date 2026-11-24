import { error } from '@sveltejs/kit'
import { recordCode } from '$lib/code'
import { translate } from '$lib/i18n'
import { copyCardSpecimen } from '$lib/server/digitized-copies'
import { env } from '$lib/server/guard'
import { recordArtwork, renderCard } from '$lib/server/social-card'
import type { RequestHandler } from './$types'

export const GET: RequestHandler = async event => {
  const { locale, slug } = event.params
  const { DB, MEDIA, ASSETS } = env(event)
  const specimen = await copyCardSpecimen(DB, slug)
  if (!specimen) error(404)
  try {
    const cover = specimen.image_key === null ? null : specimen
    return await renderCard(event, ASSETS, {
      key: JSON.stringify([slug, locale, specimen]),
      label: translate(locale, 'sources.digitizedCopy'), title: specimen.title, detail: specimen.collection,
      caption: recordCode(specimen.entry_id), size: 55,
      art: () => recordArtwork(MEDIA, specimen, cover, { assets: ASSETS, origin: event.url.origin, locale }),
    })
  } catch (cause) {
    console.error('Could not render digitized copy card', cause)
    return new Response(null, { status: 302, headers: { location: '/social-card.png', 'cache-control': 'no-store' } })
  }
}
