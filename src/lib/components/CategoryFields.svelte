<script lang="ts">
  // The categories, collections and tags a record is filed under. The markers save an emptied choice.
  import { CLAIM_LIMITS } from '$lib/claims'
  import { COLLECTIONS, groupGenres, type Genre } from '$lib/genres'
  import { t } from '$lib/t'
  import CheckPill from './CheckPill.svelte'

  let { genres = [], collections = [], tags = [] }: { genres?: string[]; collections?: string[]; tags?: string[] } = $props()
  const { standalone, groups } = groupGenres()
  const uid = $props.id()
</script>

{#snippet genre(item: Genre, parent = false)}<CheckPill name="genre" value={item.slug} label={item.label} checked={genres.includes(item.slug)} strong={parent} />{/snippet}

<fieldset class="group">
  <legend class="label">{t('field.genre')}</legend>
  <input type="hidden" name="genres_present" value="1" />
  <div class="pills">{#each standalone as item (item.slug)}{@render genre(item)}{/each}</div>
  {#each groups as group (group.parent.slug)}
    <div class="genre-group">
      {@render genre(group.parent, true)}
      <div class="pills">{#each group.children as item (item.slug)}{@render genre(item)}{/each}</div>
    </div>
  {/each}
</fieldset>
<fieldset class="group">
  <legend class="label">{t('field.collection')}</legend>
  <input type="hidden" name="collections_present" value="1" />
  <div class="pills">{#each COLLECTIONS as item (item.slug)}<CheckPill name="collection" value={item.slug} label={item.label} checked={collections.includes(item.slug)} />{/each}</div>
</fieldset>
<div class="field">
  <label for="{uid}-tags">{t('field.tags')}</label>
  <input id="{uid}-tags" class="input" name="tags" value={tags.join(', ')} maxlength={CLAIM_LIMITS.tag.max * (CLAIM_LIMITS.tag.length + 2)} autocomplete="off" />
</div>

<style>
  .group { min-width: 0; margin: 0; padding: 0; border: 0 }
  .group legend { padding: 0; margin-bottom: 8px }
  .pills { display: flex; flex-wrap: wrap; gap: 8px }
  .genre-group > :global(.pill) { margin-bottom: 10px }
  .genre-group { margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--line) }
</style>
