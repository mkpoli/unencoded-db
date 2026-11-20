<script lang="ts">
  // What a relation names: a character, the characters its Unicode codes name, a description, or one of
  // the records here by its code. A record is linked, and drawn when the page read it (`tile`).
  import { codedRecord, recordCode } from '$lib/code'
  import { codePointCharacters } from '$lib/ids'
  import { href, media } from '$lib/t'
  import type { Tile } from '$lib/server/entries'
  import IdsGlyph from './IdsGlyph.svelte'

  let { value, compact = false, tile = null }: { value: string; compact?: boolean; tile?: Tile | null } = $props()
  const characters = $derived(codePointCharacters(value))
  const record = $derived(codedRecord(value))
</script>

{#if record && compact}
  <span class="record-code">{recordCode(record)}</span>
{:else if record}
  <a class="value record" href={href(`/entry/${record}`)}>
    {#if tile?.ids}<span class="plate"><IdsGlyph ids={tile.ids} layout={tile.layout} /></span>
    {:else if tile?.cover_key}<span class="plate"><img src={media(tile.cover_key)} alt="" loading="lazy" decoding="async" /></span>{/if}
    <span class="code">{recordCode(record)}</span>
  </a>
{:else if characters}
  <span class="value" class:compact>
    <span class="character">{characters}</span>
    {#if !compact}<span class="code">{value}</span>{/if}
  </span>
{:else}
  {value}
{/if}

<style>
  .value { display: inline-flex; flex-direction: column; align-items: center; gap: 1px; line-height: 1.2 }
  .value.compact { flex-direction: row; align-items: baseline }
  .code { color: var(--muted); font-size: 11px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-variant-numeric: tabular-nums; white-space: nowrap }
  .record { gap: 4px }
  .record:hover .code { color: var(--accent) }
  .plate { display: grid; place-items: center; width: 48px; height: 48px; overflow: hidden; border-radius: 6px; background: var(--surface-tile); color: var(--ink) }
  .plate img { width: 100%; height: 100%; object-fit: contain }
  .record-code { font-size: 12px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-variant-numeric: tabular-nums }
</style>
