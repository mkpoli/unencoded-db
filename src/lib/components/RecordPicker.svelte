<script lang="ts" module>
  export type PickedRecord = { id: number; ids: string | null; layout: string | null; cover_key: string | null }
</script>

<script lang="ts">
  // A field for naming another record: its number, code or address, or anything the browse search finds it
  // by, such as its description or a reading. The records found are listed with their drawing to choose
  // from, and the one chosen is sent as its code. Until scripts run it is a plain field.
  import Combobox from './Combobox.svelte'
  import IdsGlyph from './IdsGlyph.svelte'
  import { recordCode } from '$lib/code'
  import { media } from '$lib/t'

  let { id, name, value = '', exclude, placeholder, label }: { id: string; name: string; value?: string; exclude: number; placeholder: string; label: string } = $props()
  // The field starts from what the page was given and is the reader's from then on.
  // svelte-ignore state_referenced_locally
  let typed = $state(value)
  let found = $state<PickedRecord[]>([])
  let timer: ReturnType<typeof setTimeout> | undefined
  let asking: AbortController | undefined

  const options = $derived(found.map(record => ({ key: String(record.id), label: recordCode(record.id), hint: record.ids ?? '' })))
  const byKey = $derived(new Map(found.map(record => [String(record.id), record])))

  function query(text: string) {
    clearTimeout(timer)
    asking?.abort()
    const wanted = text.trim()
    if (!wanted) { found = []; return }
    timer = setTimeout(async () => {
      const controller = new AbortController()
      asking = controller
      const answer = await fetch(`/api/records?q=${encodeURIComponent(wanted)}&exclude=${exclude}`, { signal: controller.signal }).then(response => response.ok ? response.json() : null).catch(() => null)
      if (asking === controller && Array.isArray(answer)) found = answer
    }, 200)
  }
</script>

<div class="picker">
<span class="sr-only" id="{id}-label">{label}</span>
<Combobox {id} {name} bind:value={typed} {options} {placeholder} labelledby="{id}-label" filter={false} maxlength={200} onquery={query} onopen={() => query(typed)}>
  {#snippet optionContent(option)}
    {@const record = byKey.get(option.key ?? '')}
    <span class="plate" aria-hidden="true">
      {#if record?.ids}<IdsGlyph ids={record.ids} layout={record.layout} />
      {:else if record?.cover_key}<img src={media(record.cover_key)} alt="" loading="lazy" decoding="async" />{/if}
    </span>
    <span class="code">{option.label}</span>
    {#if option.hint}<span class="ids">{option.hint}</span>{/if}
  {/snippet}
</Combobox>
</div>

<style>
  .picker { flex: 1 1 0; min-width: 0 }
  .plate { display: grid; flex: none; grid-template: 100% / 100%; place-items: center; align-self: center; width: 36px; height: 36px; overflow: hidden; border-radius: 5px; background: var(--surface-tile); color: var(--ink) }
  .plate img { width: 100%; height: 100%; object-fit: contain }
  .code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-variant-numeric: tabular-nums }
  .ids { min-width: 0; overflow: hidden; color: var(--muted); text-overflow: ellipsis; white-space: nowrap }
</style>
