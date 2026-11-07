<script lang="ts">import { isSafeSourceUrl } from '$lib/source-url'; let { data } = $props()</script>
<svelte:head><title>Revision history · 珍字集覽</title></svelte:head>
<p><a href="/entry/{data.id}">← Evidence</a></p>
<h1>Revision history</h1>
<div class="history-list">
{#each data.revisions as revision}
  <section class="panel">
    <h2>Revision {revision.revision}</h2>
    <p>{revision.recorded_at}</p>
    <dl>
      <dt>Script</dt><dd>{revision.script}</dd>
      {#if revision.ids}<dt>IDS</dt><dd>{revision.ids}</dd>{/if}
      {#if revision.description}<dt>Description</dt><dd>{revision.description}</dd>{/if}
      <dt>Place seen</dt><dd>{revision.place}</dd>
      <dt>Source URL</dt><dd>{#if isSafeSourceUrl(revision.url)}<a href={revision.url} rel="nofollow noreferrer">{revision.url}</a>{:else}{revision.url}{/if}</dd>
      {#if revision.title}<dt>Title</dt><dd>{revision.title}</dd>{/if}
      {#if revision.author}<dt>Author</dt><dd>{revision.author}</dd>{/if}
      {#if revision.publisher}<dt>Publisher</dt><dd>{revision.publisher}</dd>{/if}
      {#if revision.year}<dt>Year</dt><dd>{revision.year}</dd>{/if}
      {#if revision.page}<dt>Page</dt><dd>{revision.page}</dd>{/if}
      {#if revision.note}<dt>Notes</dt><dd>{revision.note}</dd>{/if}
    </dl>
  </section>
{/each}
</div>
{#if data.next}<p><a href="?before={data.next}">Older revisions →</a></p>{/if}
