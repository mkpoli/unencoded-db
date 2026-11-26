<script lang="ts">
  // The descriptions of a character. The first draws the glyph: it is typed in ids-input's sequence field
  // or built from parts with the tools that open under it, and `primary` follows it. `chosen` is the part
  // of it those tools are working on. Further descriptions of the same character are rows
  // under it, offered once the first is whole. Each is sent as an `ids` value of its own.
  //
  // While the first is whole, the field lists the records and encoded characters it may duplicate, in three
  // tiers (see $lib/similar). Before it is whole, two or more parts list the records and characters that hold
  // them all, and taking a character writes its description into the field. A lone encoded character, or one the description matches, is the person's to
  // place: the form describes that character and `onfill` receives what is known of it, or it describes a
  // different character of the same form and `onfill` receives the form alone.
  import { onMount, tick, untrack } from 'svelte'
  import { isDescription } from 'ids-input'
  import { cleanIds, codePoints, IDS_MAX, splitIds } from '$lib/ids'
  import { idsMessages } from '$lib/ids-messages'
  import { characterFacts, fillOf, type CharacterFacts, type Fill } from '$lib/encoded'
  import { encodedCandidates, expandedParts, TIERS, tierRecords, type Found, type RecordCandidate } from '$lib/candidates'
  import { href, locale, media, t } from '$lib/t'
  import { recordCode } from '$lib/code'
  import { LOOSE_MIN, MADE_OF } from '$lib/similar'
  import { browser } from '$app/environment'
  import type { IdsAdapter, IdsEditor } from 'ids-input/svelte'
  import IdsGlyph from './IdsGlyph.svelte'
  import IdsLine from './IdsLine.svelte'

  let { values = [], primary = $bindable(''), chosen = $bindable(null), exclude = null, placed, anchor, onfill }: {
    values?: string[]; primary?: string; chosen?: number[] | null; exclude?: number | null; placed?: (id: number) => string; anchor?: string; onfill?: (fill: Fill) => void
  } = $props()

  // `placed` answers where the evidence at hand goes to a record that describes it already; without it, evidence is added there.
  const evidenceHref = (id: number) => placed?.(id) ?? href(`/entry/${id}/sighting/new`)
  const evidenceTab = $derived(placed ? undefined : '_blank')

  const uid = $props.id()
  let next = 0
  const row = (value = '') => ({ key: next++, value })
  let first = $state(untrack(() => values[0] ?? ''))
  // A lone character the form opened with was already placed.
  const opened = untrack(() => cleanIds(values[0] ?? ''))
  let rest = $state(untrack(() => values.slice(1).map(row)))
  const sequence = $derived(cleanIds(first))
  const whole = $derived(isDescription(sequence))
  // Parts typed with no whole structure yet: enough of them are compared too.
  const loose = $derived(!whole && [...sequence].filter(char => !/[\u2FF0-\u2FFF\u31EF]/u.test(char)).length >= LOOSE_MIN)
  $effect.pre(() => { primary = sequence })

  let main = $state<IdsLine>()
  export const focus = () => main?.focus()
  const lines: Record<number, IdsLine | null> = {}
  let hydrated = $state(false)
  onMount(() => { hydrated = true })

  // A pasted list of descriptions is taken apart: the first stays, the others become rows.
  $effect(() => {
    if (!/[,，、]/u.test(first)) return
    const pasted = splitIds(first)
    if (pasted.length < 2 || !pasted.every(isDescription)) return
    untrack(() => {
      const held = new Set(rest.map(item => cleanIds(item.value)))
      first = pasted[0]
      rest.push(...pasted.slice(1).filter(item => !held.has(item)).slice(0, Math.max(0, IDS_MAX - 1 - rest.length)).map(row))
    })
  })

  async function add() {
    const added = row()
    rest.push(added)
    await tick()
    lines[added.key]?.focus()
  }
  /** Adds a description as a row under the first, empty when none is given, and focuses it. One already held is focused instead. */
  export async function append(value = '') {
    const text = cleanIds(value)
    if (text && cleanIds(first) === text) { main?.focus(); return }
    let target = text ? rest.find(item => cleanIds(item.value) === text) : undefined
    if (!target) {
      if (rest.length >= IDS_MAX - 1) return
      target = row(text)
      rest.push(target)
    }
    await tick()
    lines[target.key]?.focus()
  }
  async function remove(key: number) {
    const at = rest.findIndex(item => item.key === key)
    rest.splice(at, 1)
    await tick()
    ;(at > 0 ? lines[rest[at - 1].key] : main)?.focus()
  }

  // The tools work on the editor of the first field. They are fetched when first opened, and hand that
  // editor the tables it looks parts up in.
  let editor = $state.raw<IdsEditor | null>(null)
  let tools = $state.raw<{ Builder: typeof import('./IdsBuilder.svelte').default; adapter: IdsAdapter; messages: Record<string, string> | undefined } | null>(null)
  let building = $state(false)
  let root = $state<HTMLElement | null>(null)
  async function build() {
    building = !building
    if (!building || tools) return
    const [found, messages] = await Promise.all([import('./IdsBuilder.svelte'), idsMessages(locale())])
    tools = { Builder: found.default, adapter: found.adapter, messages }
  }
  $effect.pre(() => { chosen = building ? editor?.chosen ?? null : null })

  let recordHits = $state.raw<Found[]>([])
  let encodedHits = $state.raw<Found[]>([])
  // Records before characters, each kind already kept to its best few, nearest first.
  const tiers = $derived(TIERS.map(tier => ({ tier, items: [...recordHits, ...encodedHits].filter(item => item.tier === tier) })).filter(group => group.items.length))

  // The details of a character the description matches are filled only when asked for.
  // Before the description is whole, the one listed with the character is written into the field, unless
  // the field has changed meanwhile.
  async function fill(char: string, homograph: boolean, ids: string) {
    const typed = sequence
    const facts = await characterFacts(char).catch(() => null)
    if (!facts || sequence !== typed) return
    if (!whole) first = ids
    onfill?.(fillOf(facts, homograph))
  }

  // A lone encoded character waiting for its choice, with the records that already carry its code.
  let lone = $state.raw<{ facts: CharacterFacts; records: { id: number }[] } | null>(null)
  function take(facts: CharacterFacts, homograph: boolean) {
    if (facts.ids) first = facts.ids
    onfill?.(fillOf(facts, homograph))
  }

  $effect(() => {
    const ids = sequence
    recordHits = []; encodedHits = []; lone = null
    if (!browser || !ids) return
    let live = true
    // A lone character is an encoded one to describe, unless it is the first part put down with the tools.
    if ([...ids].length === 1) {
      if (building || ids === opened) return
      const controller = new AbortController()
      const timer = setTimeout(async () => {
        const facts = await characterFacts(ids).catch(() => null)
        if (!live || !facts) return
        if (!onfill) { if (facts.ids) first = facts.ids; return }
        const answer = await fetch(`/api/match?code=${encodeURIComponent(facts.code)}`, { signal: controller.signal }).then(r => r.ok ? r.json() : []).catch(() => [])
        const records = (Array.isArray(answer) ? answer : []).filter((item): item is { id: number } => typeof item?.id === 'number' && item.id !== exclude)
        if (live) lone = { facts, records }
      }, 500)
      return () => { live = false; clearTimeout(timer); controller.abort() }
    }
    if (!whole && !loose) return
    const controller = new AbortController()
    // The records are read by the parts of the description, and again by the characters those parts make
    // (蒔 for 艹 and 時) once the encoded characters are known, since a record may be written with one.
    // What the second read finds is added to the first, and a read that fails leaves the list as it was.
    const held = new Map<number, RecordCandidate>()
    const records = async (made: string[] = []) => {
      const leaves = [...new Set([...made, ...await expandedParts(ids)])].slice(0, 12).join('')
      const answer = await fetch(`/api/candidates?ids=${encodeURIComponent(ids)}${leaves ? `&leaves=${encodeURIComponent(leaves)}` : ''}${made.length ? `&made=${encodeURIComponent(made.join(''))}` : ''}${exclude ? `&exclude=${exclude}` : ''}`, { signal: controller.signal }).then(r => r.ok ? r.json() : [])
      for (const item of Array.isArray(answer) ? answer : []) if (typeof item?.id === 'number') held.set(item.id, { ...held.get(item.id), ...(item as RecordCandidate) })
      const tiered = await tierRecords(ids, [...held.values()])
      if (live) recordHits = tiered
    }
    const timer = setTimeout(() => {
      const read = records().catch(() => {})
      encodedCandidates(ids).then(async found => {
        if (!live) return
        encodedHits = found
        const made = found.flatMap(hit => hit.source === 'encoded' && hit.score >= MADE_OF ? [hit.char] : []).slice(0, 4)
        if (made.length) { await read; await records(made) }
      }).catch(() => {})
    }, 350)
    return () => { live = false; clearTimeout(timer); controller.abort() }
  })
</script>

<div class="descriptions" id={anchor} bind:this={root}>
  <div class="main">
    <IdsLine bind:this={main} bind:value={first} label={t('field.ids')} titled adapter={tools?.adapter} oneditor={found => editor = found} />
    <button type="button" class="button build" aria-expanded={building} aria-controls="{uid}-tools" disabled={!hydrated} onclick={build}>{t('field.idsBuild')}<span class="chevron" aria-hidden="true">⌄</span></button>
  </div>
  <div class="tools" id="{uid}-tools" hidden={!building}>
    {#if building}
      {#if tools && editor}<tools.Builder {editor} scope={root} messages={tools.messages} locale={locale()} />{:else}<p class="muted">{t('field.idsLoading')}</p>{/if}
    {/if}
  </div>
  {#if lone}
    <div class="candidates" data-testid="encoded-choice">
      <section class="tier same">
        <h3>{t('status.encoded')}</h3>
        <div class="lone">
          <span class="plate char" lang="zh">{lone.facts.char}</span>
          <span class="body"><span class="line">{lone.facts.code}</span><span class="ids">{lone.facts.ids ?? ''}</span></span>
          <span class="choices">
            {#each lone.records as record (record.id)}
              <a class="button" href={evidenceHref(record.id)} target={evidenceTab}>{t(placed ? 'sighting.moveThere' : 'field.encodedSame')} · {recordCode(record.id)}</a>
            {:else}
              <button type="button" class="button" onclick={() => take(lone!.facts, false)}>{t('field.encodedSame')}</button>
            {/each}
            <button type="button" class="button" onclick={() => take(lone!.facts, true)}>{t('field.encodedHomograph')}</button>
          </span>
        </div>
      </section>
    </div>
  {/if}
  {#if (whole || loose) && tiers.length}
    <div class="candidates" data-testid="candidates">
      {#each tiers as group (group.tier)}
        <section class="tier {group.tier}">
          <h3>{t(`field.candidate.${group.tier}`)}</h3>
          <ul>
            {#each group.items as item (item.source === 'record' ? `r${item.record.id}` : `e${item.char}`)}
              <li>
                {#if item.source === 'record'}
                  <span class="plate">
                    {#if item.record.ids}<IdsGlyph ids={item.record.ids.split(' ')[0]} layout={item.record.layout} />
                    {:else if item.record.cover_key}<img src={media(item.record.cover_key)} alt="" loading="lazy" decoding="async" />{/if}
                  </span>
                  <span class="body">
                    <span class="line"><a class="text-link" href={href(`/entry/${item.record.id}`)} target="_blank">{recordCode(item.record.id)}</a>{#if group.tier !== 'similar'} <a class="text-link" href={evidenceHref(item.record.id)} target={evidenceTab}>{t(placed ? 'sighting.moveThere' : 'field.candidateAdd')}</a>{/if}{#if whole && group.tier !== 'same' && !placed} <a class="text-link" href={href(`/entry/${item.record.id}?ids_add=${encodeURIComponent(sequence)}#edit-ids`)} target="_blank">{t('field.candidateAddIds')}</a>{/if}</span>
                    <span class="ids">{item.record.ids ?? ''}</span>
                  </span>
                {:else}
                  <span class="plate char" lang="zh">{item.char}</span>
                  <span class="body">
                    <span class="line">{codePoints(item.char)}{#if onfill} <button type="button" class="text-button" onclick={() => fill(item.char, false, item.ids)}>{t('field.idsFill')}</button> <button type="button" class="text-button" onclick={() => fill(item.char, true, item.ids)}>{t('field.encodedHomograph')}</button>{/if}</span>
                    <span class="ids">{item.ids}</span>
                  </span>
                {/if}
              </li>
            {/each}
          </ul>
        </section>
      {/each}
    </div>
  {/if}
  {#if rest.length}
    <div class="more" role="group" aria-labelledby="{uid}-more">
      <span class="label" id="{uid}-more">{t('field.idsMore')}</span>
      {#each rest as item, index (item.key)}
        <div class="row-item">
          <IdsLine bind:this={lines[item.key]} bind:value={item.value} label={t('field.idsNth', { n: index + 2 })} compact />
          <button type="button" class="remove" aria-label={t('field.idsRemove', { n: index + 2 })} title={t('field.idsRemove', { n: index + 2 })} onclick={() => remove(item.key)}><span aria-hidden="true">×</span></button>
        </div>
      {/each}
    </div>
  {/if}
  {#if hydrated && whole && rest.length < IDS_MAX - 1}<div><button type="button" class="text-button" onclick={add}>+ {t('field.idsAdd')}</button></div>{/if}
</div>

<style>
  /* One grid for the first description and the rows under it, so their fields share an edge. */
  .descriptions { container: descriptions / inline-size; display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px 10px; min-width: 0 }
  .descriptions > *, .more > * { grid-column: 1 / -1 }
  .main, .more, .row-item { display: grid; grid-template-columns: subgrid; align-items: start; gap: 8px 10px; min-width: 0 }
  /* Level with the field under its label. */
  .build { min-height: 47px; margin-top: 27px }
  .candidates { display: grid; gap: 8px; font-size: 12.5px }
  .tier { padding: 6px 10px 8px; border: 1px solid var(--line); border-radius: 8px }
  .tier.same { border-color: var(--accent); background: var(--accent-light) }
  h3 { margin: 0 0 4px; font-size: 12px; font-weight: 600; color: var(--muted) }
  .tier.same h3 { color: var(--accent) }
  ul { display: flex; flex-wrap: wrap; gap: 6px 16px; margin: 0; padding: 0; list-style: none }
  li { display: flex; align-items: center; gap: 8px; min-width: 0 }
  .plate { display: grid; place-items: center; flex: none; width: 40px; height: 40px; overflow: hidden; border-radius: 5px; background: var(--surface-tile); color: var(--ink) }
  .plate img { width: 100%; height: 100%; object-fit: contain }
  .plate.char { font-size: 26px; line-height: 1 }
  .body { display: grid; min-width: 0 }
  .line { display: flex; flex-wrap: wrap; gap: 0 8px; align-items: center }
  .line .text-button { min-height: 24px; font-size: inherit }
  .ids { color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis }
  .lone { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; min-width: 0 }
  .choices { display: flex; flex-wrap: wrap; gap: 8px; margin-inline-start: auto }
  .more { margin-top: 4px }
  .remove { justify-self: start; width: 36px; height: 41px; padding: 0; border: 0; border-radius: 7px; background: none; color: var(--muted); font-size: 20px; line-height: 1; cursor: pointer }
  .remove:hover { color: var(--wrong) }
  .build[aria-expanded='true'] { border-color: var(--accent); background: var(--accent-light); color: var(--accent) }
  .chevron { display: inline-block; margin-inline-start: 6px; transition: transform 120ms ease }
  .build[aria-expanded='true'] .chevron { transform: rotate(180deg) }
  @media (prefers-reduced-motion: reduce) { .chevron { transition: none } }
  .tools { padding-top: 4px }
  .tools[hidden] { display: none }
  @container descriptions (inline-size < 23rem) {
    .main { grid-column: 1 / -1; grid-template-columns: minmax(0, 1fr) }
    .build { min-height: 40px; margin-top: 0; justify-self: start }
  }
</style>
