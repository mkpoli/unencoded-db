<script lang="ts">import { isSafeSourceUrl } from '$lib/source-url'; let { data } = $props(); let entry = $derived(data.entry)</script>
<svelte:head><title>Evidence #{entry.id} · 珍字集覽</title></svelte:head>
<p><a href="/">← All evidence</a></p>
<h1>{entry.ids || entry.script}</h1>
<p><a href="/entry/{entry.id}/edit">Revise evidence</a> · <a href="/entry/{entry.id}/history">Revision history</a></p>
<dl>
  <dt>Script</dt><dd>{entry.script}</dd>
  {#if entry.ids}<dt>IDS</dt><dd>{entry.ids}</dd>{/if}
  {#if entry.description}<dt>Description</dt><dd>{entry.description}</dd>{/if}
  <dt>Place seen</dt><dd>{entry.place}</dd>
  {#if entry.url}<dt>Source URL</dt><dd>{#if isSafeSourceUrl(entry.url)}<a href={entry.url} rel="nofollow noreferrer">{entry.url}</a>{:else}{entry.url}{/if}</dd>{/if}
  {#if entry.title}<dt>Title</dt><dd>{entry.title}</dd>{/if}
  {#if entry.author}<dt>Author</dt><dd>{entry.author}</dd>{/if}
  {#if entry.publisher}<dt>Publisher</dt><dd>{entry.publisher}</dd>{/if}
  {#if entry.year}<dt>Year</dt><dd>{entry.year}</dd>{/if}
  {#if entry.page}<dt>Page</dt><dd>{entry.page}</dd>{/if}
  {#if entry.note}<dt>Notes</dt><dd>{entry.note}</dd>{/if}
  <dt>Added</dt><dd>{entry.created_at}</dd>
</dl>
