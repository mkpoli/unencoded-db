<script lang="ts">
  // The categories, collections and tags a record is filed under. The markers save an emptied choice.
  import { CLAIM_LIMITS } from '$lib/claims'
  import { COLLECTIONS, GENRE_LENGTH_MAX, arrangeGenres, cleanGenre, genreOf, type CustomGenre, type GenreRow } from '$lib/genres'
  import { t } from '$lib/t'
  import CheckPill from './CheckPill.svelte'
  import ParentSelect from './ParentSelect.svelte'

  let { genres = [], known = [], collections = [], tags = [] }: { genres?: string[]; known?: CustomGenre[]; collections?: string[]; tags?: string[] } = $props()
  const uid = $props.id()
  // A category the record has that no one has added a row for yet stands at the top; one made here stands under its parent.
  let made = $state<CustomGenre[]>([])
  let chosen = $state<string[]>([])
  const custom = $derived<CustomGenre[]>([
    ...known, ...made.filter(item => !known.some(other => other.value === item.value)),
    ...genres.filter(value => !genreOf(value) && !known.some(item => item.value === value) && !made.some(item => item.value === value)).map(value => ({ value, parent: null, n: 0 })),
  ])
  const { standalone, groups } = $derived(arrangeGenres(custom))
  let typed = $state(''), parent = $state(''), wrong = $state(false), busy = $state(false)

  // With scripts the category is made at once and filed under; without them the form carries it with the record.
  async function add() {
    const name = cleanGenre(typed)
    wrong = !name
    if (!name || busy) return
    busy = true
    try {
      const body = new FormData()
      body.set('genre_new', name); body.set('genre_new_parent', parent)
      const response = await fetch('/api/categories', { method: 'POST', body })
      if (!response.ok) { wrong = true; return }
      const { value } = await response.json() as { value: string }
      if (!genreOf(value) && !custom.some(item => item.value === value)) made.push({ value, parent: parent || null, n: 0 })
      if (!chosen.includes(value)) chosen.push(value)
      typed = ''
    } catch { wrong = true } finally { busy = false }
  }
  const enter = (event: KeyboardEvent) => { if (event.key === 'Enter') { event.preventDefault(); void add() } }
</script>

{#snippet pill(row: GenreRow, strong = false)}<CheckPill name="genre" value={row.value} label={row.label} checked={genres.includes(row.value) || chosen.includes(row.value)} {strong} />{/snippet}

<fieldset class="group">
  <legend class="label">{t('field.genre')}</legend>
  <input type="hidden" name="genres_present" value="1" />
  <div class="pills">{#each standalone as row (row.value)}{@render pill(row)}{/each}</div>
  {#each groups as group (group.root.value)}
    <div class="genre-group">
      {@render pill(group.root, true)}
      <div class="pills">{#each group.rows as row (row.value)}<span class="tier" style:margin-inline-start="{Math.max(0, row.depth - 1) * 16}px">{@render pill(row)}</span>{/each}</div>
    </div>
  {/each}
  <div class="genre-group adder">
    <div class="field"><label for="{uid}-new">{t('field.genreAdd')}</label><input id="{uid}-new" class="input" name="genre_new" bind:value={typed} onkeydown={enter} oninput={() => (wrong = false)} maxlength={GENRE_LENGTH_MAX} autocomplete="off" aria-invalid={wrong} /></div>
    <div class="field"><label for="{uid}-parent">{t('field.genreParent')}</label><ParentSelect id="{uid}-parent" name="genre_new_parent" {custom} bind:value={parent} /></div>
    <button class="button" type="button" onclick={add} disabled={busy}>{t('form.add')}</button>
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
  .tier { display: inline-flex; max-width: 100% }
  .genre-group > :global(.pill) { margin-bottom: 10px }
  .genre-group { margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--line) }
  .adder { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto; align-items: end; gap: 8px 12px }
  @media (max-width: 500px) { .adder { grid-template-columns: minmax(0, 1fr) } }
</style>
