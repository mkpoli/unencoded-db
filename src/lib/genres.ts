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
  { slug: 'homograph', label: '同形字', parent: null },
  { slug: 'names', label: '人名', parent: null },
  { slug: 'places', label: '地名', parent: null },
  { slug: 'flora-fauna', label: '動植物', parent: null },
]

export const COLLECTIONS = [{ slug: 'extension-e', label: 'Extension E' }] as const

export const genreOf = (slug: string) => GENRES.find(genre => genre.slug === slug) ?? null
export const isCollection = (slug: string) => COLLECTIONS.some(collection => collection.slug === slug)

export type GenreGroup = { parent: Genre; children: Genre[] }

/** The categories as ungrouped labels and one block per parent. */
export function groupGenres(genres: readonly Genre[] = GENRES): { standalone: Genre[]; groups: GenreGroup[] } {
  const parents = genres.filter(genre => !genre.parent).map(parent => ({ parent, children: genres.filter(genre => genre.parent === parent.slug) }))
  return { standalone: parents.filter(group => !group.children.length).map(group => group.parent), groups: parents.filter(group => group.children.length) }
}
