// Typed tags with DAG implications. Every tag has a type (which determines its color) and may
// automatically carry other tags via `implies`. A record carrying a tag is also listed under every
// tag it transitively implies.
export const TAG_TYPES = ['region', 'language', 'form', 'domain', 'meta', 'general'] as const
export type TagType = (typeof TAG_TYPES)[number]
export const isTagType = (value: unknown): value is TagType => TAG_TYPES.includes(value as TagType)

export type Tag = {
  name: string
  label: string
  type: TagType
  position: number
  rev: number
  n: number
  implies: string[]
  used?: boolean
}
export type TagRef = Pick<Tag, 'name' | 'label' | 'type' | 'position' | 'implies'>

export const COLLECTIONS = [{ slug: 'extension-e', label: 'Extension E' }] as const
export const isCollection = (slug: string) => COLLECTIONS.some(collection => collection.slug === slug)

export const TAG_LENGTH_MAX = 40
export const TAG_IMPLIES_MAX = 20
export const TAG_IMPLY_DEPTH_MAX = 8
export const TAG_CLOSURE_MAX = 64

/** Whether a value has the shape of a tag's canonical name or display label. */
export function validTagName(value: string) {
  return Boolean(value) && value.length <= TAG_LENGTH_MAX && value === value.normalize('NFC').trim() && !/^#/u.test(value) && !/[\s|,，、\p{Cc}]/u.test(value)
}

/**
 * The canonical name a typed tag is stored as, or null when invalid. Matches an existing tag by name
 * or by display label, stripping a leading `#`; anything else valid is kept as a new tag name.
 */
export function cleanTag(value: string, tags: readonly Pick<Tag, 'name' | 'label'>[]): string | null {
  const typed = value.normalize('NFC').trim().replace(/^#+/, '').trim()
  if (!typed || typed.length > TAG_LENGTH_MAX) return null
  const byName = tags.find(tag => tag.name === typed)
  if (byName) return byName.name
  const byLabel = tags.find(tag => tag.label === typed)
  if (byLabel) return byLabel.name
  return validTagName(typed) ? typed : null
}

/** Each tag's display label by its canonical name; an unknown name shows as written. */
export const tagLabels = (tags: readonly Pick<Tag, 'name' | 'label'>[]) => new Map(tags.map(tag => [tag.name, tag.label]))

export const tagLookup = <T extends Pick<Tag, 'name'>>(tags: readonly T[]) => new Map(tags.map(tag => [tag.name, tag]))

const byOrder = (a: Pick<Tag, 'position' | 'name'>, b: Pick<Tag, 'position' | 'name'>) => a.position - b.position || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)

/** Tags grouped by tag type, sorted by position and name within each type. */
export function arrangeTagsByType<T extends Pick<Tag, 'name' | 'label' | 'type' | 'position'>>(tags: readonly T[]): { type: TagType; tags: T[] }[] {
  const grouped = new Map<TagType, T[]>(TAG_TYPES.map(type => [type, []]))
  for (const tag of [...tags].sort(byOrder)) {
    const bucket = grouped.get(isTagType(tag.type) ? tag.type : 'general')!
    bucket.push(tag)
  }
  return TAG_TYPES.map(type => ({ type, tags: grouped.get(type)! })).filter(group => group.tags.length > 0)
}

export type ImpliedTag = { name: string; via: string[] }

/**
 * Computes the transitive DAG closure of tags carried by `direct`.
 * Returns the deduplicated `direct` tags, the automatically carried `implied` tags (each with the
 * immediate carrying tag names in `via`), and `all` (`direct` followed by `implied`).
 */
export function implicationClosure(direct: readonly string[], tags: readonly Pick<TagRef, 'name' | 'implies'>[]): { direct: string[]; implied: ImpliedTag[]; all: string[] } {
  const byName = new Map(tags.map(tag => [tag.name, tag]))
  const directList: string[] = []
  const directSet = new Set<string>()
  for (const name of direct) {
    if (!name || directSet.has(name)) continue
    directSet.add(name)
    directList.push(name)
  }
  const viaMap = new Map<string, Set<string>>()
  const visited = new Set<string>(directList)
  const queue: string[] = [...directList]
  let steps = 0
  const maxSteps = Math.max(tags.length * 4, 256)
  while (queue.length && steps < maxSteps) {
    steps++
    const current = queue.shift()!
    const info = byName.get(current)
    if (!info) continue
    for (const target of info.implies) {
      if (target === current || directSet.has(target)) continue
      const sources = viaMap.get(target) ?? new Set<string>()
      sources.add(current)
      viaMap.set(target, sources)
      if (!visited.has(target)) {
        visited.add(target)
        queue.push(target)
      }
    }
  }
  const implied: ImpliedTag[] = []
  for (const [name, sources] of viaMap) implied.push({ name, via: [...sources] })
  return { direct: directList, implied, all: [...directList, ...implied.map(item => item.name)] }
}

/** Longest directed path starting at `start` (number of nodes in the path). */
function longestDownstream(start: string, byName: Map<string, Pick<TagRef, 'name' | 'implies'>>, visiting = new Set<string>()): number {
  if (visiting.has(start)) return 0
  const node = byName.get(start)
  if (!node || !node.implies.length) return 1
  visiting.add(start)
  let best = 0
  for (const next of node.implies) best = Math.max(best, longestDownstream(next, byName, visiting))
  visiting.delete(start)
  return 1 + best
}

/** Longest directed path ending at `end` (number of nodes in the path). */
function longestUpstream(end: string, revAdj: Map<string, string[]>, visiting = new Set<string>()): number {
  if (visiting.has(end)) return 0
  const parents = revAdj.get(end) ?? []
  if (!parents.length) return 1
  visiting.add(end)
  let best = 0
  for (const prev of parents) best = Math.max(best, longestUpstream(prev, revAdj, visiting))
  visiting.delete(end)
  return 1 + best
}

/**
 * Checks whether adding `tag -> target` keeps the implication graph a bounded DAG.
 * Returns null when valid, or a refusal code.
 */
export function canImply(tags: readonly Pick<TagRef, 'name' | 'implies'>[], tag: string, target: string): 'missing' | 'self' | 'exists' | 'cycle' | 'limit' | 'depth' | null {
  const byName = new Map(tags.map(item => [item.name, item]))
  const src = byName.get(tag), dst = byName.get(target)
  if (!src || !dst) return 'missing'
  if (tag === target) return 'self'
  if (src.implies.includes(target)) return 'exists'
  if (src.implies.length >= TAG_IMPLIES_MAX) return 'limit'
  // Cycle check: is `tag` already reachable from `target`?
  const closure = implicationClosure([target], tags)
  if (closure.all.includes(tag)) return 'cycle'
  // Depth & closure cap check.
  const revAdj = new Map<string, string[]>()
  for (const item of tags) {
    for (const next of item.implies) revAdj.set(next, [...(revAdj.get(next) ?? []), item.name])
  }
  const up = longestUpstream(tag, revAdj)
  const down = longestDownstream(target, byName)
  if (up + down > TAG_IMPLY_DEPTH_MAX) return 'depth'
  const merged = new Set([...implicationClosure([tag], tags).all, ...closure.all])
  if (merged.size > TAG_CLOSURE_MAX) return 'depth'
  return null
}

/**
 * Reads a new tag request from a form submission (`tag_new`, `tag_new_type`, `tag_new_implies`),
 * falling back to legacy `genre_new` / `genre_new_parent`. Returns null when none was typed, or `'invalid'`.
 */
export function readNewTag(form: FormData, tags: readonly Pick<Tag, 'name' | 'label'>[]): { name: string; type: TagType; implies: string[] } | null | 'invalid' {
  const typed = String(form.get('tag_new') ?? form.get('genre_new') ?? '').trim()
  if (!typed) return null
  const name = cleanTag(typed, tags)
  if (!name) return 'invalid'
  const rawType = String(form.get('tag_new_type') ?? '').trim()
  if (rawType && !isTagType(rawType)) return 'invalid'
  const type: TagType = isTagType(rawType) ? rawType : 'general'
  const rawImplies = [...form.getAll('tag_new_implies'), ...form.getAll('genre_new_parent')]
    .map(value => String(value).trim().normalize('NFC'))
    .filter(Boolean)
  const implies = [...new Set(rawImplies)]
  return { name, type, implies }
}

const TAG_ERROR_KEYS = {
  exists: 'error.tagExists',
  conflict: 'error.tagConflict',
  cycle: 'error.tagCycle',
  depth: 'error.tagDepth',
  limit: 'error.tagLimit',
  too_large: 'error.tagTooLarge',
  slow: 'error.slow',
} as const

/** Maps a server tag mutation error code to an i18n message key. */
export function tagErrorKey(code: string | undefined, fallback: 'tag' | 'tagChange' = 'tagChange') {
  if (code && code in TAG_ERROR_KEYS) return TAG_ERROR_KEYS[code as keyof typeof TAG_ERROR_KEYS]
  return fallback === 'tag' ? 'error.tag' : 'error.tagChange'
}
