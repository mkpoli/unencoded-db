<script lang="ts">
  import Seo from '$lib/components/Seo.svelte'
  import TagBoard from '$lib/components/TagBoard.svelte'
  import { TAG_TYPES, arrangeTags, implicationClosure, localized, tagDepths, tagLookup, tagParents } from '$lib/tags'
  import { href, locale, t } from '$lib/t'
  import type { PageData } from './$types'

  let { data }: { data: PageData } = $props()

  let editing = $state(false)
  let liveTags = $state<typeof data.tags | null>(null)
  let liveGroups = $state<typeof data.groups | null>(null)
  let liveChanges = $state<typeof data.changes | null>(null)

  const tags = $derived(localized(liveTags ?? data.tags, locale()))
  const byName = $derived(tagLookup(tags))
  const sections = $derived(arrangeTags(tags, localized(liveGroups ?? data.groups, locale())))
  const parents = $derived(tagParents(tags))
  const depths = $derived(tagDepths(tags, parents))
  // The tags a tag stands under are shown by its place in the tree, not again after its arrow.
  const isAncestor = (name: string, of: string) => {
    for (let at = parents.get(of), steps = 0; at !== undefined && steps < 64; at = parents.get(at), steps++) if (at === name) return true
    return false
  }
</script>

<Seo title={t('nav.tags')} />

<div class="page">
  <div class="head">
    <div>
      <h1>{t('nav.tags')}</h1>
      <p class="lead">{t('tags.intro')}</p>
    </div>
    <button class="button" class:primary={editing} type="button" aria-pressed={editing} onclick={() => {
      if (!liveTags) liveTags = data.tags
      if (!liveGroups) liveGroups = data.groups
      if (!liveChanges) liveChanges = data.changes
      editing = !editing
    }}>
      {editing ? t('tags.done') : t('form.edit')}
    </button>
  </div>

  <div class="legend" aria-label={t('tags.legend')}>
    {#each TAG_TYPES as tagType (tagType)}
      <span class="tag-chip" data-tag-type={tagType}>{t(`tagType.${tagType}`)}</span>
    {/each}
  </div>

  {#if editing}
    <TagBoard
      bind:tags={() => liveTags ?? data.tags, value => (liveTags = value)}
      bind:groups={() => liveGroups ?? data.groups, value => (liveGroups = value)}
      bind:changes={() => liveChanges ?? data.changes, value => (liveChanges = value)}
      ondone={() => (editing = false)}
    />
  {:else}
    <div class="sections">
      {#each sections as section (section.type)}
        <section class="group">
          <h2>{t(`tagType.${section.type}`)} <span class="count">({section.shelves.reduce((sum, shelf) => sum + shelf.tags.length, 0)})</span></h2>
          {#each section.shelves as shelf (shelf.group?.id ?? 0)}
            <div class="shelf" class:loose={!shelf.group}>
              {#if shelf.group}<h3>{shelf.group.label} <span class="count">({shelf.tags.length})</span></h3>{/if}
              <ul class="tag-list">
                {#each shelf.tags as tag (tag.name)}
                  {@const closure = implicationClosure([tag.name], tags)}
                  {@const parent = parents.get(tag.name)}
                  {@const carried = tag.implies.filter(target => target !== parent)}
                  <li class:child={parent !== undefined} style:--depth={depths.get(tag.name) ?? 0}>
                    <a class="tag-chip" data-tag-type={tag.type} href={href(`/?tag=${encodeURIComponent(tag.name)}`)}>
                      <span>{tag.label}</span>
                      {#if tag.label !== tag.name}<span class="slug">({tag.name})</span>{/if}
                      <span class="n">{tag.n}</span>
                    </a>
                    {#each tag.aliases as alias (alias)}<span class="alias">= {alias}</span>{/each}
                    {#if carried.length}
                      <span class="arrow" aria-hidden="true">→</span>
                      {#each carried as target (target)}
                        {@const targetTag = byName.get(target)}
                        <a class="tag-chip small" data-tag-type={targetTag?.type ?? 'general'} href={href(`/?tag=${encodeURIComponent(target)}`)}>
                          {targetTag?.label ?? target}
                        </a>
                      {/each}
                      {#each closure.implied.filter(item => !tag.implies.includes(item.name) && !isAncestor(item.name, tag.name)) as indirect (indirect.name)}
                        {@const indirectTag = byName.get(indirect.name)}
                        <a class="tag-chip small implied" data-tag-type={indirectTag?.type ?? 'general'} href={href(`/?tag=${encodeURIComponent(indirect.name)}`)}>
                          {indirectTag?.label ?? indirect.name}
                        </a>
                      {/each}
                    {/if}
                  </li>
                {/each}
              </ul>
            </div>
          {/each}
        </section>
      {/each}
    </div>
  {/if}
</div>

<style>
  .page { max-width: 980px; margin: 0 auto; display: grid; grid-template-columns: minmax(0, 1fr); gap: 18px }
  .head { display: flex; flex-wrap: wrap; gap: 12px; justify-content: space-between; align-items: start }
  h1 { margin: 0; font-size: 26px }
  .lead { margin: 4px 0 0; color: var(--muted); font-size: 14.5px }
  .legend { display: flex; flex-wrap: wrap; gap: 6px }
  .sections { display: grid; gap: 22px }
  .group { display: grid; gap: 10px }
  .group h2 { margin: 0; font-size: 16px }
  .shelf { display: grid; gap: 8px; padding-inline-start: 12px; border-inline-start: 2px solid var(--line) }
  .shelf.loose { padding-inline-start: 0; border-inline-start: 0 }
  .shelf h3 { margin: 0; font-size: 14px; font-weight: 600 }
  .count { font-size: 13px; font-weight: 400; color: var(--muted) }
  .tag-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px }
  .tag-list li { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-inline-start: calc(var(--depth, 0) * 22px) }
  .tag-list li.child { position: relative }
  .tag-list li.child::before { content: ''; position: absolute; inset-inline-start: -14px; inset-block: -8px 50%; inline-size: 9px; border-inline-start: 1.5px solid var(--line-strong); border-block-end: 1.5px solid var(--line-strong); border-end-start-radius: 5px }
  .slug, .n { font-size: 11.5px; opacity: 0.78 }
  .arrow { color: var(--muted); font-size: 13px }
  .alias { color: var(--muted); font-size: 12.5px }
  .tag-chip.small { padding: 1px 8px; font-size: 12px }
</style>
