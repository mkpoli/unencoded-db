import { partKey } from '$lib/composition'
import { radicalForms, radicalStrokes, standing, type Branch } from '$lib/radicals'
import { radicalCounts } from '$lib/server/entries'
import { env } from '$lib/server/guard'
import { listParts, partCountsByKeys, type PartCount } from '$lib/server/parts'
import type { PageServerLoad } from './$types'

export const load: PageServerLoad = async (event) => {
  // The Kangxi radicals come in order, so the ones of one stroke count sit together.
  // The radicals outside the Kangxi set have no place in that order and come last, together.
  const db = env(event).DB
  const [{ counts, stated }, parts] = await Promise.all([
    radicalCounts(db),
    listParts(db),
  ])
  const groups: { strokes: number | null; radicals: Branch[] }[] = []
  for (const radical of standing(counts, stated)) {
    const strokes = radicalStrokes(radical.path)
    if (groups.at(-1)?.strokes === strokes) groups.at(-1)!.radicals.push(radical)
    else groups.push({ strokes, radicals: [radical] })
  }

  // Look up counts for every shown radical, branch, and Kangxi variant form directly by primary key
  // so no radical loses its pie-chart link once more than `PARTS_LIST_LIMIT` components exist.
  const lookupKeys = new Set<string>()
  const collectKeys = (branches: readonly Branch[], rootLevel: boolean) => {
    for (const branch of branches) {
      lookupKeys.add(partKey(branch.radical))
      if (rootLevel) {
        for (const form of radicalForms(branch.radical)) lookupKeys.add(partKey(form))
      }
      collectKeys(branch.branches, false)
    }
  }
  for (const group of groups) collectKeys(group.radicals, true)

  const radicalCountMap = await partCountsByKeys(db, [...lookupKeys])
  const radicalParts: Record<string, PartCount> = {}
  const variantsByRadical: Record<string, PartCount[]> = {}
  const indexBranches = (branches: readonly Branch[], rootLevel: boolean) => {
    for (const branch of branches) {
      const selfKey = partKey(branch.radical)
      const n = radicalCountMap.get(selfKey)
      if (n !== undefined) radicalParts[branch.radical] = { part: selfKey, n }
      if (rootLevel) {
        const variants: PartCount[] = []
        const seen = new Set<string>([branch.radical, selfKey])
        for (const form of radicalForms(branch.radical)) {
          const key = partKey(form)
          if (seen.has(key)) continue
          seen.add(key)
          const count = radicalCountMap.get(key)
          if (count !== undefined) variants.push({ part: key, n: count })
        }
        if (variants.length) {
          variants.sort((a, b) => b.n - a.n || a.part.localeCompare(b.part))
          variantsByRadical[branch.radical] = variants
        }
      }
      indexBranches(branch.branches, false)
    }
  }
  for (const group of groups) indexBranches(group.radicals, true)

  return { groups, parts, radicalParts, variantsByRadical }
}
