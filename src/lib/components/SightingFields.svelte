<script lang="ts">
  // Where a character was seen. A picture or a link is enough; the reference IRG wants stays folded.
  // A post link fills the place, quotation and author from the post, and hands its photos to `onphotos`. When the
  // post's author names the book the picture is from, the book becomes the source and the post the last via of the chain.
  import { quotations, QUOTATIONS_MAX, type Quotation } from '$lib/quotations'
  import SourceTitleField from './SourceTitleField.svelte'
  import PublisherField from './PublisherField.svelte'
  import ContainerField from './ContainerField.svelte'
  import { tick, untrack } from 'svelte'
  import { flip } from 'svelte/animate'
  import { CONTEXTS, SIGHTING_TYPES, SOURCE_KINDS, STYLES, parseContexts, parseSightingTypes } from '$lib/scripts'
  import { cleanLinkInput } from '$lib/link-input'
  import { fetchPost, postId, type PostInfo } from '$lib/source-url'
  import { westernDate } from '$lib/dates'
  import { eraRead, t } from '$lib/t'
  import type { Citation, SightingFields, Via } from '$lib/server/entries'
  import { VIAS_MAX } from '$lib/scripts'

  let { values = {}, onphotos, onsource }: { values?: Partial<SightingFields>; onphotos?: (files: File[] | null) => void; onsource?: (sourceId: number | null) => void } = $props()
  const uid = $props.id()
  const selected = $derived(new Set(parseSightingTypes(values.types)))
  const appears = $derived(new Set(parseContexts(values.contexts)))
  const filled = $derived(Boolean(values.title || values.author || values.publisher || values.report_date || values.container || values.source_kind || values.original_date || values.page || values.contexts || values.style || values.types || values.quotes || values.note))

  let place = $state(untrack(() => values.place ?? ''))
  let url = $state(untrack(() => values.url ?? ''))
  let title = $state(untrack(() => values.title ?? ''))
  let reportDate = $state(untrack(() => values.report_date ?? ''))
  let originalDate = $state(untrack(() => values.original_date ?? ''))
  let author = $state(untrack(() => values.author ?? ''))
  let open = $state(untrack(() => filled))
  let fetching = $state(false), failed = $state(false)

  let page = $state(untrack(() => values.page ?? ''))
  let publisher = $state(untrack(() => values.publisher ?? ''))
  let container = $state(untrack(() => values.container ?? ''))
  let kind = $state(untrack(() => values.source_kind ?? ''))

  // The chain, nearest the cited work first. One empty row is always there to fill.
  type Row = { key: number; url: string; title: string; author: string; publisher: string; date: string; container: string; kind: string; quote: string }
  let nextKey = 0
  const via = (from?: Partial<Via>): Row => ({ key: nextKey++, url: from?.url ?? '', title: from?.title ?? '', author: from?.author ?? '', publisher: from?.publisher ?? '', date: from?.report_date ?? '', container: from?.container ?? '', kind: from?.source_kind ?? '', quote: from?.quote ?? '' })
  const passage = (from?: Quotation) => ({ key: nextKey++, text: from?.text ?? '', locator: from?.locator ?? '' })
  let passages = $state(untrack(() => {
    const saved = quotations(values.quotes)
    return saved.length ? saved.map(passage) : [passage()]
  }))
  let postedPassage: number | null = null
  let vias = $state<Row[]>(untrack(() => values.vias?.length ? values.vias.map(via) : [via()]))
  let viaOpen = $state(untrack(() => Boolean(values.vias?.length)))
  const blankVia = (row: Row) => !(row.url || row.title || row.author || row.publisher || row.date || row.container)
  function removeVia(key: number) {
    vias = vias.filter(row => row.key !== key)
    if (!vias.length) vias = [via()]
  }
  async function moveVia(key: number, by: -1 | 1, button: 'earlier' | 'later' | 'grip') {
    const from = vias.findIndex(row => row.key === key)
    const to = from + by
    if (from < 0 || to < 0 || to >= vias.length) return
    ;[vias[from], vias[to]] = [vias[to], vias[from]]
    await tick()
    const names = button === 'grip' ? ['grip'] : [button, button === 'earlier' ? 'later' : 'earlier']
    const buttons = names.map(name => document.getElementById(`${uid}-via-${name}-${key}`) as HTMLButtonElement | null)
    buttons.find(item => item && !item.disabled)?.focus()
  }
  // A row follows the pointer: it takes the place of a neighbour once the pointer passes that neighbour's middle.
  let viaList = $state<HTMLElement>()
  let dragged = $state<number | null>(null)
  const still = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
  function dragVia(event: PointerEvent, key: number) {
    if (event.button !== 0 || dragged !== null) return
    event.preventDefault()
    const before = [...vias]
    let y = event.clientY, frame = 0, moved = false
    dragged = key
    const place = () => {
      const rows = [...viaList!.children] as HTMLElement[]
      const from = vias.findIndex(row => row.key === key)
      const at = y - viaList!.getBoundingClientRect().top
      const middle = (row: HTMLElement) => row.offsetTop + row.offsetHeight / 2
      let to = from
      while (to > 0 && at < middle(rows[to - 1])) to--
      while (to < rows.length - 1 && at > middle(rows[to + 1])) to++
      if (to !== from) vias.splice(to, 0, ...vias.splice(from, 1))
    }
    // Near the top or bottom of the window the page scrolls under the pointer.
    const scroll = () => {
      // Only while the list runs past that edge.
      const edge = 72, box = viaList!.getBoundingClientRect()
      const past = y < edge && box.top < edge ? y - edge : y > innerHeight - edge && box.bottom > innerHeight - edge ? y - (innerHeight - edge) : 0
      if (past && moved) { scrollBy({ top: past / 4, behavior: 'instant' }); place() }
      frame = requestAnimationFrame(scroll)
    }
    const stop = () => {
      cancelAnimationFrame(frame)
      for (const [name, listener] of listeners) removeEventListener(name, listener as EventListener)
      dragged = null
    }
    const move = (now: PointerEvent) => {
      if (now.pointerId !== event.pointerId) return
      // The button was let go where the page could not see it.
      if (now.pointerType === 'mouse' && !now.buttons) return stop()
      if (Math.abs(now.clientY - event.clientY) > 4) moved = true
      y = now.clientY
      place()
    }
    const end = (now: PointerEvent | KeyboardEvent) => {
      if (now instanceof KeyboardEvent ? now.key !== 'Escape' : now.pointerId !== event.pointerId) return
      if (now.type !== 'pointerup') vias = before
      stop()
    }
    const listeners = [['pointermove', move], ['pointerup', end], ['pointercancel', end], ['keydown', end]] as const
    for (const [name, listener] of listeners) addEventListener(name, listener as EventListener)
    frame = requestAnimationFrame(scroll)
  }
  function gripKey(event: KeyboardEvent, key: number) {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
    event.preventDefault()
    moveVia(key, event.key === 'ArrowUp' ? -1 : 1, 'grip')
  }
  // The row a post filled, so the next post replaces it.
  let postedKey: number | null = null

  // The fields keep what someone typed; a value the last post gave is replaced by the next post's.
  const blank = { place: '', title: '', author: '', publisher: '', page: '', viaUrl: '', viaTitle: '', viaAuthor: '', viaPublisher: '', viaDate: '', viaQuote: '', quote: '' }
  type Filled = typeof blank
  let posted: Filled | null = null
  function fill(info: PostInfo | null) {
    const post = info ? { viaUrl: info.url ?? '', viaTitle: '', viaQuote: info.quote, viaAuthor: info.author ?? '', viaPublisher: info.publisher, viaDate: info.date ?? '' } : null
    let row = vias.find(item => item.key === postedKey && item.url === posted?.viaUrl)
    const canAttach = row || blankVia(vias.at(-1)!) || vias.length < VIAS_MAX
    const next: Filled | null = !info ? null
      : info.work && post?.viaUrl && canAttach ? { ...blank, ...post, place: [info.work.title, info.work.page].filter(Boolean).join(' '), title: info.work.title, page: info.work.page ?? '' }
      : { ...blank, place: info.place, quote: info.quote, author: info.author ?? '', publisher: info.publisher }
    const keep = (current: string, name: keyof Filled) => !current || current === posted?.[name] ? next?.[name] ?? '' : current
    place = keep(place, 'place'); title = keep(title, 'title'); author = keep(author, 'author'); page = keep(page, 'page')
    publisher = keep(publisher, 'publisher')
    // A post is public, so the source it fills is not a personal communication.
    if (next && !next.viaUrl) kind = ''
    let direct = passages.find(item => item.key === postedPassage)
    if (!direct && next?.quote) {
      direct = passages.find(item => !item.text && !item.locator)
      if (!direct && passages.length < QUOTATIONS_MAX) { passages.push(passage()); direct = passages.at(-1) }
    }
    if (direct) {
      if (!next?.quote && direct.text === posted?.quote) direct.locator = ''
      direct.text = keep(direct.text, 'quote')
      postedPassage = next?.quote ? direct.key : null
    }
    // The post is what the contributor saw, so it is the last link of the chain.
    const found = Boolean(next && (next.viaUrl || next.viaTitle || next.viaAuthor || next.viaPublisher || next.viaDate))
    if (!row && found) {
      if (!blankVia(vias.at(-1)!) && vias.length < VIAS_MAX) vias.push(via())
      const available = vias.at(-1)!
      if (blankVia(available)) row = available
    }
    if (row) {
      const before = [row.url, row.title, row.author, row.publisher, row.date].join('\u0000')
      const hadSource = !blankVia(row)
      if (found && !hadSource) row.kind = ''
      row.url = keep(row.url, 'viaUrl'); row.title = keep(row.title, 'viaTitle'); row.author = keep(row.author, 'viaAuthor')
      row.publisher = keep(row.publisher, 'viaPublisher'); row.date = keep(row.date, 'viaDate')
      // Words written for the source this row held no longer belong to it once a post replaces it. A row
      // that held no source is being filled, so words already in it are for this post.
      if (hadSource && [row.url, row.title, row.author, row.publisher, row.date].join('\u0000') !== before) { row.quote = ''; row.kind = '' }
      if (!next?.viaUrl || row.url === next.viaUrl) row.quote = keep(row.quote, 'viaQuote')
      postedKey = found ? row.key : null
      if (row.url) viaOpen = true
      // The post is where the character was found, so its link moves out of the source's own link.
      if (next?.viaUrl && row.url === next.viaUrl) { url = ''; lookedUp = '' }
    }
    if (title || author || publisher || page || next?.quote) open = true
    posted = next
  }

  let lookedUp = untrack(() => url)
  let pendingPost: AbortController | null = null
  function chooseSource(source: Citation) {
    pendingPost?.abort()
    const samePost = postId(url) !== null && postId(url) === postId(source.url ?? '')
    title = source.title ?? ''
    author = source.author ?? ''
    publisher = source.publisher ?? ''
    reportDate = source.report_date ?? ''
    container = source.container ?? ''
    kind = source.source_kind ?? ''
    lookedUp = url = source.url ?? ''
    if (!samePost && postedPassage !== null) {
      const row = passages.find(item => item.key === postedPassage)
      if (row && row.text === posted?.quote) { row.text = ''; row.locator = '' }
      postedPassage = null
    }
    if (!samePost) posted = null
    postedKey = null
    fetching = failed = false
  }

  function chooseVia(row: Row, source: Citation) {
    const sameSource = row.url && row.url === source.url && row.container === (source.container ?? '') && row.kind === (source.source_kind ?? '') || (
      row.url === (source.url ?? '') && row.title === (source.title ?? '') && row.author === (source.author ?? '')
      && row.publisher === (source.publisher ?? '') && row.date === (source.report_date ?? '') && row.container === (source.container ?? '') && row.kind === (source.source_kind ?? '')
    )
    if (!blankVia(row) && !sameSource) row.quote = ''
    if (row.key === postedKey) postedKey = null
    row.url = source.url ?? ''
    row.title = source.title ?? ''
    row.author = source.author ?? ''
    row.publisher = source.publisher ?? ''
    row.date = source.report_date ?? ''
    row.container = source.container ?? ''
    row.kind = source.source_kind ?? ''
  }

  $effect(() => {
    const link = url
    if (link === lookedUp) return
    const previous = lookedUp
    lookedUp = link
    if (posted?.quote && postId(previous) !== postId(link)) fill(null)
    fetching = false; failed = false
    const id = postId(link)
    if (!id) { if (posted && !posted.viaUrl) { fill(null); onphotos?.(null) } return }
    const controller = new AbortController()
    pendingPost = controller
    const timer = setTimeout(async () => {
      if (controller.signal.aborted) return
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

{#snippet yearRead(id: string, text: string)}<output class="read" id="{id}-read" for={id}>{eraRead(text, westernDate(text)) ?? ''}</output>{/snippet}

{#snippet kindField(id: string, name: string, value: string, onpick: (value: string) => void)}
  <div class="field"><label for={id}>{t('field.sourceKind')}</label>
    <select {id} class="input" {name} {value} onchange={event => onpick(event.currentTarget.value)}><option value="">—</option>{#each SOURCE_KINDS as item}<option value={item}>{t(`sourceKind.${item}`)}</option>{/each}</select></div>
{/snippet}

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
    <SourceTitleField id="{uid}-title" name="title" bind:value={title} onselect={chooseSource} {onsource} />
    <div class="field"><label for="{uid}-author">{t('field.author')}</label><input id="{uid}-author" class="input" name="author" bind:value={author} maxlength="300" /></div>
    <ContainerField id="{uid}-container" name="container" bind:value={container} bind:publisher />
    <PublisherField id="{uid}-publisher" name="publisher" bind:value={publisher} />
    {@render kindField(`${uid}-source_kind`, 'source_kind', kind, value => kind = value)}
    <div class="field"><label for="{uid}-page">{t('field.page')}</label><input id="{uid}-page" class="input" name="page" bind:value={page} maxlength="80" /></div>
    <div class="field"><label for="{uid}-report_date">{t('field.reportDate')}</label><input id="{uid}-report_date" class="input" name="report_date" bind:value={reportDate} aria-describedby="{uid}-report_date-hint {uid}-report_date-read" /><p class="hint" id="{uid}-report_date-hint">{t('field.reportDateHint')}</p>{@render yearRead(`${uid}-report_date`, reportDate)}</div>
    <div class="field"><label for="{uid}-original_date">{t('field.originalDate')}</label><input id="{uid}-original_date" class="input" name="original_date" bind:value={originalDate} aria-describedby="{uid}-original_date-hint {uid}-original_date-read" /><p class="hint" id="{uid}-original_date-hint">{t('field.originalDateHint')}</p>{@render yearRead(`${uid}-original_date`, originalDate)}</div>
    <div class="field"><label for="{uid}-style">{t('field.style')}</label>
      <select id="{uid}-style" class="input" name="style" value={values.style ?? ''}><option value="">{t('field.unset')}</option>{#each STYLES as item}<option value={item}>{t(`style.${item}`)}</option>{/each}</select></div>
  </div>
  <fieldset class="types">
    <legend>{t('field.context')}</legend>
    <div class="contexts">
      {#each CONTEXTS as context}<label class="type context"><input type="checkbox" name="contexts" value={context} checked={appears.has(context)} /><span class="type-name">{t(`context.${context}`)}</span></label>{/each}
    </div>
  </fieldset>
  {#each passages as row (row.key)}
    <div class="field"><label for="{uid}-quote-{row.key}">{t('field.quote')}</label><textarea id="{uid}-quote-{row.key}" class="input" name="quote_text" rows="2" maxlength="5000" bind:value={row.text}></textarea></div>
    <div class="field"><label for="{uid}-locator-{row.key}">{t('field.quoteLocator')}</label><input id="{uid}-locator-{row.key}" class="input" name="quote_locator" maxlength="300" bind:value={row.locator} /></div>
  {/each}
  <button type="button" class="button small" disabled={passages.length >= QUOTATIONS_MAX} onclick={() => passages.push(passage())}>{t('field.addQuote')}</button>
  <div class="field"><label for="{uid}-note">{t('field.note')}</label><textarea id="{uid}-note" class="input" name="note" rows="2" maxlength="5000">{values.note ?? ''}</textarea></div>
</details>
<details class="more" bind:open={viaOpen}>
  <summary>{t('field.via')}</summary>
  <p class="hint">{t('field.viaHint')}</p>
  <div class="via-list" class:sorting={dragged !== null} bind:this={viaList}>
  {#each vias as row, index (row.key)}
    <fieldset class="via" class:dragged={dragged === row.key} animate:flip={{ duration: still ? 0 : 160 }}>
      {#if vias.length > 1}
        <button type="button" id="{uid}-via-grip-{row.key}" class="grip" aria-label="{t('field.viaDrag')} {index + 1}" title={t('field.viaDrag')} onpointerdown={event => dragVia(event, row.key)} onkeydown={event => gripKey(event, row.key)}><svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><circle cx="9" cy="6" r="1.6" /><circle cx="15" cy="6" r="1.6" /><circle cx="9" cy="12" r="1.6" /><circle cx="15" cy="12" r="1.6" /><circle cx="9" cy="18" r="1.6" /><circle cx="15" cy="18" r="1.6" /></svg><span class="order">{index + 1}</span></button>
      {/if}
      <div class="field"><label for="{uid}-via_url-{row.key}">{t('field.url')}</label><input id="{uid}-via_url-{row.key}" class="input" type="url" name="via_url" bind:value={row.url} use:cleanLinkInput placeholder="https://" maxlength="1000" autocorrect="off" autocapitalize="none" spellcheck="false" /></div>
      <div class="grid-2">
        <SourceTitleField id="{uid}-via_title-{row.key}" name="via_title" bind:value={row.title} onselect={source => chooseVia(row, source)} />
        <div class="field"><label for="{uid}-via_author-{row.key}">{t('field.author')}</label><input id="{uid}-via_author-{row.key}" class="input" name="via_author" bind:value={row.author} maxlength="300" /></div>
        <ContainerField id="{uid}-via_container-{row.key}" name="via_container" bind:value={row.container} bind:publisher={row.publisher} />
        <PublisherField id="{uid}-via_publisher-{row.key}" name="via_publisher" bind:value={row.publisher} />
        {@render kindField(`${uid}-via_source_kind-${row.key}`, 'via_source_kind', row.kind, value => row.kind = value)}
        <div class="field"><label for="{uid}-via_report_date-{row.key}">{t('field.reportDate')}</label><input id="{uid}-via_report_date-{row.key}" class="input" name="via_report_date" bind:value={row.date} aria-describedby="{uid}-via_report_date-{row.key}-read" />{@render yearRead(`${uid}-via_report_date-${row.key}`, row.date)}</div>
      </div>
      <div class="field"><label for="{uid}-via_quote-{row.key}">{t('field.quote')}</label><textarea id="{uid}-via_quote-{row.key}" class="input" name="via_quote" rows="2" maxlength="5000" bind:value={row.quote}></textarea></div>
      <div class="via-actions">
        {#if vias.length > 1}
          <button type="button" id="{uid}-via-earlier-{row.key}" class="text-button" disabled={index === 0} onclick={() => moveVia(row.key, -1, 'earlier')}><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m18 15-6-6-6 6" /></svg>{t('field.viaEarlier')}</button>
          <button type="button" id="{uid}-via-later-{row.key}" class="text-button" disabled={index === vias.length - 1} onclick={() => moveVia(row.key, 1, 'later')}><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>{t('field.viaLater')}</button>
        {/if}
        <button type="button" class="text-button" onclick={() => removeVia(row.key)}>{t('field.viaRemove')}</button>
      </div>
    </fieldset>
  {/each}
  </div>
  {#if vias.length < VIAS_MAX && !blankVia(vias.at(-1)!)}
    <!-- Without scripts the add button does nothing, so an empty row is there to fill. -->
    <noscript><fieldset class="via">
      <div class="field"><label for="{uid}-via_url-next">{t('field.url')}</label><input id="{uid}-via_url-next" class="input" type="url" name="via_url" placeholder="https://" maxlength="1000" /></div>
      <div class="grid-2">
        <div class="field"><label for="{uid}-via_title-next">{t('field.title')}</label><input id="{uid}-via_title-next" class="input" name="via_title" maxlength="300" /></div>
        <div class="field"><label for="{uid}-via_author-next">{t('field.author')}</label><input id="{uid}-via_author-next" class="input" name="via_author" maxlength="300" /></div>
        <div class="field"><label for="{uid}-via_container-next">{t('field.container')}</label><input id="{uid}-via_container-next" class="input" name="via_container" maxlength="300" /></div>
        <div class="field"><label for="{uid}-via_publisher-next">{t('field.publisher')}</label><input id="{uid}-via_publisher-next" class="input" name="via_publisher" maxlength="300" /></div>
        <div class="field"><label for="{uid}-via_report_date-next">{t('field.reportDate')}</label><input id="{uid}-via_report_date-next" class="input" name="via_report_date" /></div>
        {@render kindField(`${uid}-via_source_kind-next`, 'via_source_kind', '', () => {})}
      </div>
      <div class="field"><label for="{uid}-via_quote-next">{t('field.quote')}</label><textarea id="{uid}-via_quote-next" class="input" name="via_quote" rows="2" maxlength="5000"></textarea></div>
    </fieldset></noscript>
  {/if}
  {#if vias.length < VIAS_MAX}<div><button type="button" class="button" onclick={() => vias.push(via())}>{t('field.viaAdd')}</button></div>{/if}
</details>

<style>
  .read:empty { position: absolute }
  .read { font-size: 13px; font-variant-numeric: tabular-nums; color: var(--ink) }
  .types { container: evidence-types / inline-size; display: flex; flex-direction: column; min-width: 0; margin: 0; padding: 0; border: 0 }
  .types legend { padding: 0 0 8px; font-weight: 500 }
  .type-grid { display: grid; grid-template-columns: minmax(0, 1fr); gap: 8px }
  .type { display: flex; align-items: flex-start; gap: 8px; min-width: 0; padding: 10px 11px; border: 1px solid var(--line); border-radius: 7px; cursor: pointer }
  .type:hover { border-color: var(--line-strong) }
  .type:has(input:checked) { border-color: var(--accent); background: var(--accent-light) }
  .type input { flex: none; margin: 3px 0 0; accent-color: var(--accent) }
  .type-text { display: flex; flex-direction: column; gap: 2px; min-width: 0 }
  .type-name { font-size: 13.5px; font-weight: 500 }
  .type .hint { font-size: 12px }
  .contexts { display: flex; flex-wrap: wrap; gap: 8px }
  .context { align-items: center; min-block-size: var(--target-size) }
  .context input { margin: 0 }
  .via { display: flex; flex-direction: column; gap: 12px; min-width: 0; margin: 0; padding: 12px; border: 1px solid var(--line); border-radius: 7px }
  .via-list { position: relative; display: flex; flex-direction: column; gap: 12px; overflow-anchor: none }
  .via-list.sorting { user-select: none; cursor: grabbing }
  .via.dragged { border-color: var(--accent); background: var(--accent-light) }
  .grip { align-self: flex-start; display: inline-flex; align-items: center; gap: 4px; min-block-size: max(28px, var(--target-size)); margin: -4px 0 -4px -6px; padding: 0 8px 0 4px; border: 0; border-radius: 6px; background: none; color: var(--muted); font: inherit; font-size: 13px; font-variant-numeric: tabular-nums; cursor: grab; touch-action: none }
  .grip:hover, .via.dragged .grip { color: var(--ink) }
  .via-list.sorting .grip { cursor: grabbing }
  .via-actions { display: flex; flex-wrap: wrap; gap: 4px 16px }
  .text-button:disabled { color: var(--muted); cursor: default; text-decoration: none }
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
