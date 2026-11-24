// The orders a list can be read in. Each is one range of an index on `entry_tags`.
export const ORDERS = ['most', 'fewest', 'new', 'old', 'earliest', 'latest', 'random'] as const
export type Order = (typeof ORDERS)[number]
export const ORDER: Order = 'most'
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
// The records one page of a list holds, and the sizes a reader can choose in ?per=. Each size has many divisors,
// so the grid's rows fill, and stays under the candidates one read of a search tests. A tile reads one stored drawing.
export const PAGE = 48
export const PAGE_SIZES = [24, 48, 72, 96, 144, 192] as const
export const pageSizeOf = (value: string | null | undefined) => !value ? PAGE : (PAGE_SIZES as readonly number[]).includes(Number(value)) && String(Number(value)) === value && Number(value) !== PAGE ? Number(value) : null
// The page numbers a pager offers: the first, the last and those beside the open ones, with null where numbers are left out.
export function pageSteps(from: number, to: number, last: number, beside = 2): (number | null)[] {
  const steps: (number | null)[] = []
  for (let number = 1; number <= last; number++) {
    if (number === 1 || number === last || (number >= from - beside && number <= to + beside)) steps.push(number)
    else if (steps.at(-1) !== null) steps.push(null)
  }
  // A gap of one number shows the number.
  return steps.map((step, index) => step === null && steps[index + 1] === steps[index - 1]! + 2 ? steps[index - 1]! + 1 : step)
}
