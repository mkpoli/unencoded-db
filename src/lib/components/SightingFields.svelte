<script lang="ts">
  // Where a character was seen. A picture or a link is enough; the reference IRG wants stays folded.
  // A post link fills the place, title and author from the post, and hands its photos to `onphotos`. When the
  // post's author names the book the picture is from, the book becomes the source and the post the last via of the chain.
  import { untrack } from 'svelte'
  import { CONTEXTS, SIGHTING_TYPES, STYLES, parseSightingTypes } from '$lib/scripts'
  import { cleanLinkInput } from '$lib/link-input'
  import { fetchPost, postId, type PostInfo } from '$lib/source-url'
  import { t } from '$lib/t'
  import type { Citation, SightingFields } from '$lib/server/entries'
  import { VIAS_MAX } from '$lib/scripts'

  let { values = {}, onphotos }: { values?: Partial<SightingFields>; onphotos?: (files: File[] | null) => void } = $props()
  const uid = $props.id()
  const selected = $derived(new Set(parseSightingTypes(values.types)))
  const filled = $derived(Boolean(values.title || values.author || values.publisher || values.report_date || values.original_date || values.page || values.context || values.style || values.types || values.note))

  let place = $state(untrack(() => values.place ?? ''))
  let url = $state(untrack(() => values.url ?? ''))
  let title = $state(untrack(() => values.title ?? ''))
  let author = $state(untrack(() => values.author ?? ''))
  let open = $state(untrack(() => filled))
  let fetching = $state(false), failed = $state(false)

  let page = $state(untrack(() => values.page ?? ''))
  let publisher = $state(untrack(() => values.publisher ?? ''))

  // The chain, nearest the cited work first. One empty row is always there to fill.
  type Via = { key: number; url: string; title: string; author: string; publisher: string; date: string }
  let nextKey = 0
  const via = (from?: Partial<Citation>): Via => ({ key: nextKey++, url: from?.url ?? '', title: from?.title ?? '', author: from?.author ?? '', publisher: from?.publisher ?? '', date: from?.report_date ?? '' })
  let vias = $state<Via[]>(untrack(() => values.vias?.length ? values.vias.map(via) : [via()]))
  let viaOpen = $state(untrack(() => Boolean(values.vias?.length)))
  const blankVia = (row: Via) => !(row.url || row.title || row.author || row.publisher || row.date)
  function removeVia(key: number) {
    vias = vias.filter(row => row.key !== key)
    if (!vias.length) vias = [via()]
  }
  // The row a post filled, so the next post replaces it.
  let postedKey: number | null = null

  // The fields keep what someone typed; a value the last post gave is replaced by the next post's.
  const blank = { place: '', title: '', author: '', publisher: '', page: '', viaUrl: '', viaTitle: '', viaAuthor: '', viaPublisher: '', viaDate: '' }
  type Filled = typeof blank
  let posted: Filled | null = null
  function fill(info: PostInfo | null) {
    const post = info ? { viaUrl: info.url ?? '', viaTitle: info.title, viaAuthor: info.author ?? '', viaPublisher: info.publisher, viaDate: info.date ?? '' } : null
    const next: Filled | null = !info ? null
      : info.work && post ? { ...blank, ...post, place: [info.work.title, info.work.page].filter(Boolean).join(' '), title: info.work.title, page: info.work.page ?? '' }
      : { ...blank, place: info.place, title: info.title, author: info.author ?? '', publisher: info.publisher }
    const keep = (current: string, name: keyof Filled) => !current || current === posted?.[name] ? next?.[name] ?? '' : current
    place = keep(place, 'place'); title = keep(title, 'title'); author = keep(author, 'author'); page = keep(page, 'page')
    publisher = keep(publisher, 'publisher')
    // The post is what the contributor saw, so it is the last link of the chain.
    let row = vias.find(item => item.key === postedKey)
    const found = Boolean(next && (next.viaUrl || next.viaTitle || next.viaAuthor || next.viaPublisher || next.viaDate))
    if (!row && found) {
      if (!blankVia(vias.at(-1)!) && vias.length < VIAS_MAX) vias.push(via())
      // A full chain gives its last link to the post, which is always what the contributor saw.
      row = vias.at(-1)
    }
    if (row) {
      row.url = keep(row.url, 'viaUrl'); row.title = keep(row.title, 'viaTitle'); row.author = keep(row.author, 'viaAuthor')
      row.publisher = keep(row.publisher, 'viaPublisher'); row.date = keep(row.date, 'viaDate')
      postedKey = found ? row.key : null
      if (row.url) viaOpen = true
      // The post is where the character was found, so its link moves out of the source's own link.
      if (next?.viaUrl && row.url === next.viaUrl) { url = ''; lookedUp = '' }
    }
    if (title || author || publisher || page) open = true
    posted = next
  }

  let lookedUp = untrack(() => url)
  $effect(() => {
    const link = url
    if (link === lookedUp) return
    lookedUp = link
    fetching = false; failed = false
    const id = postId(link)
    if (!id) { if (posted && !posted.viaUrl) { fill(null); onphotos?.(null) } return }
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      fetching = true
      try {
        const found = await fetchPost(id, controller.signal)
        if (controller.signal.aborted) return
        fill(found?.info ?? null)
        onphotos?.(found?.photos ?? null)
        failed = !found?.photos.length
      } catch {
        if (!controller.signal.aborted) failed = true
      } finally { if (!controller.signal.aborted) fetching = false }
    }, 400)
    return () => { clearTimeout(timer); controller.abort() }
  })
</script>

<div class="field">
  <label for="{uid}-url">{t('field.url')}</label>
  <input id="{uid}-url" class="input" type="url" name="url" bind:value={url} use:cleanLinkInput placeholder="https://" maxlength="1000" pattern="[hH][tT][tT][pP][sS]?://.+" autocorrect="off" autocapitalize="none" spellcheck="false" />
  {#if fetching}<p class="hint" role="status">{t('field.linkImageWorking')}</p>{:else if failed}<p class="hint" role="status">{t('field.linkImageFailed')}</p>{/if}
</div>
<div class="field">
  <label for="{uid}-place">{t('field.place')}</label>
  <input id="{uid}-place" class="input" name="place" bind:value={place} maxlength="500" />
  <p class="hint">{t('field.placeHint')}</p>
</div>
<fieldset class="types">
  <legend>{t('field.sourceTypes')}</legend>
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
  <div class="grid-2">
    <div class="field"><label for="{uid}-title">{t('field.title')}</label><input id="{uid}-title" class="input" name="title" bind:value={title} maxlength="300" /></div>
    <div class="field"><label for="{uid}-author">{t('field.author')}</label><input id="{uid}-author" class="input" name="author" bind:value={author} maxlength="300" /></div>
    <div class="field"><label for="{uid}-publisher">{t('field.publisher')}</label><input id="{uid}-publisher" class="input" name="publisher" bind:value={publisher} maxlength="300" /></div>
    <div class="field"><label for="{uid}-page">{t('field.page')}</label><input id="{uid}-page" class="input" name="page" bind:value={page} maxlength="80" /></div>
    <div class="field"><label for="{uid}-report_date">{t('field.reportDate')}</label><input id="{uid}-report_date" class="input" name="report_date" value={values.report_date ?? ''} aria-describedby="{uid}-report_date-hint" /><p class="hint" id="{uid}-report_date-hint">{t('field.reportDateHint')}</p></div>
    <div class="field"><label for="{uid}-original_date">{t('field.originalDate')}</label><input id="{uid}-original_date" class="input" name="original_date" value={values.original_date ?? ''} aria-describedby="{uid}-original_date-hint" /><p class="hint" id="{uid}-original_date-hint">{t('field.originalDateHint')}</p></div>
    <div class="field"><label for="{uid}-context">{t('field.context')}</label>
      <select id="{uid}-context" class="input" name="context" value={values.context ?? ''}><option value="">{t('field.unset')}</option>{#each CONTEXTS as item}<option value={item}>{t(`context.${item}`)}</option>{/each}</select></div>
    <div class="field"><label for="{uid}-style">{t('field.style')}</label>
      <select id="{uid}-style" class="input" name="style" value={values.style ?? ''}><option value="">{t('field.unset')}</option>{#each STYLES as item}<option value={item}>{t(`style.${item}`)}</option>{/each}</select></div>
  </div>
  <div class="field"><label for="{uid}-note">{t('field.note')}</label><textarea id="{uid}-note" class="input" name="note" rows="2" maxlength="5000">{values.note ?? ''}</textarea></div>
</details>
<details class="more" bind:open={viaOpen}>
  <summary>{t('field.via')}</summary>
  <p class="hint">{t('field.viaHint')}</p>
  {#each vias as row (row.key)}
    <fieldset class="via">
      <div class="field"><label for="{uid}-via_url-{row.key}">{t('field.url')}</label><input id="{uid}-via_url-{row.key}" class="input" type="url" name="via_url" bind:value={row.url} use:cleanLinkInput placeholder="https://" maxlength="1000" autocorrect="off" autocapitalize="none" spellcheck="false" /></div>
      <div class="grid-2">
        <div class="field"><label for="{uid}-via_title-{row.key}">{t('field.title')}</label><input id="{uid}-via_title-{row.key}" class="input" name="via_title" bind:value={row.title} maxlength="300" /></div>
        <div class="field"><label for="{uid}-via_author-{row.key}">{t('field.author')}</label><input id="{uid}-via_author-{row.key}" class="input" name="via_author" bind:value={row.author} maxlength="300" /></div>
        <div class="field"><label for="{uid}-via_publisher-{row.key}">{t('field.publisher')}</label><input id="{uid}-via_publisher-{row.key}" class="input" name="via_publisher" bind:value={row.publisher} maxlength="300" /></div>
        <div class="field"><label for="{uid}-via_report_date-{row.key}">{t('field.reportDate')}</label><input id="{uid}-via_report_date-{row.key}" class="input" name="via_report_date" bind:value={row.date} /></div>
      </div>
      <div><button type="button" class="text-button" onclick={() => removeVia(row.key)}>{t('field.viaRemove')}</button></div>
    </fieldset>
  {/each}
  {#if vias.length < VIAS_MAX && !blankVia(vias.at(-1)!)}
    <!-- Without scripts the add button does nothing, so an empty row is there to fill. -->
    <noscript><fieldset class="via">
      <div class="field"><label for="{uid}-via_url-next">{t('field.url')}</label><input id="{uid}-via_url-next" class="input" type="url" name="via_url" placeholder="https://" maxlength="1000" /></div>
      <div class="grid-2">
        <div class="field"><label for="{uid}-via_title-next">{t('field.title')}</label><input id="{uid}-via_title-next" class="input" name="via_title" maxlength="300" /></div>
        <div class="field"><label for="{uid}-via_author-next">{t('field.author')}</label><input id="{uid}-via_author-next" class="input" name="via_author" maxlength="300" /></div>
        <div class="field"><label for="{uid}-via_publisher-next">{t('field.publisher')}</label><input id="{uid}-via_publisher-next" class="input" name="via_publisher" maxlength="300" /></div>
        <div class="field"><label for="{uid}-via_report_date-next">{t('field.reportDate')}</label><input id="{uid}-via_report_date-next" class="input" name="via_report_date" /></div>
      </div>
    </fieldset></noscript>
  {/if}
  {#if vias.length < VIAS_MAX}<div><button type="button" class="button" onclick={() => vias.push(via())}>{t('field.viaAdd')}</button></div>{/if}
</details>

<style>
  .types { container: evidence-types / inline-size; display: flex; flex-direction: column; gap: 8px; min-width: 0; margin: 0; padding: 0; border: 0 }
  .types legend { padding: 0; font-weight: 500 }
  .type-grid { display: grid; grid-template-columns: minmax(0, 1fr); gap: 8px }
  .type { display: flex; align-items: flex-start; gap: 8px; min-width: 0; padding: 10px 11px; border: 1px solid var(--line); border-radius: 7px; cursor: pointer }
  .type:hover { border-color: var(--line-strong) }
  .type:has(input:checked) { border-color: var(--accent); background: var(--accent-light) }
  .type input { flex: none; margin: 3px 0 0; accent-color: var(--accent) }
  .type-text { display: flex; flex-direction: column; gap: 2px; min-width: 0 }
  .type-name { font-size: 13.5px; font-weight: 500 }
  .type .hint { font-size: 12px }
  .via { display: flex; flex-direction: column; gap: 12px; min-width: 0; margin: 0; padding: 12px; border: 1px solid var(--line); border-radius: 7px }
  .more { display: flex; flex-direction: column; border-top: 1px solid var(--line); padding-top: 12px }
  .more[open] > :global(* + *) { margin-top: 12px }
  summary { font-weight: 500; cursor: pointer }
  @container evidence-types (inline-size >= 17rem) {
    .type-grid { grid-template-columns: repeat(2, minmax(0, 1fr)) }
  }
  @container evidence-types (inline-size >= 35rem) {
    .type-grid { grid-template-columns: repeat(3, minmax(0, 1fr)) }
  }
</style>
