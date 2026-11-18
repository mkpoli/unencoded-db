<script lang="ts">
  import Combobox, { type ComboOption } from './Combobox.svelte'
  import { t } from '$lib/t'

  let { id, name, value = $bindable('') }: { id: string; name: string; value?: string } = $props()
  let options = $state<ComboOption[]>([])
  let query = $state<string | null>(null)
  $effect(() => {
    if (query === null) return
    const url = '/api/publishers?' + new URLSearchParams({ q: query })
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(url, { signal: controller.signal })
        if (!response.ok) return
        const rows: { label: string; aliases: string[] }[] = await response.json()
        if (!controller.signal.aborted) options = rows.map(row => ({ label: row.label, terms: row.aliases.join(' ') }))
      } catch { /* The editor can still accept the typed name. */ }
    }, query ? 120 : 0)
    return () => { clearTimeout(timer); controller.abort() }
  })
</script>

<div class="field">
  <label id="{id}-label" for={id}>{t('field.publisher')}</label>
  <Combobox {id} {name} bind:value {options} labelledby="{id}-label" maxlength={300} onopen={() => query = value} onquery={text => query = text} onchange={() => query = null} />
</div>
