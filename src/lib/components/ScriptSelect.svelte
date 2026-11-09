<script lang="ts">
  import { DEFAULT_SCRIPT, scriptOptions } from '$lib/script'

  let {
    value = $bindable(DEFAULT_SCRIPT),
    id = 'script',
    name = 'script',
    invalid = false,
    describedBy = undefined,
  }: {
    value?: string
    id?: string
    name?: string
    invalid?: boolean
    describedBy?: string
  } = $props()

  const options = $derived(scriptOptions(value))
</script>

<select {id} {name} bind:value required aria-invalid={invalid} aria-describedby={describedBy}>
  {#each options as option (option)}
    <option value={option}>{option}</option>
  {/each}
</select>
