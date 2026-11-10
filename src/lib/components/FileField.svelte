<script lang="ts">
  import { untrack } from 'svelte'
  import { fetchPost, postId, type PostInfo } from '$lib/source-url'

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
    sourceUrl = '',
    fetchingLabel = '',
    fetchFailedLabel = '',
    onpost,
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
    /** An evidence link; a post link fills the field with the post's first picture. */
    sourceUrl?: string
    fetchingLabel?: string
    fetchFailedLabel?: string
    /** Receives the post's citation fields, or null when the link is not a readable post. */
    onpost?: (info: PostInfo | null) => void
  } = $props()

  let input: HTMLInputElement
  let file = $state<File | null>(null)
  let preview = $state<string | null>(null)
  let dragging = $state(false)
  let fromPost = $state(false)
  let fetching = $state(false)
  let failed = $state(false)
  let lookedUp = ''
  let controller: AbortController | null = null

  $effect(() => {
    const url = preview
    return () => { if (url) URL.revokeObjectURL(url) }
  })

  function setNative(next: File | null) {
    if (!input) return
    const transfer = new DataTransfer()
    if (next) transfer.items.add(next)
    input.files = transfer.files
  }

  function chooseFile(next: File | null, from = false) {
    file = next
    fromPost = from
    setNative(next)
    preview = next ? URL.createObjectURL(next) : null
    failed = false
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

  // A post link fills the field and its citation once the reader stops changing it. A picture they
  // chose themselves stays; a new link replaces only a picture this field fetched.
  $effect(() => {
    const url = sourceUrl
    if (url === lookedUp) return
    lookedUp = url
    controller?.abort()
    controller = null
    fetching = false
    failed = false
    const id = url ? postId(url) : null
    if (!id) {
      onpost?.(null)
      if (untrack(() => fromPost)) chooseFile(null)
      return
    }
    const timer = setTimeout(() => { void loadPost(id) }, 400)
    return () => {
      clearTimeout(timer)
      controller?.abort()
    }
  })

  async function loadPost(id: string) {
    const local = new AbortController()
    controller = local
    fetching = true
    failed = false
    try {
      const found = await fetchPost(id, local.signal)
      if (local.signal.aborted) return
      if (!found) {
        onpost?.(null)
        if (fromPost) chooseFile(null)
        if (!file) failed = true
        return
      }
      onpost?.(found.info)
      if (!found.photo) {
        if (fromPost) chooseFile(null)
        if (!file) failed = true
        return
      }
      if (file && !fromPost) return
      chooseFile(found.photo, true)
    } catch (error) {
      if (local.signal.aborted) return
      if (error instanceof DOMException && error.name === 'AbortError') return
      onpost?.(null)
      if (fromPost) chooseFile(null)
      if (!file) failed = true
    } finally {
      if (controller === local) {
        controller = null
        fetching = false
      }
    }
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
{#if fetching && fetchingLabel}
  <p class="field-help" role="status">{fetchingLabel}</p>
{:else if failed && fetchFailedLabel}
  <p class="field-help" role="status">{fetchFailedLabel}</p>
{/if}
</div>
