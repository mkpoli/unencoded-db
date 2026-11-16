// The categories a character can be filed under. A category with a parent is browsed under it, and a
// record filed under a child is found under its parent too. Each label is the category's own name.
export type Genre = { slug: string; label: string; parent: string | null }

export const GENRES: readonly Genre[] = [
  { slug: 'dialect', label: '方言字', parent: null },
  { slug: 'wu', label: '吳語', parent: 'dialect' },
  { slug: 'mindong', label: '閩東語', parent: 'dialect' },
  { slug: 'yue', label: '粵語', parent: 'dialect' },
  { slug: 'minnan', label: '閩南語', parent: 'dialect' },
  { slug: 'hakka', label: '客家語', parent: 'dialect' },
  { slug: 'mandarin', label: '官話', parent: 'dialect' },
  { slug: 'nom', label: '喃字', parent: 'dialect' },
  { slug: 'baiwen', label: '白文', parent: 'dialect' },
  { slug: 'kokuji', label: '日本國字', parent: 'dialect' },
  { slug: 'kokuji-kr', label: '朝鮮國字', parent: 'dialect' },
  { slug: 'abbreviation', label: '略字・簡化字', parent: null },
  { slug: 'shinjitai', label: '日本新字體', parent: 'abbreviation' },
  { slug: 'shinjitai-extended', label: '日本擴張新字體', parent: 'abbreviation' },
  { slug: 'simplified-cn', label: '大陸簡體字', parent: 'abbreviation' },
  { slug: 'simplified-cn-2', label: '大陸二簡字', parent: 'abbreviation' },
  { slug: 'yakja', label: '韓國略字', parent: 'abbreviation' },
  { slug: 'ryakuji', label: '日本俗略字', parent: 'abbreviation' },
  { slug: 'music', label: '樂譜', parent: null },
  { slug: 'medicine', label: '醫藥', parent: null },
  { slug: 'chemistry', label: '化學', parent: null },
  { slug: 'metrology', label: '度量衡', parent: null },
  { slug: 'taoism', label: '道教', parent: null },
  { slug: 'buddhism', label: '佛教', parent: null },
  { slug: 'qieshen', label: '切身', parent: null },
  { slug: 'transliteration', label: '音譯', parent: null },
  { slug: 'names', label: '人名', parent: null },
  { slug: 'places', label: '地名', parent: null },
  { slug: 'flora-fauna', label: '動植物', parent: null },
]

export const COLLECTIONS = [{ slug: 'extension-e', label: 'Extension E' }] as const

export const genreOf = (slug: string) => GENRES.find(genre => genre.slug === slug) ?? null
/** What a stored category shows as: a built-in's label, or a custom name as written. */
export const genreLabel = (value: string) => genreOf(value)?.label ?? value

export const GENRE_LENGTH_MAX = 40

/**
 * The value a category is stored as, or null when it is neither a built-in nor a valid custom name.
 * A custom name that spells a built-in's label is that built-in. A custom name has no parent.
 */
export function cleanGenre(value: string): string | null {
  const name = value.normalize('NFC').trim()
  if (!name || name.length > GENRE_LENGTH_MAX) return null
  if (genreOf(name)) return name
  const named = GENRES.find(genre => genre.label === name)
  if (named) return named.slug
  return /[\s|,，、\p{Cc}]/u.test(name) ? null : name
}

export const isCollection = (slug: string) => COLLECTIONS.some(collection => collection.slug === slug)

export type GenreGroup = { parent: Genre; children: Genre[] }

/** The categories as ungrouped labels and one block per parent. */
export function groupGenres(genres: readonly Genre[] = GENRES): { standalone: Genre[]; groups: GenreGroup[] } {
  const parents = genres.filter(genre => !genre.parent).map(parent => ({ parent, children: genres.filter(genre => genre.parent === parent.slug) }))
  return { standalone: parents.filter(group => !group.children.length).map(group => group.parent), groups: parents.filter(group => group.children.length) }
}

/** A category people added: its name, the category it sits under (a built-in slug, another custom name, or none) and its records. */
export type CustomGenre = { value: string; parent: string | null; n: number }
/** A category as one line of a list, `depth` 0 for the top of a group. */
export type GenreRow = { value: string; label: string; depth: number }

/** The most levels a chain of categories has, the category itself included. */
export const GENRE_DEPTH_MAX = 4

/**
 * Every category as a list: the ones without children, then one block per category with children. Built-in
 * children come first and custom ones follow, each custom category under its parent, nested by depth.
 */
export function arrangeGenres(custom: readonly CustomGenre[] = []): { standalone: GenreRow[]; groups: { root: GenreRow; rows: GenreRow[] }[] } {
  const known = new Set([...GENRES.map(genre => genre.slug), ...custom.map(item => item.value)])
  const under = (parent: string) => [
    ...GENRES.filter(genre => genre.parent === parent).map(genre => genre.slug),
    ...custom.filter(item => item.parent === parent).map(item => item.value),
  ]
  const roots = [
    ...GENRES.filter(genre => !genre.parent).map(genre => genre.slug),
    ...custom.filter(item => !item.parent || !known.has(item.parent)).map(item => item.value),
  ]
  const seen = new Set<string>()
  const walk = (value: string, depth: number): GenreRow[] => {
    if (seen.has(value) || depth > GENRE_DEPTH_MAX) return []
    seen.add(value)
    return [{ value, label: genreLabel(value), depth }, ...under(value).flatMap(child => walk(child, depth + 1))]
  }
  const blocks = roots.map(root => walk(root, 0)).filter(block => block.length)
  return { standalone: blocks.filter(block => block.length === 1).map(block => block[0]), groups: blocks.filter(block => block.length > 1).map(block => ({ root: block[0], rows: block.slice(1) })) }
}

/** The new category a form asks for: its name as it would be stored and where it goes, null when it asks for none, or 'invalid'. */
export function readNewGenre(form: FormData): { name: string; parent: string | null } | null | 'invalid' {
  const typed = String(form.get('genre_new') ?? '').trim()
  if (!typed) return null
  const name = cleanGenre(typed)
  if (!name) return 'invalid'
  return { name, parent: String(form.get('genre_new_parent') ?? '').trim().normalize('NFC') || null }
}
