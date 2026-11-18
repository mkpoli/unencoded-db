// The rows of a character's meanings, readings and relations, kept together because a row of one names
// rows of another: a reading holds under the meanings ticked beside it, a related character under
// meanings and readings, and every row rests on the evidence ticked beside it.
//
// Each row carries its claim's key, which a new row is given here, so that the rows of one form can name
// each other before any of them is saved. A row's choices are sent as `under.<key>` and `sightings.<key>`.
// The `…_present` markers save an emptied list.
import { untrack } from 'svelte'
import { CLAIM_LIMITS, claimsOf, newClaimKey, type Claim } from './claims'
import type { CharacterFacts } from './character-tables'
import { doculectName } from './claim-label'
import { OTHER_DOCULECT, isDoculect } from './doculects'
import type { Choice } from './components/ChoiceGroup.svelte'

type Links = { key: string; evidence: string[]; under: string[] }
export type Meaning = Links & { value: string }
export type Reading = Links & { value: string; doculect: string; other: string }
export type Relation = Links & { character: string; relationship: string; difference: string; note: string }

export type SenseDraft = ReturnType<typeof createSenseDraft>

export function createSenseDraft({ claims = [], evidence = [] }: { claims?: Claim[]; evidence?: Choice[] }) {
  // A sighting the page does not offer, hidden since it was chosen, stays a choice of the row that names it.
  const offered = new Map(evidence.map(option => [option.value, option.token]))
  const unlisted = [...new Set(claims.flatMap(claim => claim.sightings))]
    .filter(id => !offered.has(String(id)))
    .map((id): Choice => ({ token: String(id), value: String(id), label: `#${id}` }))
  const links = (claim: Claim): Links => ({ key: claim.key, evidence: claim.sightings.map(id => offered.get(String(id)) ?? String(id)), under: [...claim.under] })
  const fresh = (under: string[] = []): Links => ({ key: newClaimKey(), evidence: [], under })
  const stated = (doculect: unknown) => typeof doculect !== 'string' || !doculect ? { doculect: '', other: '' } : isDoculect(doculect) ? { doculect, other: '' } : { doculect: OTHER_DOCULECT, other: doculect }

  // The row a list opens with has no key until the page runs here, where the server's row and this one
  // are the same row.
  const blank = (): Links => ({ key: '', evidence: [], under: [] })
  let meanings = $state<Meaning[]>(untrack(() => { const found = claimsOf(claims, 'meaning').map(claim => ({ ...links(claim), value: claim.value })); return found.length ? found : [{ ...blank(), value: '' }] }))
  let readings = $state<Reading[]>(untrack(() => { const found = claimsOf(claims, 'reading').map(claim => ({ ...links(claim), value: claim.value, ...stated(claim.data?.doculect) })); return found.length ? found : [{ ...blank(), value: '', doculect: '', other: '' }] }))
  let relations = $state<Relation[]>(untrack(() => claimsOf(claims, 'relation').map(claim => ({ ...links(claim), character: claim.value, relationship: String(claim.data?.relationship ?? 'uncertain'), difference: String(claim.data?.difference ?? ''), note: String(claim.data?.evidence ?? '') }))))

  const meaningChoices = $derived(meanings.filter(row => row.key && row.value.trim()).map((row): Choice => ({ token: row.key, value: row.key, label: row.value.trim() })))
  const readingChoices = $derived(readings.filter(row => row.key && row.value.trim()).map((row): Choice => {
    const doculect = row.doculect === OTHER_DOCULECT ? row.other.trim() : row.doculect
    return { token: row.key, value: row.key, label: doculect ? `${doculectName(doculect)} ${row.value.trim()}` : row.value.trim() }
  }))

  function start() {
    for (const row of [...meanings, ...readings, ...relations]) row.key ||= newClaimKey()
  }
  function addMeaning() { const row = { ...fresh(), value: '' }; meanings.push(row); return row }
  function addReading(under: string[] = []) { const row = { ...fresh(under), value: '', doculect: '', other: '' }; readings.push(row); return row }
  function addRelation(under: string[] = []) { const row = { ...fresh(under), character: '', relationship: 'uncertain', difference: '', note: '' }; relations.push(row); return row }

  function applyFill(facts: CharacterFacts) {
    untrack(() => {
      if (facts.readings.length && !readings.some(row => row.value.trim())) readings = facts.readings.slice(0, CLAIM_LIMITS.reading.max).map(item => ({ ...fresh(), value: item.value.slice(0, CLAIM_LIMITS.reading.length), ...stated(item.doculect) }))
      if (facts.meaning && !meanings.some(row => row.value.trim())) meanings = [{ ...fresh(), value: facts.meaning.slice(0, CLAIM_LIMITS.meaning.length) }]
      for (const { character, field } of facts.variants) {
        if (relations.length >= CLAIM_LIMITS.relation.max || relations.some(row => row.character === character)) continue
        relations.push({ ...fresh(), character, relationship: 'variant', difference: '', note: `Unihan ${field}` })
      }
    })
  }

  return {
    get meanings() { return meanings },
    get readings() { return readings },
    get relations() { return relations },
    get meaningChoices() { return meaningChoices },
    get readingChoices() { return readingChoices },
    get unlisted() { return unlisted },
    start,
    addMeaning,
    addReading,
    addRelation,
    applyFill,
  }
}
