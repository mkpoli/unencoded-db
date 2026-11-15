// The orders a list can be read in. Each is one range of an index on `entry_tags`.
export const ORDERS = ['new', 'old', 'most', 'fewest'] as const
export type Order = (typeof ORDERS)[number]
export const ORDER: Order = 'new'
export const orderOf = (value: string | null | undefined): Order | null => !value ? ORDER : (ORDERS as readonly string[]).includes(value) ? value as Order : null
