import { counts, customGenres } from '$lib/server/entries'
import { env } from '$lib/server/guard'
import { groupGenres } from '$lib/genres'
import type { PageServerLoad } from './$types'

export const load: PageServerLoad = async (event) => {
  const db = env(event).DB
  const [totals, custom] = await Promise.all([counts(db), customGenres(db)])
  const { standalone, groups } = groupGenres()
  const entry = (genre: { slug: string; label: string }) => ({ value: genre.slug, label: genre.label, n: totals[`g:${genre.slug}`] ?? 0 })
  return {
    standalone: standalone.map(entry),
    groups: groups.map(group => ({ parent: entry(group.parent), children: group.children.map(entry) })),
    custom: custom.map(genre => ({ value: genre.value, label: genre.value, n: genre.n })),
  }
}
