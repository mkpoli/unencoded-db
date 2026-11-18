<script lang="ts">
  // Typed tags, implications, and collections a record is filed under.
  import CheckPill from './CheckPill.svelte'
  import {
    COLLECTIONS,
    TAG_LENGTH_MAX,
    TAG_TYPES,
    arrangeTagsByType,
    cleanTag,
    implicationClosure,
    tagErrorKey,
    tagLabels,
    tagLookup,
    type Tag,
    type TagType,
  } from '$lib/tags'
  import { t } from '$lib/t'

  let { tags = [], selected = [], collections = [] }: { tags?: Tag[]; selected?: string[]; collections?: string[] } = $props()

  const uid = $props.id()
  const GENERAL_PILL_LIMIT = 24
  const selectedKey = $derived(selected.join('\u0000'))

  let made = $state<Tag[]>([])
  let manual = $state<{ key: string; map: Record<string, boolean> }>({ key: '', map: {} })
  let typedTags = $state('')
  let draftName = $state('')
  let draftType = $state<TagType>('general')
  let draftImplies = $state('')
  let creating = $state(false)
  let addError = $state<string | null>(null)

  const known = $derived<Tag[]>([...tags, ...made.filter(item => !tags.some(other => other.name === item.name))])
  const all = $derived<Tag[]>([
    ...known,
    ...selected
      .filter(value => !known.some(item => item.name === value))
      .map((value, index) => ({
        name: value,
        label: value,
        type: 'general' as const,
        position: Number.MAX_SAFE_INTEGER - selected.length + index,
        rev: 0,
        n: 0,
        implies: [],
      })),
  ])
  const byName = $derived(tagLookup(all))
  const labels = $derived(tagLabels(all))

  const activeMap = $derived(manual.key === selectedKey ? manual.map : {})
  const isChecked = (name: string) => (name in activeMap ? activeMap[name] : selected.includes(name))
  function setChecked(name: string, value: boolean) {
    const base = manual.key === selectedKey ? manual.map : {}
    manual = { key: selectedKey, map: { ...base, [name]: value } }
  }

  const pillTags = $derived.by(() => {
    const selectedSet = new Set(selected)
    const generalCount = all.filter(item => item.type === 'general').length
    let shownGeneral = 0
    return all.filter(item => {
      if (item.type !== 'general' || selectedSet.has(item.name) || isChecked(item.name) || made.some(m => m.name === item.name)) return true
      if (generalCount <= 30 || shownGeneral < GENERAL_PILL_LIMIT) {
        shownGeneral++
        return true
      }
      return false
    })
  })
  const groups = $derived(arrangeTagsByType(pillTags))
  const allGroups = $derived(arrangeTagsByType(all))

  const activeDirect = $derived.by(() => {
    const set = new Set<string>()
    for (const item of all) if (isChecked(item.name)) set.add(item.name)
    for (const raw of typedTags.split(/[\s,，、|]+/u)) {
      const cleaned = cleanTag(raw, all)
      if (cleaned) set.add(cleaned)
    }
    return [...set]
  })
  const closure = $derived(implicationClosure(activeDirect, all))
  const impliedMap = $derived(new Map(closure.implied.map(item => [item.name, item.via])))

  async function addTag() {
    const name = draftName.trim()
    if (!name || creating) return
    creating = true
    addError = null
    try {
      const response = await fetch('/api/tags', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'create',
          name,
          type: draftType,
          implies: draftImplies ? [draftImplies] : [],
        }),
      })
      const payload = (await response.json().catch(() => null)) as { ok?: boolean; value?: string; tags?: Tag[]; error?: string } | null
      if (!response.ok || !payload?.ok || !payload.value) {
        addError = t(tagErrorKey(payload?.error, 'tag'))
        return
      }
      if (payload.tags) {
        const created = payload.tags.find(item => item.name === payload.value)
        if (created && !known.some(item => item.name === created.name)) {
          made = [...made, created]
        }
      }
      setChecked(payload.value, true)
      draftName = ''
      draftImplies = ''
    } finally {
      creating = false
    }
  }
</script>

<div class="stack">
  <input type="hidden" name="tags_present" value="1" />
  <input type="hidden" name="collections_present" value="1" />

  {#each groups as group (group.type)}
    <div class="type-group">
      <span class="type-heading" data-tag-type={group.type}>{t(`tagType.${group.type}`)}</span>
      <div class="pills">
        {#each group.tags as row (row.name)}
          {@const via = impliedMap.get(row.name)}
          <CheckPill
            name="tag"
            value={row.name}
            label={row.label}
            tagType={row.type}
            checked={isChecked(row.name)}
            implied={Boolean(via)}
            onchange={on => setChecked(row.name, on)}
          />
        {/each}
      </div>
    </div>
  {/each}

  {#if closure.implied.length}
    <div class="implied-row" aria-live="polite">
      <span class="implied-label">{t('tags.impliedAuto')}</span>
      {#each closure.implied as item (item.name)}
        {@const info = byName.get(item.name)}
        {@const viaNames = item.via.map(v => labels.get(v) ?? v).join(', ')}
        <span class="tag-chip implied" data-tag-type={info?.type ?? 'general'} title={t('tags.carriedBy', { via: viaNames })}>
          {labels.get(item.name) ?? item.name}
          <span class="via">← {viaNames}</span>
        </span>
      {/each}
    </div>
  {/if}

  <div class="field">
    <label for="{uid}-tags">{t('field.tags')}</label>
    <input
      id="{uid}-tags"
      class="input"
      type="text"
      name="tags"
      list="{uid}-tag-list"
      bind:value={typedTags}
      placeholder={t('field.tagInputHint')}
      autocomplete="off"
    />
    <datalist id="{uid}-tag-list">
      {#each all as item (item.name)}
        <option value={item.name}>{item.label !== item.name ? item.label : ''}</option>
      {/each}
    </datalist>
  </div>

  <details class="new-tag">
    <summary>{t('field.tagAdd')}</summary>
    <div class="new-grid">
      <div class="field">
        <label for="{uid}-new-name">{t('field.tagAdd')}</label>
        <input
          id="{uid}-new-name"
          class="input"
          type="text"
          name="tag_new"
          maxlength={TAG_LENGTH_MAX}
          bind:value={draftName}
          autocomplete="off"
        />
      </div>
      <div class="field">
        <label for="{uid}-new-type">{t('field.tagType')}</label>
        <select id="{uid}-new-type" class="input" name="tag_new_type" bind:value={draftType}>
          {#each TAG_TYPES as tagType (tagType)}
            <option value={tagType}>{t(`tagType.${tagType}`)}</option>
          {/each}
        </select>
      </div>
      <div class="field">
        <label for="{uid}-new-implies">{t('field.tagImplies')}</label>
        <select id="{uid}-new-implies" class="input" name="tag_new_implies" bind:value={draftImplies}>
          <option value="">{t('field.tagImpliesNone')}</option>
          {#each allGroups as group (group.type)}
            <optgroup label={t(`tagType.${group.type}`)}>
              {#each group.tags as item (item.name)}
                <option value={item.name}>{item.label}</option>
              {/each}
            </optgroup>
          {/each}
        </select>
      </div>
      <div class="new-action">
        <button type="button" class="button" disabled={creating || !draftName.trim()} onclick={addTag}>
          {t('tags.add')}
        </button>
      </div>
    </div>
    {#if addError}<p class="error-inline">{addError}</p>{/if}
  </details>

  <div class="type-group">
    <span class="type-heading">{t('field.collection')}</span>
    <div class="pills">
      {#each COLLECTIONS as collection (collection.slug)}
        <CheckPill name="collection" value={collection.slug} label={collection.label} checked={collections.includes(collection.slug)} />
      {/each}
    </div>
  </div>
</div>

<style>
  .stack { display: grid; grid-template-columns: minmax(0, 1fr); gap: 12px }
  .type-group { display: grid; grid-template-columns: minmax(0, 1fr); gap: 6px }
  .type-heading { font-size: 12px; font-weight: 600; color: var(--muted) }
  .type-heading[data-tag-type=region] { color: var(--tag-region-ink) }
  .type-heading[data-tag-type=language] { color: var(--tag-language-ink) }
  .type-heading[data-tag-type=form] { color: var(--tag-form-ink) }
  .type-heading[data-tag-type=domain] { color: var(--tag-domain-ink) }
  .type-heading[data-tag-type=meta] { color: var(--tag-meta-ink) }
  .pills { display: flex; flex-wrap: wrap; gap: 6px }
  .implied-row { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; padding: 8px 10px; border: 1px dashed var(--line); border-radius: 7px; background: var(--surface-sunken); font-size: 12.5px }
  .implied-label { color: var(--muted); font-weight: 500 }
  .via { font-size: 11.5px; opacity: 0.8 }
  .new-tag { container: new-tag / inline-size; border: 1px solid var(--line); border-radius: 7px; padding: 8px 12px }
  .new-tag summary { cursor: pointer; font-size: 13px; color: var(--muted); font-weight: 500 }
  .new-grid { display: grid; grid-template-columns: minmax(0, 1.3fr) minmax(0, 0.9fr) minmax(0, 1.2fr) auto; gap: 8px; align-items: end; margin-top: 10px }
  .new-action { display: flex; align-items: end }
  .error-inline { margin: 8px 0 0; font-size: 13px; color: var(--wrong) }
  @container new-tag (inline-size < 36rem) {
    .new-grid { grid-template-columns: minmax(0, 1fr) }
  }
</style>
