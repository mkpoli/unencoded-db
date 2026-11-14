// The tables ids-input looks parts up in come with its tools. Until they do, a field's editor asks an
// adapter that waits for them, so that nothing it asks is answered from an empty table and remembered.
import type { IdsAdapter } from 'ids-input/svelte'

let hand!: (adapter: IdsAdapter) => void
const tables = new Promise<IdsAdapter>(resolve => { hand = resolve })

/** The tools have loaded: every question a field has asked so far is answered from `adapter`. */
export const provideTables = (adapter: IdsAdapter) => hand(adapter)
export const awaitedTables: IdsAdapter = { structure: char => tables.then(adapter => adapter.structure(char)) }
