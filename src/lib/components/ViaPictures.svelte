<script lang="ts">
  // The pictures of one go-between, such as a screenshot of the message: the ones the sighting holds, each sent
  // as `via_keep`, and new ones sent as `via_image` with a thumbnail in `via_thumb`. The file input works
  // alone; with scripts a picture can also be dropped, or pasted into any field of the go-between.
  import { onDestroy, untrack } from 'svelte'
  import { prepare, thumbnail } from '$lib/picture'
  import { VIA_MEDIA_MAX } from '$lib/limits'
  import { media, t } from '$lib/t'
  import type { ViaPicture } from '$lib/server/entries'

  let { stored = [], onready }: { stored?: readonly ViaPicture[]; onready?: (busy: boolean) => void } = $props()

  const uid = $props.id()
  type Added = { key: number; file: File; thumb: File; url: string }
  let kept = $state(untrack(() => [...stored]))
  let added = $state<Added[]>([])
  let working = $state(0)
  let bad = $state(false), over = $state(false)
  let input = $state<HTMLInputElement>(), thumbs = $state<HTMLInputElement>()
  let next = 0
  const count = $derived(kept.length + added.length)
  const full = $derived(count + working >= VIA_MEDIA_MAX)

  function send() {
    for (const [target, files] of [[input, added.map(item => item.file)], [thumbs, added.map(item => item.thumb)]] as const) {
      if (!target) continue
      const transfer = new DataTransfer()
      for (const file of files) transfer.items.add(file)
      target.files = transfer.files
    }
  }

  export async function take(files: Iterable<File>) {
    bad = false
    for (const source of files) {
      if (count + working >= VIA_MEDIA_MAX) break
      working++; onready?.(true)
      try {
        const { file, bitmap } = await prepare(source)
        added.push({ key: next++, file, thumb: await thumbnail(bitmap, null), url: URL.createObjectURL(file) })
      } catch { bad = true }
      finally { working--; onready?.(false); send() }
    }
    send()
  }

  function remove(item: Added) {
    URL.revokeObjectURL(item.url)
    added = added.filter(other => other.key !== item.key)
    send()
  }

  onDestroy(() => { for (const item of added) URL.revokeObjectURL(item.url) })
</script>

{#snippet picture(src: string, index: number, onremove: () => void)}
  <span class="picture">
    <img {src} alt="{t('field.viaPictures')} {index + 1}" />
    <button type="button" class="remove" aria-label="{t('field.imageRemove')} {index + 1}" title={t('field.imageRemove')} onclick={onremove}><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg></button>
  </span>
{/snippet}

<div class="field">
  <span class="label" id="{uid}-label">{t('field.viaPictures')}</span>
  <div class="pictures" role="group" aria-labelledby="{uid}-label">
    {#each kept as item, index (item.image_key)}
      <input type="hidden" name="via_keep" value={item.image_key} />
      {@render picture(media(item.thumb_key), index, () => kept = kept.filter(other => other.image_key !== item.image_key))}
    {/each}
    {#each added as item, index (item.key)}
      {@render picture(item.url, kept.length + index, () => remove(item))}
    {/each}
    <input bind:this={thumbs} type="file" name="via_thumb" multiple hidden />
    <input bind:this={input} id="{uid}-file" class="file" type="file" name="via_image" accept="image/*" multiple disabled={full && !added.length} aria-labelledby="{uid}-label" tabindex={full ? -1 : 0} onchange={event => take([...(event.currentTarget.files ?? [])])} />
    {#if !full}
      <label class="add" class:over for="{uid}-file" ondragover={event => { event.preventDefault(); over = true }} ondragleave={() => over = false} ondrop={event => { event.preventDefault(); over = false; take([...(event.dataTransfer?.files ?? [])]) }}>
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M4 7.5A1.5 1.5 0 0 1 5.5 6H8l1.5-2h5L16 6h2.5A1.5 1.5 0 0 1 20 7.5v10a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5z" /><circle cx="12" cy="12.5" r="3.5" /></svg>
        <span>{working ? t('field.imageWorking') : t('field.imageDrop')}</span>
      </label>
    {:else if working}<span class="hint" role="status">{t('field.imageWorking')}</span>{/if}
  </div>
  {#if bad}<p class="notice bad small">{t('field.imageBad')}</p>{/if}
</div>

<style>
  .pictures { position: relative; display: flex; flex-wrap: wrap; align-items: flex-start; gap: 8px; min-width: 0 }
  .picture { position: relative; display: block; border: 1px solid var(--line); border-radius: 7px; background: var(--surface-sunken); overflow: hidden }
  .picture img { display: block; inline-size: auto; block-size: auto; max-inline-size: 220px; max-block-size: 120px }
  .remove { position: absolute; inset-block-start: 4px; inset-inline-end: 4px; display: inline-flex; align-items: center; justify-content: center; inline-size: max(24px, var(--target-size)); block-size: max(24px, var(--target-size)); padding: 0; border: 1px solid var(--line-strong); border-radius: 6px; background: var(--surface); color: var(--ink); cursor: pointer }
  .remove:hover { border-color: var(--ink) }
  .file { position: absolute; width: 1px; height: 1px; opacity: 0; overflow: hidden }
  .add { flex: 1 1 180px; display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-block-size: 56px; padding: 10px 14px; border: 1.5px dashed var(--line-strong); border-radius: 7px; color: var(--muted); font-size: 13px; text-align: center; cursor: pointer }
  .add:hover, .add.over { border-color: var(--accent); color: var(--ink); background: var(--accent-light) }
  .file:focus-visible ~ .add { outline: 3px solid var(--focus-ring); outline-offset: 2px }
</style>
