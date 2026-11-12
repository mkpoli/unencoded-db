<script lang="ts">
  // Where a character was seen. The place is the only line asked for; the reference IRG wants stays folded.
  // A post link fills the place, title and author from the post, and hands its photo to `onphoto`. When the
  // post's author names the book the picture is from, the book becomes the source and the post the via source.
  import { untrack } from 'svelte'
  import { CONTEXTS, SIGHTING_TYPES, STYLES, parseSightingTypes } from '$lib/scripts'
  import { cleanLinkInput } from '$lib/link-input'
  import { fetchPost, postId, type PostInfo } from '$lib/source-url'
  import { t } from '$lib/t'
  import type { SightingFields } from '$lib/server/entries'

  let { values = {}, requirePlace = true, onphoto }: { values?: Partial<SightingFields>; requirePlace?: boolean; onphoto?: (file: File | null) => void } = $props()
  const selected = $derived(new Set(parseSightingTypes(values.types)))
  const filled = $derived(Boolean(values.title || values.author || values.publisher || values.report_date || values.original_date || values.page || values.context || values.style || values.types || values.note))

  let place = $state(untrack(() => values.place ?? ''))
  let url = $state(untrack(() => values.url ?? ''))
  let title = $state(untrack(() => values.title ?? ''))
  let author = $state(untrack(() => values.author ?? ''))
  let open = $state(untrack(() => filled))
  const viaFilled = $derived(Boolean(values.via_url || values.via_title || values.via_author || values.via_publisher || values.via_report_date))
  let viaOpen = $state(untrack(() => viaFilled))
  let fetching = $state(false), failed = $state(false)

  let page = $state(untrack(() => values.page ?? ''))
  let viaUrl = $state(untrack(() => values.via_url ?? ''))
  let viaTitle = $state(untrack(() => values.via_title ?? ''))
  let viaAuthor = $state(untrack(() => values.via_author ?? ''))
  let viaDate = $state(untrack(() => values.via_report_date ?? ''))

  // The fields keep what someone typed; a value the last post gave is replaced by the next post's.
  const blank = { place: '', title: '', author: '', page: '', viaUrl: '', viaTitle: '', viaAuthor: '', viaDate: '' }
  type Filled = typeof blank
  let posted: Filled | null = null
  function fill(info: PostInfo | null) {
    const post = info ? { viaUrl: info.url ?? '', viaTitle: info.title, viaAuthor: info.author ?? '', viaDate: info.date ?? '' } : null
    const next: Filled | null = !info ? null
      : info.work && post ? { ...blank, ...post, place: [info.work.title, info.work.page].filter(Boolean).join(' '), title: info.work.title, page: info.work.page ?? '' }
      : { ...blank, place: info.place, title: info.title, author: info.author ?? '' }
    const keep = (current: string, name: keyof Filled) => !current || current === posted?.[name] ? next?.[name] ?? '' : current
    place = keep(place, 'place'); title = keep(title, 'title'); author = keep(author, 'author'); page = keep(page, 'page')
    viaUrl = keep(viaUrl, 'viaUrl'); viaTitle = keep(viaTitle, 'viaTitle'); viaAuthor = keep(viaAuthor, 'viaAuthor'); viaDate = keep(viaDate, 'viaDate')
    if (title || author || page) open = true
    if (viaUrl) viaOpen = true
    // The post is where the character was found, so its link moves out of the source's own link.
    if (next?.viaUrl && viaUrl === next.viaUrl) { url = ''; lookedUp = '' }
    posted = next
  }

  let lookedUp = untrack(() => url)
  $effect(() => {
    const link = url
    if (link === lookedUp) return
    lookedUp = link
    fetching = false; failed = false
    const id = postId(link)
    if (!id) { if (posted && !posted.viaUrl) { fill(null); onphoto?.(null) } return }
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      fetching = true
      try {
        const found = await fetchPost(id, controller.signal)
        if (controller.signal.aborted) return
        fill(found?.info ?? null)
        onphoto?.(found?.photo ?? null)
        failed = !found?.photo
      } catch {
        if (!controller.signal.aborted) failed = true
      } finally { if (!controller.signal.aborted) fetching = false }
    }, 400)
    return () => { clearTimeout(timer); controller.abort() }
  })
</script>

<div class="field">
  <label for="url">{t('field.url')}</label>
  <input id="url" class="input" type="url" name="url" bind:value={url} use:cleanLinkInput placeholder="https://" maxlength="1000" />
  <p class="hint">{t('field.urlHint')}</p>
  {#if fetching}<p class="hint" role="status">{t('field.linkImageWorking')}</p>{:else if failed}<p class="hint" role="status">{t('field.linkImageFailed')}</p>{/if}
</div>
<div class="field">
  <label for="place" class:required={requirePlace}>{t('field.place')}</label>
  <input id="place" class="input" name="place" bind:value={place} maxlength="500" />
  <p class="hint">{t('field.placeHint')}</p>
</div>
<fieldset class="types">
  <legend>{t('field.sourceTypes')}</legend>
  <p class="hint">{t('field.sourceTypesHint')}</p>
  <div class="type-grid">
    {#each SIGHTING_TYPES as type}
      <label class="type">
        <input type="checkbox" name="types" value={type} checked={selected.has(type)} />
        <span class="type-text"><span class="type-name">{t(`evidence.type.${type}`)}</span><span class="hint">{t(`evidence.type.${type}.hint`)}</span></span>
      </label>
    {/each}
  </div>
</fieldset>
<details class="more" bind:open>
  <summary>{t('field.source')}</summary>
  <p class="hint">{t('field.sourceHint')}</p>
  <div class="grid-2">
    <div class="field"><label for="title">{t('field.title')}</label><input id="title" class="input" name="title" bind:value={title} maxlength="300" /></div>
    <div class="field"><label for="author">{t('field.author')}</label><input id="author" class="input" name="author" bind:value={author} maxlength="300" /></div>
    <div class="field"><label for="publisher">{t('field.publisher')}</label><input id="publisher" class="input" name="publisher" value={values.publisher ?? ''} maxlength="300" /></div>
    <div class="field"><label for="page">{t('field.page')}</label><input id="page" class="input" name="page" bind:value={page} maxlength="80" /></div>
    <div class="field"><label for="report_date">{t('field.reportDate')}</label><input id="report_date" class="input" name="report_date" value={values.report_date ?? ''} maxlength="40" /><p class="hint">{t('field.reportDateHint')}</p></div>
    <div class="field"><label for="original_date">{t('field.originalDate')}</label><input id="original_date" class="input" name="original_date" value={values.original_date ?? ''} maxlength="40" /><p class="hint">{t('field.originalDateHint')}</p></div>
    <div class="field"><label for="context">{t('field.context')}</label>
      <select id="context" class="input" name="context" value={values.context ?? ''}><option value="">{t('field.unset')}</option>{#each CONTEXTS as item}<option value={item}>{t(`context.${item}`)}</option>{/each}</select></div>
    <div class="field"><label for="style">{t('field.style')}</label>
      <select id="style" class="input" name="style" value={values.style ?? ''}><option value="">{t('field.unset')}</option>{#each STYLES as item}<option value={item}>{t(`style.${item}`)}</option>{/each}</select></div>
  </div>
  <div class="field"><label for="note">{t('field.note')}</label><textarea id="note" class="input" name="note" rows="2" maxlength="5000">{values.note ?? ''}</textarea></div>
</details>
<details class="more" bind:open={viaOpen}>
  <summary>{t('field.via')}</summary>
  <p class="hint">{t('field.viaHint')}</p>
  <div class="field"><label for="via_url">{t('field.url')}</label><input id="via_url" class="input" type="url" name="via_url" bind:value={viaUrl} use:cleanLinkInput placeholder="https://" maxlength="1000" /></div>
  <div class="grid-2">
    <div class="field"><label for="via_title">{t('field.title')}</label><input id="via_title" class="input" name="via_title" bind:value={viaTitle} maxlength="300" /></div>
    <div class="field"><label for="via_author">{t('field.author')}</label><input id="via_author" class="input" name="via_author" bind:value={viaAuthor} maxlength="300" /></div>
    <div class="field"><label for="via_publisher">{t('field.publisher')}</label><input id="via_publisher" class="input" name="via_publisher" value={values.via_publisher ?? ''} maxlength="300" /></div>
    <div class="field"><label for="via_report_date">{t('field.reportDate')}</label><input id="via_report_date" class="input" name="via_report_date" bind:value={viaDate} maxlength="40" /></div>
  </div>
</details>

<style>
  .types { display: flex; flex-direction: column; gap: 8px; min-width: 0; margin: 0; padding: 0; border: 0 }
  .types legend { padding: 0; font-weight: 500 }
  .type-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px }
  .type { display: flex; align-items: flex-start; gap: 8px; min-width: 0; padding: 10px 11px; border: 1px solid var(--line); border-radius: 7px; cursor: pointer }
  .type:hover { border-color: var(--line-strong) }
  .type:has(input:checked) { border-color: var(--accent); background: var(--accent-light) }
  .type input { flex: none; margin: 3px 0 0; accent-color: var(--accent) }
  .type-text { display: flex; flex-direction: column; gap: 2px; min-width: 0 }
  .type-name { font-size: 13.5px; font-weight: 500 }
  .type .hint { font-size: 12px }
  .more { display: flex; flex-direction: column; border-top: 1px solid var(--line); padding-top: 12px }
  .more[open] > :global(* + *) { margin-top: 12px }
  summary { font-weight: 500; cursor: pointer }
</style>
