<script lang="ts">
  // Wiki board for editing tag labels, tag types (colors), and DAG implications with undo history.
  import {
    TAG_LENGTH_MAX,
    TAG_TYPES,
    arrangeTagsByType,
    canImply,
    implicationClosure,
    tagErrorKey,
    tagLabels,
    tagLookup,
    type Tag,
    type TagType,
  } from '$lib/tags'
  import type { TagChange } from '$lib/server/tags'
  import { href, t, when } from '$lib/t'

  let { tags = $bindable<Tag[]>([]), changes = $bindable<TagChange[]>([]), ondone }: {
    tags: Tag[]
    changes: TagChange[]
    ondone?: () => void
  } = $props()

  let busy = $state(false)
  let errorMsg = $state<string | null>(null)
  let newName = $state('')
  let newType = $state<TagType>('general')
  let newImplies = $state('')
  let drafts = $state<Record<string, string>>({})

  const byName = $derived(tagLookup(tags))
  const labels = $derived(tagLabels(tags))
  const groups = $derived(arrangeTagsByType(tags))

  // Which tags are implied by at least one other tag (so they cannot be deleted directly).
  const impliedBy = $derived.by(() => {
    const map = new Map<string, string[]>()
    for (const tag of tags) {
      for (const target of tag.implies) map.set(target, [...(map.get(target) ?? []), tag.name])
    }
    return map
  })

  // Only the latest undoable change of each tag offers Undo.
  const undoable = $derived.by(() => {
    const seen = new Set<string>()
    const allowed = new Set<TagChange['kind']>(['create', 'rename', 'retype', 'imply', 'unimply', 'delete'])
    const latest = new Set<number>()
    for (const change of changes) {
      if (seen.has(change.name)) continue
      seen.add(change.name)
      if (allowed.has(change.kind)) latest.add(change.id)
    }
    return latest
  })

  async function mutate(body: Record<string, unknown>, fallback: 'tag' | 'tagChange' = 'tagChange') {
    if (busy) return false
    busy = true
    errorMsg = null
    try {
      const response = await fetch('/api/tags', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = (await response.json().catch(() => null)) as { ok?: boolean; error?: string; tags?: Tag[]; changes?: TagChange[] } | null
      if (data?.tags) tags = data.tags
      if (data?.changes) changes = data.changes
      if (!response.ok || !data?.ok) {
        errorMsg = t(tagErrorKey(data?.error, fallback))
        return false
      }
      return true
    } finally {
      busy = false
    }
  }

  async function createNew(event: Event) {
    event.preventDefault()
    const name = newName.trim()
    if (!name) return
    const ok = await mutate(
      { action: 'create', name, type: newType, implies: newImplies ? [newImplies] : [] },
      'tag',
    )
    if (ok) {
      newName = ''
      newImplies = ''
    }
  }

  async function saveLabel(tag: Tag) {
    const next = (drafts[tag.name] ?? tag.label).trim()
    if (!next || next === tag.label) {
      const rest = { ...drafts }
      delete rest[tag.name]
      drafts = rest
      return
    }
    const ok = await mutate({ action: 'rename', name: tag.name, label: next, rev: tag.rev })
    if (ok) {
      const rest = { ...drafts }
      delete rest[tag.name]
      drafts = rest
    }
  }

  function changeDetail(change: TagChange) {
    const parse = (raw: string | null) => {
      try { return raw ? JSON.parse(raw) as Record<string, unknown> : null } catch { return null }
    }
    const before = parse(change.before), after = parse(change.after)
    if (change.kind === 'rename' && before?.label && after?.label) return `${String(before.label)} → ${String(after.label)}`
    if (change.kind === 'retype' && before?.type && after?.type) {
      return `${t(`tagType.${String(before.type)}`)} → ${t(`tagType.${String(after.type)}`)}`
    }
    if (change.kind === 'imply' && after?.implies) {
      const target = String(after.implies)
      return `→ ${labels.get(target) ?? target}`
    }
    if (change.kind === 'unimply' && before?.implies) {
      const target = String(before.implies)
      return `× ${labels.get(target) ?? target}`
    }
    if (change.kind === 'create' && after?.type) return t(`tagType.${String(after.type)}`)
    return ''
  }
</script>

<div class="board">
  <div class="board-head">
    <form class="create-bar" onsubmit={createNew}>
      <input
        class="input"
        type="text"
        maxlength={TAG_LENGTH_MAX}
        placeholder={t('field.tagAdd')}
        aria-label={t('field.tagAdd')}
        bind:value={newName}
      />
      <select class="input" aria-label={t('field.tagType')} bind:value={newType}>
        {#each TAG_TYPES as tagType (tagType)}
          <option value={tagType}>{t(`tagType.${tagType}`)}</option>
        {/each}
      </select>
      <select class="input" aria-label={t('field.tagImplies')} bind:value={newImplies}>
        <option value="">{t('field.tagImpliesNone')}</option>
        {#each groups as group (group.type)}
          <optgroup label={t(`tagType.${group.type}`)}>
            {#each group.tags as item (item.name)}
              <option value={item.name}>{item.label}</option>
            {/each}
          </optgroup>
        {/each}
      </select>
      <button class="button primary" type="submit" disabled={busy || !newName.trim()}>{t('tags.add')}</button>
    </form>
    {#if ondone}
      <button class="button" type="button" onclick={ondone}>{t('tags.done')}</button>
    {/if}
  </div>

  {#if errorMsg}
    <p class="banner-error" role="alert">{errorMsg}</p>
  {/if}

  {#each groups as group (group.type)}
    <section class="type-section">
      <h2>
        <span class="tag-chip" data-tag-type={group.type}>{t(`tagType.${group.type}`)}</span>
        <span class="muted count">({group.tags.length})</span>
      </h2>
      <div class="rows">
        {#each group.tags as tag (tag.name)}
          {@const currentLabel = drafts[tag.name] ?? tag.label}
          {@const dirty = currentLabel.trim() !== tag.label && currentLabel.trim().length > 0}
          {@const closure = implicationClosure([tag.name], tags)}
          {@const candidates = tags.filter(other => canImply(tags, tag.name, other.name) === null)}
          {@const parents = impliedBy.get(tag.name) ?? []}
          {@const locked = Boolean(tag.used || parents.length)}
          <div class="tag-row">
            <div class="row-main">
              <div class="identity">
                <span class="tag-chip" data-tag-type={tag.type}>{tag.label}</span>
                {#if tag.label !== tag.name}<code class="slug">{tag.name}</code>{/if}
                <a class="n" href={href(`/?tag=${encodeURIComponent(tag.name)}`)}>{tag.n}</a>
              </div>

              <div class="controls">
                <input
                  class="input label-input"
                  type="text"
                  maxlength={TAG_LENGTH_MAX}
                  aria-label={t('tags.rename', { name: tag.label })}
                  value={currentLabel}
                  oninput={event => (drafts = { ...drafts, [tag.name]: event.currentTarget.value })}
                  onkeydown={event => { if (event.key === 'Enter') { event.preventDefault(); saveLabel(tag) } }}
                />
                {#if dirty}
                  <button type="button" class="button" disabled={busy} onclick={() => saveLabel(tag)}>{t('tags.save')}</button>
                {/if}
                <select
                  class="input type-select"
                  aria-label={t('tags.retype', { name: tag.label })}
                  value={tag.type}
                  disabled={busy}
                  onchange={event => mutate({ action: 'retype', name: tag.name, type: event.currentTarget.value, rev: tag.rev })}
                >
                  {#each TAG_TYPES as tagType (tagType)}
                    <option value={tagType}>{t(`tagType.${tagType}`)}</option>
                  {/each}
                </select>
                <button
                  type="button"
                  class="button danger"
                  disabled={locked || busy}
                  title={locked ? t('tags.inUse') : t('tags.delete', { name: tag.label })}
                  aria-label={t('tags.delete', { name: tag.label })}
                  onclick={() => mutate({ action: 'delete', name: tag.name, rev: tag.rev })}
                >×</button>
              </div>
            </div>

            <div class="implications">
              <span class="imp-label">{t('tags.carries')}</span>
              {#each tag.implies as target (target)}
                {@const targetTag = byName.get(target)}
                <span class="tag-chip" data-tag-type={targetTag?.type ?? 'general'}>
                  {targetTag?.label ?? target}
                  <button
                    type="button"
                    class="x"
                    disabled={busy}
                    aria-label={t('tags.unimply', { name: tag.label, target: targetTag?.label ?? target })}
                    onclick={() => mutate({ action: 'unimply', name: tag.name, target, rev: tag.rev })}
                  >×</button>
                </span>
              {/each}
              {#each closure.implied.filter(item => !tag.implies.includes(item.name)) as indirect (indirect.name)}
                {@const indirectTag = byName.get(indirect.name)}
                <span class="tag-chip implied" data-tag-type={indirectTag?.type ?? 'general'} title={t('tags.carriedBy', { via: indirect.via.map(v => labels.get(v) ?? v).join(', ') })}>
                  {indirectTag?.label ?? indirect.name}
                </span>
              {/each}
              {#if candidates.length}
                <select
                  class="input add-imp"
                  aria-label={t('tags.addImply', { name: tag.label })}
                  disabled={busy}
                  value=""
                  onchange={event => {
                    const target = event.currentTarget.value
                    event.currentTarget.value = ''
                    if (target) mutate({ action: 'imply', name: tag.name, target, rev: tag.rev })
                  }}
                >
                  <option value="">+ {t('tags.imply')}</option>
                  {#each arrangeTagsByType(candidates) as cGroup (cGroup.type)}
                    <optgroup label={t(`tagType.${cGroup.type}`)}>
                      {#each cGroup.tags as candidate (candidate.name)}
                        <option value={candidate.name}>{candidate.label}</option>
                      {/each}
                    </optgroup>
                  {/each}
                </select>
              {/if}
            </div>
          </div>
        {/each}
      </div>
    </section>
  {/each}

  {#if changes.length}
    <section class="changes">
      <h2>{t('tags.changes')}</h2>
      <ul>
        {#each changes as change (change.id)}
          {@const detail = changeDetail(change)}
          <li>
            <span class="kind">{t(`tags.change.${change.kind}`)}</span>
            <strong>{labels.get(change.name) ?? change.name}</strong>
            {#if detail}<span class="detail">{detail}</span>{/if}
            <span class="meta">
              {#if change.by_id}<a href={href(`/u/${change.by_id}`)}>{change.by_name ?? change.by_id}</a>{/if}
              · {when(change.at)}
            </span>
            {#if undoable.has(change.id)}
              <button type="button" class="text-button" disabled={busy} onclick={() => mutate({ action: 'undo', id: change.id })}>
                {t('tags.undo')}
              </button>
            {/if}
          </li>
        {/each}
      </ul>
    </section>
  {/if}
</div>

<style>
  .board { display: grid; grid-template-columns: minmax(0, 1fr); gap: 22px }
  .board-head { display: flex; flex-wrap: wrap; gap: 10px; justify-content: space-between; align-items: center }
  .create-bar { display: flex; flex-wrap: wrap; gap: 8px; flex: 1 1 260px; min-inline-size: 0 }
  .create-bar .input { flex: 1 1 140px; inline-size: auto; min-inline-size: 0 }
  .banner-error { margin: 0; padding: 10px 12px; border: 1px solid var(--wrong); border-radius: 7px; background: var(--wrong-light); color: var(--wrong); font-size: 14px }
  .type-section { display: grid; gap: 10px }
  .type-section h2 { display: flex; align-items: center; gap: 8px; margin: 0; font-size: 15px }
  .count { font-size: 13px; color: var(--muted); font-weight: 400 }
  .rows { display: grid; gap: 8px }
  .tag-row { display: grid; grid-template-columns: minmax(0, 1fr); gap: 8px; padding: 10px 12px; border: 1px solid var(--line); border-radius: 8px; background: var(--surface) }
  .row-main { display: flex; flex-wrap: wrap; gap: 10px; justify-content: space-between; align-items: center }
  .identity { display: flex; flex-wrap: wrap; min-inline-size: 0; align-items: center; gap: 8px }
  .slug { font-size: 12px; color: var(--muted) }
  .n { font-size: 12.5px; color: var(--muted); font-variant-numeric: tabular-nums }
  .controls { display: flex; flex-wrap: wrap; gap: 6px; align-items: center }
  .label-input { inline-size: min(150px, 100%); padding: 5px 8px }
  .type-select { inline-size: auto; max-inline-size: 100%; padding: 5px 8px }
  .implications { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; font-size: 12.5px }
  .imp-label { color: var(--muted) }
  .x { appearance: none; border: 0; background: none; color: inherit; cursor: pointer; padding: 0 2px; font-size: 14px; line-height: 1 }
  .add-imp { width: auto; min-height: 28px; padding: 2px 8px; font-size: 12.5px }
  .changes { display: grid; gap: 8px; padding-top: 8px; border-top: 1px solid var(--line) }
  .changes h2 { margin: 0; font-size: 15px }
  .changes ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px }
  .changes li { display: flex; flex-wrap: wrap; gap: 8px; align-items: baseline; font-size: 13px }
  .kind { color: var(--muted); min-width: 72px }
  .detail { color: var(--muted) }
  .meta { color: var(--muted); margin-inline-start: auto }
</style>
