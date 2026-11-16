<script lang="ts">
  // The categories, collections and tags a record is filed under. The markers save an emptied choice.
  import { CLAIM_LIMITS } from '$lib/claims'
  import { COLLECTIONS, GENRE_LENGTH_MAX, cleanGenre, genreOf, groupGenres, type Genre } from '$lib/genres'
  import { t } from '$lib/t'
  import CheckPill from './CheckPill.svelte'

  let { genres = [], known = [], collections = [], tags = [] }: { genres?: string[]; known?: { value: string; n: number }[]; collections?: string[]; tags?: string[] } = $props()
  const { standalone, groups } = groupGenres()
  const uid = $props.id()
  // The categories people added, then the ones this record has that are not among them, then the ones typed here.
  const listed = $derived([...new Set([...known.map(item => item.value), ...genres.filter(value => !genreOf(value))])])
  let added = $state<{ value: string; on: boolean }[]>([])
  let typed = $state('')
  function add() {
    const value = cleanGenre(typed)
    if (!value) return
    typed = ''
    if (genreOf(value) || listed.includes(value) || added.some(item => item.value === value)) return
    added.push({ value, on: true })
  }
  const enter = (event: KeyboardEvent) => { if (event.key === 'Enter') { event.preventDefault(); add() } }
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
  <div class="genre-group custom">
    <div class="pills">
      {#each listed as value (value)}<CheckPill name="genre" {value} label={value} checked={genres.includes(value)} />{/each}
      {#each added as item (item.value)}<CheckPill value={item.value} label={item.value} checked={item.on} onchange={on => (item.on = on)} />{#if item.on}<input type="hidden" name="genre" value={item.value} />{/if}{/each}
    </div>
    <div class="adder">
      <input class="input" name="genre" bind:value={typed} onkeydown={enter} maxlength={GENRE_LENGTH_MAX} autocomplete="off" aria-label={t('field.genreAdd')} />
      <button class="button" type="button" onclick={add}>{t('form.add')}</button>
    </div>
  </div>
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
  .adder { display: flex; gap: 8px; margin-top: 10px; max-width: 360px }
  .adder .input { flex: 1; min-width: 0 }
  .genre-group { margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--line) }
</style>
