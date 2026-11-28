<script lang="ts">
  // Who wrote a source, offered from the authors other sources name so that one person keeps one spelling.
  // Choosing one fills the author alone.
  import Combobox, { type ComboOption } from './Combobox.svelte'
  import { t } from '$lib/t'

  let { id, name, value = $bindable('') }: { id: string; name: string; value?: string } = $props()
  let options = $state<ComboOption[]>([])
  let query = $state<string | null>(null)
  $effect(() => {
    if (query === null) return
    if (!query.trim()) { options = []; return }
    const url = '/api/authors?' + new URLSearchParams({ q: query })
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(url, { signal: controller.signal })
        if (!response.ok) return
        const rows: { label: string }[] = await response.json()
        if (!controller.signal.aborted) options = rows
      } catch { /* The typed name is still accepted. */ }
    }, 120)
    return () => { clearTimeout(timer); controller.abort() }
  })
</script>

<div class="field">
  <label id="{id}-label" for={id}>{t('field.author')}</label>
  <Combobox {id} {name} bind:value {options} labelledby="{id}-label" maxlength={300} onopen={() => query = value} onquery={text => query = text} onchange={() => query = null} />
</div>
