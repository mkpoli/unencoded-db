<script lang="ts">
  import { onMount, untrack } from 'svelte'
  import CharacterFields from '$lib/components/CharacterFields.svelte'
  import CheckPill from '$lib/components/CheckPill.svelte'
  import IdentityFields from '$lib/components/IdentityFields.svelte'
  import Seo from '$lib/components/Seo.svelte'
  import SightingCard from '$lib/components/SightingCard.svelte'
  import SubmitBar from '$lib/components/SubmitBar.svelte'
  import { primaryLayoutOf, valuesOf } from '$lib/claims'
  import { recordCode } from '$lib/code'
  import { isDescription } from 'ids-input'
  import { cleanIds } from '$lib/ids'
  import type { Fill } from '$lib/encoded'
  import { href, t } from '$lib/t'
  let { data, form } = $props()
  const title = $derived(t('sighting.splitTitle', { id: recordCode(data.id) }))
  const only = $derived(data.only || form?.error === 'only')
  const descriptions = untrack(() => valuesOf(form?.values.claims ?? [], 'ids'))
  const layout = untrack(() => primaryLayoutOf(form?.values.claims ?? []))
  let primary = $state(descriptions[0] ?? '')
  let filled = $state<Fill | null>(null)
  let notice = $state<HTMLElement>()
  const described = $derived(isDescription(cleanIds(primary)))
  const there = (record: number) => href(`/entry/${data.id}/sighting/${data.sighting.id}/move?to=${record}`)
  onMount(() => { if (form?.error) notice?.focus() })
</script>

<Seo {title} />
<div class="page narrow stack">
  <a class="text-link back" href={href(`/entry/${data.id}#sighting-${data.sighting.id}`)}>← {t('history.back')}</a>
  <h1>{title}</h1>
  {#if only}<p class="notice bad" role="alert" tabindex="-1" bind:this={notice}>{t('error.only')}</p>
  {:else if form?.error}<p class="notice bad" role="alert" tabindex="-1" bind:this={notice}>{t(`error.${form.error}`, form.error === 'described' ? { id: recordCode(form.described!) } : {})}{#if form.error === 'described'}{' '}<a class="text-link" href={there(form.described!)}>{t('sighting.moveThere')}</a>{/if}</p>{/if}
  <SightingCard sighting={data.sighting} />
  {#if !only}
    <form method="POST" class="stack">
      <input type="hidden" name="rev" value={data.sighting.rev} />
      <section class="panel">
        <CharacterFields values={descriptions} {layout} bind:primary exclude={data.id} placed={id => href(`/entry/${data.id}/sighting/${data.sighting.id}/move?to=${id}`)} onfill={facts => filled = facts}>
          <div class="sheet">
            <IdentityFields claims={form?.values.claims ?? []} radical={form?.values.radical ?? null} strokes={form?.values.strokes ?? null} fill={filled} ids={primary} />
          </div>
        </CharacterFields>
      </section>
      {#if !described}<div class="undescribed"><CheckPill name="undescribed" value="1" label={t('sighting.undescribed')} checked={form?.error === 'undescribed' ? false : undefined} /></div>{/if}
      <div class="field"><label for="summary">{t('sighting.removeReason')}</label><input id="summary" class="input" name="summary" maxlength="500" value={form?.summary ?? ''} /></div>
      {#if form?.error === 'conflict'}<div class="row"><button class="button" type="submit" disabled>{t('sighting.split')}</button><a class="button" href={href(`/entry/${data.id}#sighting-${data.sighting.id}`)}>{t('form.cancel')}</a></div>{:else}<SubmitBar label={t('sighting.split')} cancel={href(`/entry/${data.id}#sighting-${data.sighting.id}`)} />{/if}
    </form>
  {/if}
</div>

<style>
  .back { align-self:start; color:var(--muted) }
  .panel { padding:20px; border:1px solid var(--line); border-radius:10px; background:var(--surface) }
  .undescribed { align-self:start }
  .sheet { display:flex; flex-direction:column; gap:10px; padding-top:10px; border-top:1px dashed var(--line) }
  @media(max-width:700px) { .panel { padding:16px } }
</style>
