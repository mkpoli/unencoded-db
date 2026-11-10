export type Genre = { slug: string; label: string; parent: string | null }
export type GenreGroup = { parent: Genre; children: Genre[] }

/** Split the flat genre list into ungrouped labels and one block per parent. */
export function groupGenres(genres: Genre[] = []): { standalone: Genre[]; groups: GenreGroup[] } {
  const parents = genres
    .filter(genre => !genre.parent)
    .map(parent => ({ parent, children: genres.filter(genre => genre.parent === parent.slug) }))
  return {
    standalone: parents.filter(group => !group.children.length).map(group => group.parent),
    groups: parents.filter(group => group.children.length),
  }
}
