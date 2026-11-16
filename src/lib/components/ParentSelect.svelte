<script lang="ts">
  // The category a new category goes under: the top, or any category, each shown inside its parent.
  import { arrangeGenres, type CustomGenre } from '$lib/genres'
  import { t } from '$lib/t'

  let { name, id, custom = [], value = $bindable('') }: { name: string; id: string; custom?: CustomGenre[]; value?: string } = $props()
  const { standalone, groups } = $derived(arrangeGenres(custom))
  const rows = $derived([...standalone, ...groups.flatMap(group => [group.root, ...group.rows])])
</script>

<select class="input" {id} {name} bind:value>
  <option value="">{t('field.genreTopLevel')}</option>
  {#each rows as row (row.value)}<option value={row.value}>{'  '.repeat(row.depth)}{row.label}</option>{/each}
</select>
