<script lang="ts">let { data } = $props()</script>
<svelte:head><title>Moderation · 珍字集覽</title></svelte:head>
<div class="page-heading">
  <h1>Hidden entries</h1>
  <p>Signed in as {data.moderator}. Hidden entries stay out of the public collection.</p>
</div>
{#if data.entries.length}
  <ul class="queue">
    {#each data.entries as entry}
      <li class="panel queue-item">
        <div class="queue-meta"><span>#{entry.id}</span><span>Added {entry.created_at}</span></div>
        <h2>{entry.script}</h2>
        {#if entry.description}<p class="queue-description">{entry.description}</p>{/if}
        <p class="queue-place">{entry.place}</p>
        <form method="POST" action="/moderate/{entry.id}/restore">
          <button type="submit">Restore</button>
        </form>
      </li>
    {/each}
  </ul>
  {#if data.next}<p><a href="/moderate?before={data.next}">Older hidden entries →</a></p>{/if}
{:else}
  <p class="notice">No hidden entries.</p>
{/if}
