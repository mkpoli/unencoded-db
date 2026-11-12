<script lang="ts">
  // What a record states besides its descriptions: radical and strokes, the character it normalizes
  // to, IVD membership, encodings, readings, meanings, categories and related characters.
  import { untrack } from 'svelte'
  import { CLAIM_LIMITS, claimsOf, encodingsOf, relationsOf, valuesOf, type Claim } from '$lib/claims'
  import { t } from '$lib/t'
  import CategoryFields from './CategoryFields.svelte'
  import EncodingFields from './EncodingFields.svelte'
  import RelatedCharacters from './RelatedCharacters.svelte'
  import TextClaims from './TextClaims.svelte'
  import type { SightingOption } from './SightingChoice.svelte'
  import type { CharacterFacts } from '$lib/encoded'

  // `fill` is what is known of an encoded character typed as the description; it fills the fields left empty.
  let { claims = [], radical = null, strokes = null, sightings = null, fill = null }: { claims?: Claim[]; radical?: string | null; strokes?: number | null; sightings?: SightingOption[] | null; fill?: CharacterFacts | null } = $props()

  const uid = $props.id()
  const ivd = untrack(() => valuesOf(claims, 'ivd')[0] ?? '')
  let ivdStatus = $state(ivd === 'none' ? 'none' : ivd ? 'registered' : '')
  let radicalValue = $state(untrack(() => radical ?? ''))
  let strokesValue = $state<number | string>(untrack(() => strokes ?? ''))

  $effect(() => {
    if (!fill) return
    untrack(() => {
      if (!radicalValue && fill.radical) radicalValue = fill.radical
      if (strokesValue === '' && fill.strokes != null) strokesValue = fill.strokes
    })
  })
</script>

<div class="grid-2">
  <div class="field"><label for="{uid}-radical">{t('field.radical')}</label><input id="{uid}-radical" class="input" name="radical" maxlength="20" bind:value={radicalValue} autocomplete="off" /></div>
  <div class="field"><label for="{uid}-strokes">{t('field.strokes')}</label><input id="{uid}-strokes" class="input" name="strokes" type="number" min="0" max="199" bind:value={strokesValue} /></div>
  <div class="field"><label for="{uid}-normalizes">{t('field.normalizesTo')}</label><input id="{uid}-normalizes" class="input character" name="normalizes_to" maxlength={CLAIM_LIMITS.normalizes_to.length} value={valuesOf(claims, 'normalizes_to')[0] ?? ''} autocomplete="off" autocorrect="off" autocapitalize="none" spellcheck="false" /></div>
  <div class="field">
    <label for="{uid}-ivd">{t('field.ivd')}</label>
    <div class="ivd">
      <select id="{uid}-ivd" class="input" name="ivd_status" bind:value={ivdStatus}>
        <option value="">{t('field.ivdUnstated')}</option>
        <option value="registered">{t('field.ivdRegistered')}</option>
        <option value="none">{t('field.ivdNone')}</option>
      </select>
      {#if ivdStatus === 'registered'}<input class="input mono" name="ivd_sequence" maxlength="80" value={ivd === 'none' ? '' : ivd} placeholder="U+4E00 U+E0100" aria-label={t('field.ivdSequence')} autocomplete="off" autocorrect="off" autocapitalize="none" spellcheck="false" required />{/if}
    </div>
  </div>
</div>
<EncodingFields values={encodingsOf(claims)} code={fill?.code} />
<TextClaims kind="reading" values={claimsOf(claims, 'reading')} {sightings} fill={fill?.readings} />
<TextClaims kind="meaning" values={claimsOf(claims, 'meaning')} {sightings} fill={fill?.meaning ? [fill.meaning] : []} />
<CategoryFields genres={valuesOf(claims, 'genre')} collections={valuesOf(claims, 'collection')} tags={valuesOf(claims, 'tag')} />
<RelatedCharacters values={relationsOf(claims)} {sightings} fill={fill?.variants} />

<style>
  .character { font-size: 18px }
  .ivd { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.4fr); gap: 8px }
  .ivd:has(select:only-child) { grid-template-columns: minmax(0, 1fr) }
</style>
