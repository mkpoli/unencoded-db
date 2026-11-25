<script lang="ts">
  import { media } from '$lib/t'
  // One piece of evidence in short, where something is done with it.
  let { sighting }: { sighting: { place: string | null; title: string | null; author: string | null; page: string | null; report_date: string | null; original_date: string | null; picture: { thumb_key: string } | null } } = $props()
  const facts = $derived([sighting.author, sighting.original_date ?? sighting.report_date, sighting.page].filter(Boolean).join(' · '))
</script>

<div class="evidence">
  {#if sighting.picture}<img src={media(sighting.picture.thumb_key)} alt="" />{/if}
  <div class="text">
    {#if sighting.title || sighting.place}<strong>{sighting.title || sighting.place}</strong>{/if}
    {#if facts}<span class="muted">{facts}</span>{/if}
  </div>
</div>

<style>
  .evidence { display:flex; align-items:center; gap:16px; padding:16px; border:1px solid var(--line); border-radius:10px; background:var(--surface) }
  .evidence img { flex:none; width:96px; height:96px; object-fit:contain; border-radius:6px; background:var(--surface-tile) }
  .text { display:flex; flex-direction:column; gap:4px; min-width:0; overflow-wrap:anywhere }
</style>
