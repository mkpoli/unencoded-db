<script lang="ts">
  import { codePointCharacters } from '$lib/ids'
  let { value, compact = false }: { value: string; compact?: boolean } = $props()
  const characters = $derived(codePointCharacters(value))
</script>

{#if characters}
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
</style>
