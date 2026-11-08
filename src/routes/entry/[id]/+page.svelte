<script lang="ts">let { data } = $props(); let entry = $derived(data.entry)</script>
<svelte:head><title>Evidence #{entry.id} · 珍字集覽</title></svelte:head>
<p><a href="/">← All evidence</a></p>
{#if data.isModerator}
  <div class="moderation-bar">
    <span>Moderator view</span>
    <form method="POST" action="/moderate/{entry.id}/hide">
      <button type="submit">Hide entry</button>
    </form>
  </div>
{/if}
<h1>{entry.ids || entry.script}</h1>
<dl>
  <dt>Script</dt><dd>{entry.script}</dd>
  {#if entry.ids}<dt>IDS</dt><dd>{entry.ids}</dd>{/if}
  {#if entry.description}<dt>Description</dt><dd>{entry.description}</dd>{/if}
  <dt>Place seen</dt><dd>{entry.place}</dd>
  {#if entry.url}<dt>Source URL</dt><dd><a href={entry.url} rel="nofollow noreferrer">{entry.url}</a></dd>{/if}
  {#if entry.title}<dt>Title</dt><dd>{entry.title}</dd>{/if}
  {#if entry.author}<dt>Author</dt><dd>{entry.author}</dd>{/if}
  {#if entry.publisher}<dt>Publisher</dt><dd>{entry.publisher}</dd>{/if}
  {#if entry.year}<dt>Year</dt><dd>{entry.year}</dd>{/if}
  {#if entry.page}<dt>Page</dt><dd>{entry.page}</dd>{/if}
  {#if entry.note}<dt>Notes</dt><dd>{entry.note}</dd>{/if}
  <dt>Added</dt><dd>{entry.created_at}</dd>
</dl>
{#if data.comparisons.length}
  <section aria-labelledby="comparisons-heading">
    <h2 id="comparisons-heading">Related characters</h2>
    {#each data.comparisons as comparison}
      <div class="panel">
        <h3>{comparison.character}</h3>
        <dl>
          <dt>Relationship</dt><dd>{comparison.relationship === 'not_variant' ? 'Not a variant' : comparison.relationship === 'variant' ? 'Variant' : comparison.relationship === 'similar' ? 'Similar' : 'Uncertain'}</dd>
          {#if comparison.differences}<dt>Differences</dt><dd>{comparison.differences}</dd>{/if}
          {#if comparison.evidence}<dt>Evidence</dt><dd>{comparison.evidence}</dd>{/if}
        </dl>
      </div>
    {/each}
  </section>
{/if}
