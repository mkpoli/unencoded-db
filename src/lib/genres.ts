// The categories a character can be filed under, one row each in `categories`. A category with a parent is
// browsed under it, and a record filed under a child is found under its parent too. `name` is what a claim
// stores and never changes; `label` is what is shown.
export type Category = { name: string; label: string; parent: string | null; position: number; n: number }
/** What the pure helpers need of a category. */
export type CategoryRef = Pick<Category, 'name' | 'label' | 'parent' | 'position'>

export const COLLECTIONS = [{ slug: 'extension-e', label: 'Extension E' }] as const

export const GENRE_LENGTH_MAX = 40
/** The most levels a chain of categories has, the category itself included. */
export const GENRE_DEPTH_MAX = 4

/** Whether a value has the shape of a category's name or label. */
export function validGenreName(value: string) {
  return Boolean(value) && value.length <= GENRE_LENGTH_MAX && value === value.normalize('NFC').trim() && !/[\s|,，、\p{Cc}]/u.test(value)
}

/**
 * The name a typed category is stored as, or null when it is not a valid name. A category's name is that
 * category; so is its label. Anything else valid is the name of a category to be added.
 */
export function cleanGenre(value: string, categories: readonly Pick<Category, 'name' | 'label'>[]): string | null {
  const typed = value.normalize('NFC').trim()
  if (!typed || typed.length > GENRE_LENGTH_MAX) return null
  if (categories.some(category => category.name === typed)) return typed
  const labelled = categories.find(category => category.label === typed)
  if (labelled) return labelled.name
  return validGenreName(typed) ? typed : null
}

export const isCollection = (slug: string) => COLLECTIONS.some(collection => collection.slug === slug)

/** Each category's label by its name; a stored name no category has shows as written. */
export const genreLabels = (categories: readonly Pick<Category, 'name' | 'label'>[]) => new Map(categories.map(category => [category.name, category.label]))

const byPosition = (a: CategoryRef, b: CategoryRef) => a.position - b.position || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)

export type CategoryNode<T extends CategoryRef = Category> = T & { children: CategoryNode<T>[]; level: number; height: number }

/**
 * The categories as a tree, each level in order. A category whose parent is missing, or whose chain runs
 * past the cap or into a loop, stands at the top.
 */
export function categoryTree<T extends CategoryRef>(categories: readonly T[]): CategoryNode<T>[] {
  const names = new Set(categories.map(category => category.name))
  const under = new Map<string | null, T[]>()
  for (const category of [...categories].sort(byPosition)) {
    const parent = category.parent !== null && names.has(category.parent) ? category.parent : null
    under.set(parent, [...(under.get(parent) ?? []), category])
  }
  const seen = new Set<string>()
  const grow = (category: T, level: number): CategoryNode<T> => {
    seen.add(category.name)
    const children = level < GENRE_DEPTH_MAX ? (under.get(category.name) ?? []).filter(child => !seen.has(child.name)).map(child => grow(child, level + 1)) : []
    return { ...category, children, level, height: 1 + Math.max(0, ...children.map(child => child.height)) }
  }
  const roots = (under.get(null) ?? []).map(category => grow(category, 1))
  // What a loop or the cap cut off stands at the top, so no category is lost.
  for (const category of categories) if (!seen.has(category.name)) roots.push(grow({ ...category, parent: null }, 1))
  return roots
}

/** Every category in a tree, a parent before its children. */
export const flatten = <T extends CategoryRef>(nodes: readonly CategoryNode<T>[]): CategoryNode<T>[] => nodes.flatMap(node => [node, ...flatten(node.children)])

/**
 * Why a category cannot go under `parent` (null for the top): it would be under itself or a category below
 * it, or a chain would run past the cap. Null when it can.
 */
export function moveRefusal<T extends CategoryRef>(nodes: readonly CategoryNode<T>[], name: string, parent: string | null): 'missing' | 'parent' | 'depth' | null {
  const node = nodes.find(category => category.name === name)
  if (!node) return 'missing'
  if (parent === null) return node.height > GENRE_DEPTH_MAX ? 'depth' : null
  const above = nodes.find(category => category.name === parent)
  if (!above || flatten([node]).some(category => category.name === parent)) return 'parent'
  return above.level + node.height > GENRE_DEPTH_MAX ? 'depth' : null
}

/**
 * Where a category stands once put under `parent` at `position`: the parent it leaves, and the order of the
 * categories under its new parent and under the one it leaves, as the tree stands.
 */
export function placement<T extends CategoryRef>(roots: readonly CategoryNode<T>[], name: string, parent: string | null, position: number) {
  const nodes = flatten(roots)
  const under = (above: string | null) => (above === null ? roots : nodes.find(category => category.name === above)?.children ?? []).map(category => category.name).filter(other => other !== name)
  const from = nodes.find(category => category.children.some(child => child.name === name))?.name ?? null
  const order = under(parent)
  order.splice(Math.max(0, Math.min(position, order.length)), 0, name)
  return { from, order, left: from === parent ? order : under(from) }
}

/** The categories with one moved as `placement` puts it, numbered again in their new order. */
export function moved<T extends CategoryRef>(categories: readonly T[], name: string, parent: string | null, position: number): T[] {
  const { order, left } = placement(categoryTree(categories), name, parent, position)
  const at = new Map([...left.map((other, index) => [other, index] as const), ...order.map((other, index) => [other, index] as const)])
  return categories.map(category => category.name === name ? { ...category, parent, position: at.get(name)! } : at.has(category.name) ? { ...category, position: at.get(category.name)! } : category)
}

/** A category as one line of a list, `depth` 0 for the top of a group. */
export type GenreRow = { value: string; label: string; depth: number }

/** Every category as a list: the ones without children, then one block per category with children. */
export function arrangeGenres(categories: readonly CategoryRef[]): { standalone: GenreRow[]; groups: { root: GenreRow; rows: GenreRow[] }[] } {
  const row = (node: CategoryNode<CategoryRef>): GenreRow => ({ value: node.name, label: node.label, depth: node.level - 1 })
  const roots = categoryTree(categories)
  return {
    standalone: roots.filter(root => !root.children.length).map(row),
    groups: roots.filter(root => root.children.length).map(root => ({ root: row(root), rows: flatten(root.children).map(row) })),
  }
}

/** The new category a form asks for: its name as it would be stored and where it goes, null when it asks for none, or 'invalid'. */
export function readNewGenre(form: FormData, categories: readonly Pick<Category, 'name' | 'label'>[]): { name: string; parent: string | null } | null | 'invalid' {
  const typed = String(form.get('genre_new') ?? '').trim()
  if (!typed) return null
  const name = cleanGenre(typed, categories)
  if (!name) return 'invalid'
  return { name, parent: String(form.get('genre_new_parent') ?? '').trim().normalize('NFC') || null }
}
