// What the search box offers for a text being typed, from the tables in the browser: the other ways the
// text is written (a character as each description it has, a description as its other spellings and as the
// structures one part away, parts as the characters they make) and the encoded characters near it, each
// with its description. Nothing here asks the server; the records come from `/api/records`.
import { isDescription, similarStructures } from 'ids-input'
import type { Descriptions } from './character-tables'
import { cleanIds } from './ids'
import { equivalentSpellings, isParts, partSpellings } from './ids-variants'

export const SPELLINGS_SHOWN = 6
export const CHARACTERS_SHOWN = 8

export type Written = { text: string; kind: 'description' | 'spelling' | 'similar' }
export type Suggested = {
  /** The other spellings the search is made under, as the browse page sends them. */
  also: string[]
  written: Written[]
  characters: { char: string; ids: string | null }[]
}

/** The descriptions a table gives a character that a search can be made with, the first one first: one with
 * a component the table names by number alone ({24}) is left out. */
export const descriptionsOf = (char: string, table: Pick<Descriptions, 'all'>) => (table.all.get(char) ?? []).filter(description => !/[{#&]/.test(description) && isDescription(description))

/** `near` answers the encoded characters whose descriptions are near a text, nearest first. `variants` are
 * the characters named as variants of a lone character typed, which are listed with it. */
export async function suggest(text: string, table: Descriptions, near: (ids: string) => Promise<readonly { char: string; ids: string }[]>, variants: readonly string[] = []): Promise<Suggested> {
  const typed = cleanIds(text.trim())
  const described = (char: string) => table.described.get(char) ?? null
  if (!typed) return { also: [], written: [], characters: [] }
  if ([...typed].length === 1) {
    const written = descriptionsOf(typed, table).slice(0, SPELLINGS_SHOWN).map(description => ({ text: description, kind: 'description' as const }))
    return { also: isParts(typed) ? partSpellings(typed, table).slice(1) : [], written, characters: variants.slice(0, CHARACTERS_SHOWN).map(char => ({ char, ids: described(char) })) }
  }
  const whole = isDescription(typed)
  // A structure left open and a word are searched as typed.
  if (!whole && !isParts(typed)) return { also: [], written: [], characters: [] }
  const spellings = (whole ? equivalentSpellings(typed, table) : partSpellings(typed, table)).slice(1)
  const characters = (await near(typed)).slice(0, CHARACTERS_SHOWN).map(hit => ({ char: hit.char, ids: hit.ids }))
  // The spellings listed are of the very same form; a part swapped for one IWDS counts with it is searched and not listed.
  const same = whole ? equivalentSpellings(typed, table, undefined, false).slice(1) : spellings
  const written: Written[] = same.slice(0, SPELLINGS_SHOWN).map(spelling => ({ text: spelling, kind: 'spelling' }))
  if (whole) for (const similar of similarStructures(typed)) written.push({ text: similar, kind: 'similar' })
  return { also: spellings, written, characters }
}
