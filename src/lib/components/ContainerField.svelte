<script lang="ts">
  // What a source appeared in. Choosing a known one also names its publisher; the author and the date
  // belong to each source, so they are never filled from here.
  import Combobox, { type ComboOption } from './Combobox.svelte'
  import { t } from '$lib/t'

  let { id, name, value = $bindable(''), onpublisher }: { id: string; name: string; value?: string; onpublisher?: (publisher: string) => void } = $props()
  let options = $state<ComboOption[]>([])
  let query = $state<string | null>(null)
  $effect(() => {
    if (query === null) return
    const url = '/api/containers?' + new URLSearchParams({ q: query })
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(url, { signal: controller.signal })
        if (!response.ok) return
        const rows: { label: string; publisher: string | null }[] = await response.json()
        if (!controller.signal.aborted) options = rows.map(row => ({ label: row.label, hint: row.publisher ?? undefined }))
      } catch { /* The typed name is still accepted. */ }
    }, query ? 120 : 0)
    return () => { clearTimeout(timer); controller.abort() }
  })
</script>

<div class="field">
  <label id="{id}-label" for={id}>{t('field.container')}</label>
  <Combobox {id} {name} bind:value {options} labelledby="{id}-label" maxlength={300} onopen={() => query = value} onquery={text => query = text} onchange={() => query = null}
    onselect={option => { if (option.hint) onpublisher?.(option.hint) }} />
</div>
