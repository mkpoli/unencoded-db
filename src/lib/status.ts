import type { Claim } from '$lib/claims'
import { encodedCharacter } from '$lib/related'
import type { Status } from '$lib/scripts'

// What a record is follows from its claims; nobody sets it. The first rule that matches decides.
export function statusOf(claims: readonly Claim[]): Status {
  const related = (relationships: readonly unknown[], encoded: boolean) =>
    claims.some(claim => claim.kind === 'relation' && relationships.includes(claim.data?.relationship) && (!encoded || encodedCharacter(claim.value)))
  if (claims.some(claim => claim.kind === 'encoding' && claim.data?.charset === 'unicode')) return 'encoded'
  if (related(['unifiable'], false)) return 'unifiable'
  if (related(['homograph'], true)) return 'homograph'
  if (related(['variant', 'erroneous'], true)) return 'variant'
  return 'unchecked'
}
