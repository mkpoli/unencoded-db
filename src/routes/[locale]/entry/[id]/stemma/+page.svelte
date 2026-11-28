<script lang="ts">
  import Seo from '$lib/components/Seo.svelte'
  import StemmaGraph from '$lib/components/StemmaGraph.svelte'
  import { recordCode } from '$lib/code'
  import { href, t } from '$lib/t'
  let { data } = $props()
  const code = $derived(recordCode(data.id))
  const title = $derived(t('stemma.pageTitle', { id: code }))
  const witnessCount = $derived(data.graph.nodes.filter(node => node.kind === 'witness').length)
</script>

<Seo {title} description={data.entry.description ?? undefined} />

<div class="page stack stemma-page">
  <div class="top">
    <a class="text-link back" href={href(`/entry/${data.id}`)}>← {t('history.back')}</a>
    <div class="row head">
      <h1>{title}{#if data.entry.ids}<span class="ids muted">{data.entry.ids}</span>{/if}</h1>
      <div class="row badges">
        <span class="badge">{t('stemma.nodes', { count: witnessCount })}</span>
        <span class="badge">{t('stemma.edges', { count: data.graph.edges.length })}</span>
        {#if data.graph.unlinkedCount > 0}
          <span class="badge">{t('stemma.unlinked', { count: data.graph.unlinkedCount })}</span>
        {/if}
        {#if data.graph.truncated}
          <span class="badge" title={t('stemma.truncated', data.limits)}>{t('stemma.limit', data.limits)}</span>
        {/if}
      </div>
    </div>
  </div>

  {#if data.graph.edges.length}
    <section class="panel stack">
      <StemmaGraph graph={data.graph} mode="full" dates={data.dates} legend />
    </section>
  {:else}
    <section class="panel">
      <p class="muted">{t('stemma.empty')}</p>
    </section>
  {/if}
</div>

<style>
  .top { display: flex; flex-direction: column; gap: 8px }
  .back { align-self: start; color: var(--muted) }
  .head { justify-content: space-between; align-items: baseline }
  h1 { display: flex; flex-wrap: wrap; align-items: baseline; gap: 10px }
  .ids { font-weight: 400 }
  .badges { gap: 6px }
  .panel { padding: 20px; border: 1px solid var(--line); border-radius: 10px; background: var(--surface) }
  @media (max-width: 700px) { .panel { padding: 14px } }
  @media print {
    .back { display: none }
    .panel { border: 0; padding: 0 }
  }
</style>
