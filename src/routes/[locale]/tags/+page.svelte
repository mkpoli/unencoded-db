<script lang="ts">
  import Seo from '$lib/components/Seo.svelte'
  import TagBoard from '$lib/components/TagBoard.svelte'
  import { TAG_TYPES, arrangeTagsByType, implicationClosure, tagLookup } from '$lib/tags'
  import { href, t } from '$lib/t'
  import type { PageData } from './$types'

  let { data }: { data: PageData } = $props()

  let editing = $state(false)
  let liveTags = $state<typeof data.tags | null>(null)
  let liveChanges = $state<typeof data.changes | null>(null)

  const tags = $derived(liveTags ?? data.tags)
  const changes = $derived(liveChanges ?? data.changes)
  const byName = $derived(tagLookup(tags))
  const groups = $derived(arrangeTagsByType(tags))
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
      bind:changes={() => liveChanges ?? data.changes, value => (liveChanges = value)}
      ondone={() => (editing = false)}
    />
  {:else}
    <div class="sections">
      {#each groups as group (group.type)}
        <section class="group">
          <h2>{t(`tagType.${group.type}`)} <span class="count">({group.tags.length})</span></h2>
          <ul class="tag-list">
            {#each group.tags as tag (tag.name)}
              {@const closure = implicationClosure([tag.name], tags)}
              <li>
                <a class="tag-chip" data-tag-type={tag.type} href={href(`/?tag=${encodeURIComponent(tag.name)}`)}>
                  <span>{tag.label}</span>
                  {#if tag.label !== tag.name}<span class="slug">({tag.name})</span>{/if}
                  <span class="n">{tag.n}</span>
                </a>
                {#if tag.implies.length}
                  <span class="arrow" aria-hidden="true">→</span>
                  {#each tag.implies as target (target)}
                    {@const targetTag = byName.get(target)}
                    <a class="tag-chip small" data-tag-type={targetTag?.type ?? 'general'} href={href(`/?tag=${encodeURIComponent(target)}`)}>
                      {targetTag?.label ?? target}
                    </a>
                  {/each}
                  {#each closure.implied.filter(item => !tag.implies.includes(item.name)) as indirect (indirect.name)}
                    {@const indirectTag = byName.get(indirect.name)}
                    <a class="tag-chip small implied" data-tag-type={indirectTag?.type ?? 'general'} href={href(`/?tag=${encodeURIComponent(indirect.name)}`)}>
                      {indirectTag?.label ?? indirect.name}
                    </a>
                  {/each}
                {/if}
              </li>
            {/each}
          </ul>
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
  .count { font-size: 13px; font-weight: 400; color: var(--muted) }
  .tag-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px }
  .tag-list li { display: flex; flex-wrap: wrap; align-items: center; gap: 6px }
  .slug, .n { font-size: 11.5px; opacity: 0.78 }
  .arrow { color: var(--muted); font-size: 13px }
  .tag-chip.small { padding: 1px 8px; font-size: 12px }
</style>
