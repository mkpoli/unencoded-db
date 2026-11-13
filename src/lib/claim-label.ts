import type { Claim } from './claims'
import { doculectKey } from './doculects'
import { t } from './t'

/** The name a doculect is shown by: a listed one in the reader's language, another as it was written. */
export const doculectName = (code: string) => { const key = doculectKey(code); return key ? t(key) : code }

/** A claim in a few words, for a link to it: a reading with its doculect, a related character with its relationship. */
export function claimLabel(claim: Claim) {
  if (claim.kind === 'reading' && typeof claim.data?.doculect === 'string' && claim.data.doculect) return `${doculectName(claim.data.doculect)} ${claim.value}`
  if (claim.kind === 'relation') return `${claim.value} · ${t(`relationship.${String(claim.data?.relationship)}`)}`
  return claim.value
}
