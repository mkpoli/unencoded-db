<script lang="ts">
  import Seo from '$lib/components/Seo.svelte'
  import SightingCard from '$lib/components/SightingCard.svelte'
  import { recordCode } from '$lib/code'
  import { href, t } from '$lib/t'
  let { data, form } = $props()
  const title = $derived(t('sighting.removeTitle', { id: recordCode(data.id) }))
  // Evidence that stands alone, as a load saw it or as the save found it.
  const only = $derived(data.only || form?.error === 'only')
</script>

<Seo {title} />
<div class="page narrow stack">
  <a class="text-link back" href={href(`/entry/${data.id}#sighting-${data.sighting.id}`)}>← {t('history.back')}</a>
  <h1>{title}</h1>
  {#if only}<p class="notice bad" role="alert">{t('error.only')}</p>
  {:else if form?.error}<p class="notice bad" role="alert">{t(`error.${form.error}`)}</p>{/if}
  <SightingCard sighting={data.sighting} />
  {#if !only}
    <form class="stack" method="POST">
      <input type="hidden" name="rev" value={data.sighting.rev} />
      <div class="field"><label for="summary">{t('sighting.removeReason')}</label><input id="summary" class="input" name="summary" maxlength="500" value={form?.summary ?? ''} /></div>
      <div class="row">
        <button class="button danger" type="submit" disabled={form?.error === 'conflict'}>{t('sighting.remove')}</button>
        <a class="button" href={href(`/entry/${data.id}#sighting-${data.sighting.id}`)}>{t('form.cancel')}</a>
      </div>
    </form>
  {/if}
</div>

<style>
  .back { align-self:start; color:var(--muted) }
</style>
