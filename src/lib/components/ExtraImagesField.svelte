<script lang="ts">
  let {
    id = 'extra-image',
    name = 'extra_image',
    label,
    choose,
    remove,
    hint,
  }: { id?: string; name?: string; label: string; choose: string; remove: string; hint: string } = $props()

  let input: HTMLInputElement
  let files = $state<File[]>([])
  let previews = $state<string[]>([])
  let over = $state(false)

  function sync(next: File[]) {
    files = next
    for (const url of previews) URL.revokeObjectURL(url)
    previews = next.map(file => URL.createObjectURL(file))
    if (!input) return
    const transfer = new DataTransfer()
    for (const file of next) transfer.items.add(file)
    input.files = transfer.files
  }

  function add(incoming: FileList | null) {
    const images = [...(incoming ?? [])].filter(file => file.type.startsWith('image/'))
    if (images.length) sync([...files, ...images])
  }

  function drop(event: DragEvent) {
    event.preventDefault()
    over = false
    add(event.dataTransfer?.files ?? null)
  }

  function removeAt(index: number) {
    sync(files.filter((_, i) => i !== index))
  }
</script>

<div class="field">
  <span class="field-label">{label}</span>
  <input bind:this={input} {id} {name} class="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp" multiple onchange={(event) => add(event.currentTarget.files)} />
  <label class="extra-drop" class:over for={id} ondragover={(event) => { event.preventDefault(); over = true }} ondragleave={() => { over = false }} ondrop={drop}>
    <span>{choose}</span>
  </label>
  {#if files.length}
    <ul class="extra-list">
      {#each files as file, index (file.name + index)}
        <li class="extra-item">
          <img src={previews[index]} alt="" />
          <span>{file.name}</span>
          <button class="quiet-link" type="button" onclick={() => removeAt(index)}>{remove}</button>
        </li>
      {/each}
    </ul>
  {/if}
  <p class="field-help">{hint}</p>
</div>
