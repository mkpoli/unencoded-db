<script lang="ts">
  // The copies web archives keep of a source, one link each, named by the archive's host.
  import { t } from '$lib/t'
  import { archiveLinks } from '$lib/source-archives'

  let { archives, compact = false }: { archives: readonly string[]; compact?: boolean } = $props()
  const links = $derived(archiveLinks(archives))
</script>

{#if links.length}
  <p class="archived" class:compact><span class="muted">{t('source.archives')}</span>{#each links as archive (archive.href)}<a class="text-link" href={archive.href} title={archive.href} target="_blank" rel="noopener noreferrer ugc nofollow">{archive.label} ↗</a>{/each}</p>
{/if}

<style>
  .archived { display: flex; flex-wrap: wrap; gap: 4px 12px; margin: 0; overflow-wrap: anywhere }
  .compact { margin-top: 1px; font-size: 12.5px }
</style>
