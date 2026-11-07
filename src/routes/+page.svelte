<script lang="ts">let { data } = $props()</script>
<svelte:head><title>珍字集覽</title></svelte:head>
<h1>珍字集覽</h1>
<p>A community evidence wiki for characters and glyphs.</p>
{#if data.entries.length}
  <div class="grid">
    {#each data.entries as entry}
      <a class="card" href="/entry/{entry.id}">
        <strong>{entry.ids || entry.script}</strong><br />{entry.place}
      </a>
    {/each}
  </div>
  {#if data.next}<p><a href="/?before={data.next}">Older records →</a></p>{/if}
{:else}
  <p>No evidence records yet. <a href="/new">Add the first record</a>.</p>
{/if}
