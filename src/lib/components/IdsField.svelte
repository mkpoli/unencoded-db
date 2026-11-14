<script lang="ts">
  // The descriptions of a character. The first draws the glyph: it is typed in ids-input's sequence field
  // or built from parts with the tools that open under it, and `primary` follows it. `chosen` is the part
  // of it those tools are working on. Further descriptions of the same character are rows
  // under it, offered once the first is whole. Each is sent as an `ids` value of its own.
  //
  // While the first is whole, the field says whether an encoded character or another record has the same
  // description. A lone encoded character is replaced by its description, and `onfill` receives what is
  // known of it; for a description that matches a character, the person decides.
  import { onMount, tick, untrack } from 'svelte'
  import { isDescription } from 'ids-input'
  import { cleanIds, codePoints, IDS_MAX, splitIds } from '$lib/ids'
  import { idsMessages } from '$lib/ids-messages'
  import { characterFacts, encodedMatch, type CharacterFacts } from '$lib/encoded'
  import { href, locale, t } from '$lib/t'
  import { browser } from '$app/environment'
  import type { IdsAdapter, IdsEditor } from 'ids-input/svelte'
  import IdsLine from './IdsLine.svelte'

  let { values = [], primary = $bindable(''), chosen = $bindable(null), onfill }: {
    values?: string[]; primary?: string; chosen?: number[] | null; onfill?: (facts: CharacterFacts) => void
  } = $props()

  const uid = $props.id()
  let next = 0
  const row = (value = '') => ({ key: next++, value })
  let first = $state(untrack(() => values[0] ?? ''))
  let rest = $state(untrack(() => values.slice(1).map(row)))
  const sequence = $derived(cleanIds(first))
  const whole = $derived(isDescription(sequence))
  $effect.pre(() => { primary = sequence })

  let main = $state<IdsLine>()
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

  let encoded = $state<string | null>(null)
  let same = $state<{ id: number }[]>([])

  // The details of a character the description matches are filled only when asked for.
  async function fill(char: string) {
    const facts = await characterFacts(char).catch(() => null)
    if (facts) onfill?.(facts)
  }

  $effect(() => {
    const ids = sequence
    encoded = null; same = []
    if (!browser || !ids) return
    let live = true
    // A lone character is an encoded one to describe, unless it is the first part put down with the tools.
    if ([...ids].length === 1) {
      if (building) return
      const timer = setTimeout(async () => {
        const facts = await characterFacts(ids).catch(() => null)
        if (!live || !facts) return
        if (facts.ids) first = facts.ids
        onfill?.(facts)
      }, 500)
      return () => { live = false; clearTimeout(timer) }
    }
    const timer = setTimeout(async () => {
      const found = await encodedMatch(ids).catch(() => null)
      if (live) encoded = found
      const answer = await fetch(`/api/match?ids=${encodeURIComponent(ids)}`).then(r => r.ok ? r.json() : []).catch(() => [])
      if (live && Array.isArray(answer)) same = answer.filter((item): item is { id: number } => typeof item?.id === 'number')
    }, 350)
    return () => { live = false; clearTimeout(timer) }
  })
</script>

<div class="descriptions" bind:this={root}>
  <div class="main">
    <IdsLine bind:this={main} bind:value={first} label={t('field.ids')} titled adapter={tools?.adapter} oneditor={found => editor = found} />
    <button type="button" class="button build" aria-expanded={building} aria-controls="{uid}-tools" disabled={!hydrated} onclick={build}>{t('field.idsBuild')}<span class="chevron" aria-hidden="true">⌄</span></button>
  </div>
  <div class="tools" id="{uid}-tools" hidden={!building}>
    {#if building}
      {#if tools && editor}<tools.Builder {editor} scope={root} messages={tools.messages} locale={locale()} />{:else}<p class="muted">{t('field.idsLoading')}</p>{/if}
    {/if}
  </div>
  {#if encoded}<p class="found" data-testid="encoded-hint">{t('field.idsEncoded', { char: encoded, code: codePoints(encoded) })}{#if onfill} <button type="button" class="text-button" onclick={() => fill(encoded!)}>{t('field.idsFill')}</button>{/if}</p>{/if}
  {#if same.length}<p class="found">{t('field.idsSame')} <span>{#each same as record, i}{i ? ', ' : ''}<a class="text-link" href={href(`/entry/${record.id}`)} target="_blank">#{record.id}</a>{/each}</span></p>{/if}
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
  .descriptions { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px 10px; min-width: 0 }
  .descriptions > *, .more > * { grid-column: 1 / -1 }
  .main, .more, .row-item { display: grid; grid-template-columns: subgrid; align-items: start; gap: 8px 10px; min-width: 0 }
  /* Level with the field under its label. */
  .build { min-height: 47px; margin-top: 27px }
  .found { display: flex; flex-wrap: wrap; align-items: center; gap: 2px 10px; color: var(--muted); font-size: 12.5px }
  .found .text-button { min-height: 24px; font-size: inherit }
  .more { margin-top: 4px }
  .remove { justify-self: start; width: 36px; height: 41px; padding: 0; border: 0; border-radius: 7px; background: none; color: var(--muted); font-size: 20px; line-height: 1; cursor: pointer }
  .remove:hover { color: var(--wrong) }
  .build[aria-expanded='true'] { border-color: var(--accent); background: var(--accent-light); color: var(--accent) }
  .chevron { display: inline-block; margin-inline-start: 6px; transition: transform 120ms ease }
  .build[aria-expanded='true'] .chevron { transform: rotate(180deg) }
  @media (prefers-reduced-motion: reduce) { .chevron { transition: none } }
  .tools { padding-top: 4px }
  .tools[hidden] { display: none }
  @media (max-width: 700px) {
    .descriptions { grid-template-columns: minmax(0, 1fr) 36px }
    .main > :global(*) { grid-column: 1 / -1 }
    .build { min-height: 40px; margin-top: 0; justify-self: start }
  }
</style>
