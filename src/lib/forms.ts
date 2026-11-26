// The form a description names, as a key: records under one key may be one record. Radical code points count
// as their ideographs and each part as its IWDS group. Parts stay as written out: ⿱好看 and ⿱⿰女子看 are two keys.
import { valuesOf, type Claim } from './claims'
import { isPlaceholder, prepare } from './similar'

const AS_WRITTEN = { described: new Map<string, string>() }

/** The key of a description, or null for a text that is no description or has an unknown part. */
export function formOf(ids: string): string | null {
  const read = prepare(ids, AS_WRITTEN)
  return read && !read.leaves.some(isPlaceholder) ? read.grouped : null
}

/** The keys of every description a record states. */
export const formsOf = (claims: readonly Claim[]) => [...new Set(valuesOf(claims, 'ids').flatMap(ids => formOf(ids) ?? []))]
