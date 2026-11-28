import { error } from '@sveltejs/kit'
import { translate } from '$lib/i18n'
import { sourceByline, sourceName } from '$lib/source-name'
import { getSourceArtwork, getVisibleSource } from '$lib/server/entries'
import { env } from '$lib/server/guard'
import { evidenceArtwork, renderCard } from '$lib/server/social-card'
import { positiveId } from '../../../../_submission.server'
import type { RequestHandler } from './$types'

export const GET: RequestHandler = async event => {
  const { id: rawId, locale } = event.params
  const id = positiveId(rawId)
  if (!id) error(404)
  const bindings = env(event)
  const source = await getVisibleSource(bindings.DB, id)
  if (!source) error(404)
  try {
    const image = await getSourceArtwork(bindings.DB, id)
    const label = (key: string) => translate(locale, key)
    const { text, fields } = sourceName(source, label)
    return await renderCard(event, bindings.ASSETS, {
      key: JSON.stringify(['source', locale, source, image]),
      label: label('source.title'), title: text,
      detail: sourceByline(source, fields, label, ['author', 'report_date']), size: 55,
      art: image ? () => evidenceArtwork(bindings.MEDIA, image) : undefined,
    })
  } catch (cause) {
    console.error('Could not render social card', cause)
  }
  return new Response(null, { status: 302, headers: { location: '/social-card.png', 'cache-control': 'no-store' } })
}
