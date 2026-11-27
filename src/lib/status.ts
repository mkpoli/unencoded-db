import type { Claim } from '$lib/claims'
import { codedRecord } from '$lib/code'
import { encodedCharacter } from '$lib/related'
import type { Status } from '$lib/scripts'

// What a record is follows from its claims; nobody sets it. The first rule that matches decides, and a
// record that no rule matches has no status. A relation to another record (R+0022) compares two records
// and says nothing of an encoded character.
export function statusOf(claims: readonly Claim[]): Status | null {
  const related = (relationships: readonly unknown[], encoded: boolean) =>
    claims.some(claim => claim.kind === 'relation' && relationships.includes(claim.data?.relationship) && codedRecord(claim.value) === null && (!encoded || encodedCharacter(claim.value)))
  if (claims.some(claim => claim.kind === 'encoding' && claim.data?.charset === 'unicode')) return 'encoded'
  if (related(['unifiable'], false)) return 'unifiable'
  if (related(['homograph'], true)) return 'homograph'
  if (related(['variant', 'erroneous'], true)) return 'variant'
  return null
}
