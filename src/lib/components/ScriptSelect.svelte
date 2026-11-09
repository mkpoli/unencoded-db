<script lang="ts">
  import { DEFAULT_SCRIPT, normalizeScript, scriptOptions } from '$lib/script'

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
  const selected = $derived(normalizeScript(value))
</script>

<select {id} {name} value={selected} required aria-invalid={invalid} aria-describedby={describedBy} onchange={(event) => (value = event.currentTarget.value)}>
  {#each options as option (option)}
    <option value={option}>{option}</option>
  {/each}
</select>
