<script lang="ts">
  // What the search box offers while a text is typed in it: the other ways the text is written, the encoded
  // characters near it and the records it finds, each with its description. Choosing a way of writing or a
  // character searches for it; a record opens. The tables are read in the browser, so nothing shows without scripts.
  import { characterFacts, describedTable } from '$lib/encoded'
  import { encodedCandidates } from '$lib/candidates'
  import { recordCode } from '$lib/code'
  import { suggest, type Suggested } from '$lib/search-suggestions'
  import { href, media, t } from '$lib/t'
  import IdsGlyph from './IdsGlyph.svelte'
  import type { PickedRecord } from './RecordPicker.svelte'

  let { query, onsearch }: { query: string; onsearch: (text: string) => void } = $props()

  const NONE: Suggested = { also: [], written: [], characters: [] }
  let offered = $state.raw<Suggested>(NONE)
  let records = $state.raw<PickedRecord[]>([])
  // The text what is offered answers, so a list for a text since changed is never shown under the new one.
  let answered = $state('')
  const typed = $derived(query.trim())
  const shown = $derived(answered === typed && (offered.written.length > 0 || offered.characters.length > 0 || records.length > 0))

  const near = async (ids: string) => (await encodedCandidates(ids)).flatMap(hit => hit.source === 'encoded' ? [{ char: hit.char, ids: hit.ids }] : [])
  const variantsOf = async (text: string) => [...text].length === 1 ? (await characterFacts(text).catch(() => null))?.variants.map(variant => variant.character) ?? [] : []

  $effect(() => {
    const text = typed
    if (!text) { offered = NONE; records = []; answered = ''; return }
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      const found = await describedTable().then(async table => suggest(text, table, near, await variantsOf(text)), () => NONE)
      if (controller.signal.aborted) return
      offered = found; records = []; answered = text
      const params = new URLSearchParams({ q: text })
      for (const spelling of found.also) params.append('also', spelling)
      const answer = await fetch(`/api/records?${params}`, { signal: controller.signal }).then(response => response.ok ? response.json() : [], () => [])
      if (!controller.signal.aborted && Array.isArray(answer)) records = answer
    }, 250)
    return () => { clearTimeout(timer); controller.abort() }
  })
</script>

{#if shown}
  <div class="suggestions" role="group" aria-label={t('search.suggestions')}>
    {#if offered.written.length}
      <section>
        <h3>{t('search.written')}</h3>
        <ul>
          {#each offered.written as item (item.text)}
            <li><button type="button" class="pick" onclick={() => onsearch(item.text)}><span class="ids" lang="zh">{item.text}</span></button></li>
          {/each}
        </ul>
      </section>
    {/if}
    {#if offered.characters.length}
      <section>
        <h3>{t('status.encoded')}</h3>
        <ul>
          {#each offered.characters as item (item.char)}
            <li><button type="button" class="pick" onclick={() => onsearch(item.char)}><span class="char" lang="zh">{item.char}</span>{#if item.ids}<span class="ids" lang="zh">{item.ids}</span>{/if}</button></li>
          {/each}
        </ul>
      </section>
    {/if}
    {#if records.length}
      <section>
        <h3>{t('nav.browse')}</h3>
        <ul>
          {#each records as record (record.id)}
            <li>
              <a class="pick" href={href(`/entry/${record.id}`)}>
                <span class="plate" aria-hidden="true">
                  {#if record.ids}<IdsGlyph ids={record.ids} layout={record.layout} />
                  {:else if record.cover_key}<img src={media(record.cover_key)} alt="" loading="lazy" decoding="async" />{/if}
                </span>
                <span class="code">{recordCode(record.id)}</span>
                {#if record.ids}<span class="ids" lang="zh">{record.ids}</span>{/if}
              </a>
            </li>
          {/each}
        </ul>
      </section>
    {/if}
  </div>
{/if}

<style>
  .suggestions { display: flex; flex-direction: column; gap: 12px; padding: 12px 16px; border: 1px solid var(--line); border-radius: 9px; background: var(--surface) }
  section { display: grid; grid-template-columns: minmax(5rem, max-content) minmax(0, 1fr); align-items: start; gap: 4px 16px }
  h3 { margin: 0; padding-block: 8px; font-size: 12.5px; font-weight: 500; color: var(--muted) }
  ul { display: flex; flex-wrap: wrap; gap: 4px; margin: 0; padding: 0; list-style: none; min-width: 0 }
  li { min-width: 0; max-inline-size: 100% }
  .pick { display: inline-flex; align-items: center; gap: 8px; min-block-size: max(36px, var(--target-size)); max-inline-size: 100%; padding: 4px 10px; border: 1px solid var(--line); border-radius: 7px; background: var(--surface); color: var(--ink); font: inherit; cursor: pointer }
  .pick:hover { border-color: var(--line-strong) }
  .char { font-size: 20px; line-height: 1 }
  .char + .ids, .code + .ids { color: var(--muted) }
  .ids { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
  .plate { display: grid; flex: none; grid-template: 100% / 100%; place-items: center; width: 28px; height: 28px; overflow: hidden; border-radius: 5px; background: var(--surface-tile); color: var(--ink) }
  .plate img { width: 100%; height: 100%; object-fit: contain }
  .code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12.5px; font-variant-numeric: tabular-nums }
  @media (max-width: 38rem) { section { grid-template-columns: minmax(0, 1fr) } h3 { padding-block: 0 } }
</style>
