import { radicalCounts } from '$lib/server/entries'
import { env } from '$lib/server/guard'
import { radicalStrokes, standing, type Branch } from '$lib/radicals'
import type { PageServerLoad } from './$types'

export const load: PageServerLoad = async (event) => {
  // The Kangxi radicals come in order, so the ones of one stroke count sit together.
  // The radicals outside the Kangxi set have no place in that order and come last, together.
  const groups: { strokes: number | null; radicals: Branch[] }[] = []
  const { counts, stated } = await radicalCounts(env(event).DB)
  for (const radical of standing(counts, stated)) {
    const strokes = radicalStrokes(radical.path)
    if (groups.at(-1)?.strokes === strokes) groups.at(-1)!.radicals.push(radical)
    else groups.push({ strokes, radicals: [radical] })
  }
  return { groups }
}
