<script lang="ts">
  // The category a new category goes under: the top, or any category, each shown inside its parent.
  import { arrangeGenres, type CategoryRef } from '$lib/genres'
  import { t } from '$lib/t'

  let { name, id, categories = [], value = $bindable('') }: { name: string; id: string; categories?: CategoryRef[]; value?: string } = $props()
  const { standalone, groups } = $derived(arrangeGenres(categories))
  const rows = $derived([...standalone, ...groups.flatMap(group => [group.root, ...group.rows])])
</script>

<select class="input" {id} {name} bind:value>
  <option value="">{t('field.genreTopLevel')}</option>
  {#each rows as row (row.value)}<option value={row.value}>{'  '.repeat(row.depth)}{row.label}</option>{/each}
</select>
