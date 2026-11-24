<script lang="ts">
  import type { DateReading } from '$lib/dates'
  import { eraRead } from '$lib/t'
  let { text, reading, linked = true }: { text: string | null; reading?: DateReading | null; linked?: boolean } = $props()
  const years = $derived(eraRead(text ?? '', reading))
</script>

{#snippet bounds(date: DateReading)}HuTime · {date.start}{#if date.end !== date.start}{' – '}{date.end}{/if}{/snippet}
{text ?? ''}{#if years}{' ('}{years}{')'}{/if}{#if reading?.query}{' ('}{#if linked}<a class="text-link" href={reading.query} rel="noreferrer">{@render bounds(reading)}</a>{:else}{@render bounds(reading)}{/if}{')'}{/if}
