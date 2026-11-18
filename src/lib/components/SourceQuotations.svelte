<script lang="ts">
  import { quotations } from '$lib/quotations'
  let { quotes, url }: { quotes: string | null; url?: string | null } = $props()
</script>

{#each quotations(quotes) as quote}
  <figure>
    {#if quote.locator}<figcaption>{quote.locator}</figcaption>{/if}
    <blockquote cite={url ?? undefined}>{quote.text}</blockquote>
  </figure>
{/each}

<style>
  figure { margin: 0; min-width: 0 }
  figcaption { color: var(--muted); font-size: 0.875em }
  blockquote { margin: 4px 0; padding-inline-start: 10px; border-inline-start: 2px solid var(--line-strong); white-space: pre-wrap; overflow-wrap: anywhere }
</style>
