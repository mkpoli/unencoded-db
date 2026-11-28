// Typed tags with DAG implications: a type (which determines its color), an optional group within the
// type, and the tags, which nest under each other to any depth. A tag may automatically carry other tags
// via `implies`, and a record carrying a tag is also listed under every tag it transitively implies; a
// tag that implies another of its own type stands under it.
export const TAG_TYPES = ['script', 'region', 'language', 'form', 'domain', 'meta', 'general'] as const
export type TagType = (typeof TAG_TYPES)[number]
export const isTagType = (value: unknown): value is TagType => TAG_TYPES.includes(value as TagType)
// The script tag a new record starts with.
export const DEFAULT_SCRIPT_TAG = 'han'

export type Tag = {
  name: string
  label: string
  type: TagType
  position: number
  rev: number
  n: number
  implies: string[]
  group: number | null
  /** Other names that resolve to this tag: ones given to it, and the names of tags merged into it. */
  aliases: string[]
  /** The tag's name in each interface language that has one, by locale. */
  names: Names
  used?: boolean
}
export type Names = Partial<Record<string, string>>
/** A group of tags within one type: the middle tier. */
export type TagGroup = { id: number; type: TagType; label: string; names: Names; position: number; rev: number }

/** What a tag or a group is called in a language: its name there, or its label. */
export const shownLabel = (item: { label: string; names?: Names }, locale: string) => item.names?.[locale] || item.label
/** Tags or groups with each label as a language shows it. */
export const localized = <T extends { label: string; names?: Names }>(items: readonly T[], locale: string): T[] => items.map(item => ({ ...item, label: shownLabel(item, locale) }))
export type TagRef = Pick<Tag, 'name' | 'label' | 'type' | 'position' | 'implies'>

export const COLLECTIONS = [{ slug: 'extension-e', label: 'Extension E' }] as const
export const isCollection = (slug: string) => COLLECTIONS.some(collection => collection.slug === slug)

export const TAG_LENGTH_MAX = 40
export const TAG_IMPLIES_MAX = 20
export const TAG_IMPLY_DEPTH_MAX = 16
export const TAG_CLOSURE_MAX = 64
export const TAG_ALIASES_MAX = 20
export const GROUP_LABEL_MAX = 40
export const GROUPS_MAX = 300

/** Whether a value can name a group: trimmed, NFC, short, with no control characters. */
export function validGroupLabel(value: string) {
  return Boolean(value) && value.length <= GROUP_LABEL_MAX && value === value.normalize('NFC').trim() && !/\p{Cc}/u.test(value)
}

/** Whether a value has the shape of a tag's canonical name or display label. */
export function validTagName(value: string) {
  return Boolean(value) && value.length <= TAG_LENGTH_MAX && value === value.normalize('NFC').trim() && !/^#/u.test(value) && !/[\s|,，、\p{Cc}]/u.test(value)
}

type Named = Pick<Tag, 'name' | 'label'> & { aliases?: readonly string[]; names?: Names }

/**
 * The canonical name a typed tag is stored as, or null when invalid. Matches an existing tag by name,
 * display label, alias or its name in a language, stripping a leading `#`; anything else valid is kept as a new tag name.
 */
export function cleanTag(value: string, tags: readonly Named[]): string | null {
  const typed = value.normalize('NFC').trim().replace(/^#+/, '').trim()
  if (!typed || typed.length > TAG_LENGTH_MAX) return null
  const byName = tags.find(tag => tag.name === typed)
  if (byName) return byName.name
  const byLabel = tags.find(tag => tag.label === typed)
  if (byLabel) return byLabel.name
  // An alias names one tag for good; a name in another language only shows it, so the alias wins.
  const byAlias = tags.find(tag => tag.aliases?.includes(typed))
  if (byAlias) return byAlias.name
  const byLanguage = tags.find(tag => Object.values(tag.names ?? {}).includes(typed))
  if (byLanguage) return byLanguage.name
  return validTagName(typed) ? typed : null
}

/** The tag a name stands for: the tag of that name, or the one it is an alias of. */
export const canonicalName = (name: string, tags: readonly Pick<Named, 'name' | 'aliases'>[]) => tags.find(tag => tag.aliases?.includes(name))?.name ?? name

/** Each tag's display label by its canonical name and by its aliases; an unknown name shows as written. */
export const tagLabels = (tags: readonly Named[]) => new Map(tags.flatMap(tag => [tag.name, ...(tag.aliases ?? [])].map(name => [name, tag.label] as const)))

/** Each tag by its canonical name and by its aliases. */
export const tagLookup = <T extends Pick<Tag, 'name'> & { aliases?: readonly string[] }>(tags: readonly T[]) => new Map(tags.flatMap(tag => [tag.name, ...(tag.aliases ?? [])].map(name => [name, tag] as const)))

export const byTagOrder = (a: Pick<Tag, 'position' | 'name'>, b: Pick<Tag, 'position' | 'name'>) => a.position - b.position || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)

export const byGroupOrder = (a: Pick<TagGroup, 'position' | 'id'>, b: Pick<TagGroup, 'position' | 'id'>) => a.position - b.position || a.id - b.id

export type TagShelf<T> = { group: TagGroup | null; tags: T[] }
export type TagSection<T> = { type: TagType; shelves: TagShelf<T>[] }

const typeOf = (tag: Pick<Tag, 'type'>): TagType => (isTagType(tag.type) ? tag.type : 'general')

/**
 * Each tag's parent in the tree: of the tags of its own type it implies, the one with the longest chain of
 * such parents above it, so a tag that implies both 略字 and 大陸簡體字 sits under 大陸簡體字. Ties go to
 * the first by order. A tag with none is a root. Only tags in the list count.
 */
export function tagParents<T extends Pick<Tag, 'name' | 'type' | 'position' | 'implies'>>(tags: readonly T[]): Map<string, string> {
  const byName = new Map(tags.map(tag => [tag.name, tag]))
  const candidates = (tag: T) => tag.implies.map(name => byName.get(name)).filter((other): other is T => Boolean(other) && other!.name !== tag.name && typeOf(other!) === typeOf(tag))
  const height = new Map<string, number>()
  const heightOf = (tag: T, seen: Set<string>): number => {
    const known = height.get(tag.name)
    if (known !== undefined) return known
    if (seen.has(tag.name)) return 0
    seen.add(tag.name)
    const above = Math.max(0, ...candidates(tag).map(other => 1 + heightOf(other, seen)))
    seen.delete(tag.name)
    height.set(tag.name, above)
    return above
  }
  const parents = new Map<string, string>()
  for (const tag of tags) {
    const best = candidates(tag).sort((a, b) => heightOf(b, new Set()) - heightOf(a, new Set()) || byTagOrder(a, b))[0]
    if (best) parents.set(tag.name, best.name)
  }
  return parents
}

/** Each tag's depth in the tree, 0 for a root. */
export function tagDepths(tags: readonly Pick<Tag, 'name'>[], parents: ReadonlyMap<string, string>): Map<string, number> {
  const depths = new Map<string, number>()
  for (const tag of tags) {
    let depth = 0
    for (let at = parents.get(tag.name); at !== undefined && depth <= tags.length; at = parents.get(at)) depth++
    depths.set(tag.name, depth)
  }
  return depths
}

/**
 * Tags by type, and by group within each type: the groups in their order, then the tags in no group.
 * A tag stands under its parent (`tagParents`) at any depth, on the shelf of its root, so each shelf
 * lists its tags in tree order: a tag, then its children by position and name. With `every`, every type
 * and every group is listed, empty ones too, so that there is somewhere to put a tag.
 */
export function arrangeTags<T extends Pick<Tag, 'name' | 'type' | 'position' | 'group' | 'implies'>>(tags: readonly T[], groups: readonly TagGroup[], { every = false } = {}): TagSection<T>[] {
  const sorted = [...groups].sort(byGroupOrder)
  const known = new Map(sorted.map(group => [group.id, group]))
  const parents = tagParents(tags)
  const children = new Map<string, T[]>()
  for (const tag of [...tags].sort(byTagOrder)) {
    const parent = parents.get(tag.name)
    if (parent !== undefined) children.set(parent, [...(children.get(parent) ?? []), tag])
  }
  // A tag, then each child after it, depth first; a tag met twice is listed once.
  const tree = (roots: readonly T[]) => {
    const listed: T[] = [], seen = new Set<string>()
    const walk = (tag: T) => {
      if (seen.has(tag.name)) return
      seen.add(tag.name)
      listed.push(tag)
      for (const child of children.get(tag.name) ?? []) walk(child)
    }
    for (const root of roots) walk(root)
    return listed
  }
  return TAG_TYPES.map(type => {
    const roots = [...tags].sort(byTagOrder).filter(tag => typeOf(tag) === type && !parents.has(tag.name))
    const grouped = (group: TagGroup) => tree(roots.filter(tag => tag.group === group.id))
    const loose = tree(roots.filter(tag => tag.group === null || known.get(tag.group)?.type !== type))
    const shelves: TagShelf<T>[] = [
      ...sorted.filter(group => group.type === type).map(group => ({ group, tags: grouped(group) })),
      { group: null, tags: loose },
    ]
    return { type, shelves: every ? shelves : shelves.filter(shelf => shelf.tags.length > 0) }
  }).filter(section => every || section.shelves.length > 0)
}

/** The tags of a section in shelf order, for a flat list such as a select's options. */
export const sectionTags = <T>(section: TagSection<T>) => section.shelves.flatMap(shelf => shelf.tags)

export type ImpliedTag = { name: string; via: string[] }

/**
 * Computes the transitive DAG closure of tags carried by `direct`.
 * Returns the deduplicated `direct` tags, the automatically carried `implied` tags (each with the
 * immediate carrying tag names in `via`), and `all` (`direct` followed by `implied`).
 */
export function implicationClosure(direct: readonly string[], tags: readonly (Pick<TagRef, 'name' | 'implies'> & { aliases?: readonly string[] })[]): { direct: string[]; implied: ImpliedTag[]; all: string[] } {
  const byName = new Map(tags.map(tag => [tag.name, tag]))
  const directList: string[] = []
  const directSet = new Set<string>()
  for (const name of direct.map(item => canonicalName(item, tags))) {
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
 * Reads a new tag request from a form submission (`tag_new`, `tag_new_type`, `tag_new_group`,
 * `tag_new_implies`), falling back to legacy `genre_new` / `genre_new_parent`. Returns null when none
 * was typed, or `'invalid'`.
 */
export function readNewTag(form: FormData, tags: readonly Pick<Tag, 'name' | 'label'>[]): { name: string; type: TagType; group: number | null; implies: string[] } | null | 'invalid' {
  const typed = String(form.get('tag_new') ?? form.get('genre_new') ?? '').trim()
  if (!typed) return null
  const name = cleanTag(typed, tags)
  if (!name) return 'invalid'
  const rawType = String(form.get('tag_new_type') ?? '').trim()
  if (rawType && !isTagType(rawType)) return 'invalid'
  const type: TagType = isTagType(rawType) ? rawType : 'general'
  const rawGroup = String(form.get('tag_new_group') ?? '').trim()
  const group = rawGroup ? Number(rawGroup) : null
  if (group !== null && !(Number.isSafeInteger(group) && group > 0)) return 'invalid'
  const rawImplies = [...form.getAll('tag_new_implies'), ...form.getAll('genre_new_parent')]
    .map(value => String(value).trim().normalize('NFC'))
    .filter(Boolean)
  const implies = [...new Set(rawImplies)]
  return { name, type, group, implies }
}

const TAG_ERROR_KEYS = {
  exists: 'error.tagExists',
  aliased: 'error.tagAliased',
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
