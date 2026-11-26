<script lang="ts">
  // What identifies a character besides its descriptions, as two lines of its sheet: the radical and stroke
  // count it is indexed by, and where it stands among encoded characters (its codes, the character it is
  // equivalent to, IVD membership). A line opens by itself when the record states something on it.
  import { untrack } from 'svelte'
  import { CLAIM_LIMITS, documentsOf, encodingsOf, valuesOf, type Claim } from '$lib/claims'
  import { descriptionStrokes, type Fill } from '$lib/encoded'
  import { t } from '$lib/t'
  import DocumentFields from './DocumentFields.svelte'
  import EncodingFields from './EncodingFields.svelte'
  import FactLine from './FactLine.svelte'

  // `fill` is what the form takes from an encoded character typed as the description; it fills the fields
  // left empty and opens their lines.
  // `ids` is the description being typed; the sum of its parts' strokes is offered as the count's placeholder.
  let { claims = [], radical = null, strokes = null, fill = null, ids = '', anchor }: { anchor?: string; claims?: Claim[]; radical?: string | null; strokes?: number | null; fill?: Fill | null; ids?: string } = $props()

  const uid = $props.id()
  const ivd = untrack(() => valuesOf(claims, 'ivd')[0] ?? '')
  let ivdStatus = $state(ivd === 'none' ? 'none' : ivd ? 'registered' : '')
  let ivdSequence = $state(ivd === 'none' ? '' : ivd)
  let radicalValue = $state(untrack(() => radical ?? ''))
  let strokesValue = $state<number | string>(untrack(() => strokes ?? ''))
  let codes = $state<string[]>([])
  let docs = $state<string[]>([])

  const counted = $derived(strokesValue !== '' && strokesValue != null)
  const indexed = $derived(Boolean(radicalValue.trim()) || counted)
  const encoded = $derived([
    ...codes,
    ...(ivdStatus === 'none' ? [`${t('field.ivd')} ${t('field.ivdNone')}`] : ivdStatus === 'registered' ? [`${t('field.ivd')} ${ivdSequence.trim()}`.trim()] : []),
  ])
  let indexOpen = $state(untrack(() => indexed))
  let encodedOpen = $state(untrack(() => claims.some(claim => claim.kind === 'encoding' || claim.kind === 'ivd')))
  let docsOpen = $state(untrack(() => claims.some(claim => claim.kind === 'document')))

  // An estimate only: a part can take fewer strokes inside a character than alone. It is offered in the
  // empty field and never sent.
  let sum = $state<number | null>(null)
  $effect(() => {
    const described = ids
    let live = true
    descriptionStrokes(described).then(total => { if (live) sum = total })
    return () => { live = false }
  })

  // What the last fill wrote; a field still holding it follows the next fill.
  let given: { radical: string | null; strokes: number | null } = { radical: null, strokes: null }
  $effect(() => {
    if (!fill) return
    untrack(() => {
      if (given.radical !== null && radicalValue === given.radical) radicalValue = ''
      if (given.strokes !== null && strokesValue === given.strokes) strokesValue = ''
      given = { radical: null, strokes: null }
      if (!radicalValue && fill.radical) { radicalValue = given.radical = fill.radical; indexOpen = true }
      if (strokesValue === '' && fill.strokes != null) { strokesValue = given.strokes = fill.strokes; indexOpen = true }
      if (fill.code) encodedOpen = true
    })
  })
</script>

<FactLine id={anchor} label={t('field.radicalStrokes')} stated={indexed} bind:open={indexOpen}>
  {#snippet value()}<span>{radicalValue.trim() || '—'}</span><span class="muted">·</span><span>{counted ? strokesValue : '—'}</span>{/snippet}
  <div class="pair">
    <div class="field"><label for="{uid}-radical">{t('field.radical')}</label><input id="{uid}-radical" class="input" name="radical" maxlength="20" bind:value={radicalValue} autocomplete="off" /></div>
    <div class="field"><label for="{uid}-strokes">{t('field.strokes')}</label><input id="{uid}-strokes" class="input" name="strokes" type="number" min="0" max="199" placeholder={sum === null ? undefined : `≈ ${sum}`} bind:value={strokesValue} /></div>
  </div>
</FactLine>
<FactLine label={t('field.encodings')} stated={encoded.length > 0} bind:open={encodedOpen}>
  {#snippet value()}{#each encoded as item}<span class="tag">{item}</span>{/each}{/snippet}
  <EncodingFields values={encodingsOf(claims)} code={fill?.code} bind:stated={codes} />
  <div class="pair">
    <div class="field">
      <label for="{uid}-ivd">{t('field.ivd')}</label>
      <select id="{uid}-ivd" class="input" name="ivd_status" bind:value={ivdStatus}>
        <option value="">{t('field.ivdUnstated')}</option>
        <option value="registered">{t('field.ivdRegistered')}</option>
        <option value="none">{t('field.ivdNone')}</option>
      </select>
      {#if ivdStatus === 'registered'}<input class="input mono" name="ivd_sequence" maxlength="80" bind:value={ivdSequence} placeholder="U+4E00 U+E0100" aria-label={t('field.ivdSequence')} autocomplete="off" autocorrect="off" autocapitalize="none" spellcheck="false" required />{/if}
    </div>
  </div>
</FactLine>
<FactLine label={t('field.documents')} stated={docs.length > 0} bind:open={docsOpen}>
  {#snippet value()}{#each docs as item}<span class="tag">{item}</span>{/each}{/snippet}
  <DocumentFields values={documentsOf(claims)} bind:stated={docs} />
</FactLine>

<style>
  .pair { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: start; gap: 12px }
  .tag { padding: 1px 8px; border: 1px solid var(--line); border-radius: 999px; font-size: 12.5px }
</style>
