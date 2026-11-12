<script lang="ts">
  // The categories, collections and tags a record is filed under. The markers save an emptied choice.
  import { CLAIM_LIMITS } from '$lib/claims'
  import { COLLECTIONS, groupGenres, type Genre } from '$lib/genres'
  import { t } from '$lib/t'

  let { genres = [], collections = [], tags = [] }: { genres?: string[]; collections?: string[]; tags?: string[] } = $props()
  const { standalone, groups } = groupGenres()
  const uid = $props.id()
</script>

{#snippet pill(name: string, slug: string, label: string, checked: boolean, parent = false)}
  <label class="pill" class:parent>
    <input type="checkbox" {name} value={slug} {checked} />
    <span class="box" aria-hidden="true"><svg viewBox="0 0 12 12" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M1.8 6.4 4.6 9 10.2 2.8" /></svg></span>{label}
  </label>
{/snippet}

{#snippet genre(item: Genre, parent = false)}{@render pill('genre', item.slug, item.label, genres.includes(item.slug), parent)}{/snippet}

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
  <div class="pills">{#each COLLECTIONS as item (item.slug)}{@render pill('collection', item.slug, item.label, collections.includes(item.slug))}{/each}</div>
</fieldset>
<div class="field">
  <label for="{uid}-tags">{t('field.tags')}</label>
  <input id="{uid}-tags" class="input" name="tags" value={tags.join(', ')} maxlength={CLAIM_LIMITS.tag.max * (CLAIM_LIMITS.tag.length + 2)} autocomplete="off" />
</div>

<style>
  .group { min-width: 0; margin: 0; padding: 0; border: 0 }
  .group legend { padding: 0; margin-bottom: 8px }
  .pills { display: flex; flex-wrap: wrap; gap: 8px }
  .pill { position: relative; display: inline-flex; align-items: center; gap: 8px; min-height: 40px; padding: 0 10px 0 6px; border: 1px solid var(--line-strong); border-radius: 7px; background: var(--surface); white-space: nowrap; cursor: pointer }
  .pill:hover { border-color: var(--muted) }
  .pill input { position: absolute; inset: 0; width: 100%; height: 100%; margin: 0; opacity: 0; cursor: pointer }
  .pill:has(input:focus-visible) { outline: 3px solid var(--focus-ring); outline-offset: 2px }
  .box { display: grid; place-items: center; flex: none; width: 20px; height: 20px; border: 1px solid var(--line-strong); border-radius: 5px; background: var(--surface) }
  .box svg { width: 12px; height: 12px; opacity: 0; transition: opacity .12s ease }
  .pill:has(input:checked) { border-color: var(--accent); background: var(--accent-light) }
  .pill:has(input:checked) .box { border-color: var(--accent); background: var(--accent) }
  .pill:has(input:checked) .box svg { opacity: 1 }
  .parent { margin-bottom: 10px; font-weight: 500 }
  .genre-group { margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--line) }
</style>
