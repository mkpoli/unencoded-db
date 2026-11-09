<script lang="ts">
  let {
    id = 'image',
    name = 'image',
    label,
    accept = 'image/jpeg,image/png,image/webp',
    choose,
    browse,
    replace,
    remove,
    previewAlt,
    hint,
    hintId = 'file-formats',
    describedBy,
    error = '',
    optional = false,
  }: {
    id?: string
    name?: string
    label: string
    accept?: string
    choose: string
    browse: string
    replace: string
    remove: string
    previewAlt: string
    hint: string
    hintId?: string
    describedBy?: string
    error?: string
    optional?: boolean
  } = $props()

  let input: HTMLInputElement
  let file = $state<File | null>(null)
  let preview = $state<string | null>(null)
  let dragging = $state(false)

  $effect(() => {
    const url = preview
    return () => { if (url) URL.revokeObjectURL(url) }
  })

  function chooseFile(next: File | null) {
    file = next
    preview = next ? URL.createObjectURL(next) : null
  }

  function onchange() {
    chooseFile(input.files?.[0] ?? null)
  }

  function clear() {
    if (input) input.value = ''
    chooseFile(null)
  }

  function ondrop(event: DragEvent) {
    event.preventDefault()
    dragging = false
    const files = event.dataTransfer?.files
    if (!files?.length || !input) return
    input.files = files
    chooseFile(files[0])
  }

  function size(bytes: number) {
    return bytes >= 1024 * 1024
      ? `${(bytes / 1024 / 1024).toFixed(1)} MiB`
      : `${Math.max(1, Math.round(bytes / 1024))} KiB`
  }
</script>

<div class="file-control">
<div class="file-field" class:invalid={!!error} class:dragging>
  <input
    {id}
    {name}
    type="file"
    {accept}
    class="visually-hidden"
    bind:this={input}
    onchange={onchange}
    aria-label={label}
    aria-invalid={!!error}
    aria-describedby={describedBy}
    required={!optional}
  />
  {#if file}
    <div class="file-selected">
      {#if preview}
        <img class="file-thumb" src={preview} alt={previewAlt} />
      {:else}
        <span class="file-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="1.6" /><path d="m4 17 5-5 4 4 2-2 5 5" /></svg>
        </span>
      {/if}
      <span class="file-copy">
        <strong>{file.name}</strong>
        <small>{size(file.size)}</small>
      </span>
      <span class="file-actions">
        <button class="file-replace" type="button" onclick={() => input?.click()}>{replace}</button>
        <button class="file-remove" type="button" onclick={clear}>{remove}</button>
      </span>
    </div>
  {:else}
    <label
      class="file-empty"
      for={id}
      ondragover={(event) => { event.preventDefault(); dragging = true }}
      ondragleave={() => { dragging = false }}
      ondrop={ondrop}
    >
      <span class="file-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="1.6" /><path d="m4 17 5-5 4 4 2-2 5 5" /></svg>
      </span>
      <span class="file-copy">
        <strong>{choose}</strong>
      </span>
      <span class="file-browse" aria-hidden="true">{browse}</span>
    </label>
  {/if}
</div>
<p class="field-help file-hint" id={hintId}>{hint}</p>
</div>
