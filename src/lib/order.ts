// The orders a list can be read in. Each is one range of an index on `entry_tags`.
export const ORDERS = ['new', 'old', 'most', 'fewest', 'random'] as const
export type Order = (typeof ORDERS)[number]
export const ORDER: Order = 'new'
export const orderOf = (value: string | null | undefined): Order | null => !value ? ORDER : (ORDERS as readonly string[]).includes(value) ? value as Order : null
// The orders offered beside one another; the shuffled one has its own button.
export const SORTS = ORDERS.filter(order => order !== 'random')
// A shuffled list starts at a rank of 0 to 2^32 − 1, named in ?seed=.
export const SEEDS = 2 ** 32
// The orders of the source gallery: newest added, most records cited, and by year either way.
export const SOURCE_SORTS = ['new', 'most', 'earliest', 'latest'] as const
export type SourceSort = (typeof SOURCE_SORTS)[number]
export const sourceSortOf = (value: string | null | undefined): SourceSort | null => !value ? 'new' : (SOURCE_SORTS as readonly string[]).includes(value) ? value as SourceSort : null
export const seedOf = (value: string | null | undefined) => value && /^(0|[1-9]\d{0,9})$/.test(value) && Number(value) < SEEDS ? Number(value) : null
