<script lang="ts">
  import HistoryList from '$lib/components/HistoryList.svelte'
  import Seo from '$lib/components/Seo.svelte'
  import { day, href, t } from '$lib/t'
  let { data, form } = $props()
</script>

<Seo title={t('person.title', { name: data.person.name })} />
<div class="page narrow stack">
  <div class="stack intro">
    <h1>{t('person.title', { name: data.person.name })}</h1>
    <p class="muted small">{t('person.since', { date: day(data.person.created_at) })}</p>
  </div>
  {#if data.mergeable}
    <form class="merge" method="POST" action="?/merge">
      <label for="merge-into">{t('person.mergeInto')}</label>
      <div class="row">
        <input id="merge-into" class="input" name="into" required autocomplete="off" value={form?.into ?? ''} />
        {#if form && 'target' in form && form.target}
          <input type="hidden" name="confirm" value={form.target.id} />
          <button class="button danger">{t('person.mergeConfirm', { name: form.target.name })}</button>
        {:else}
          <button class="button">{t('person.merge')}</button>
        {/if}
      </div>
      {#if form && 'target' in form && form.target}<p class="small muted"><a class="text-link" href={href(`/u/${form.target.id}`)}>{form.target.name}</a> · {t(form.target.changes === 1 ? 'people.change' : 'people.changes', { n: form.target.changes })}</p>{/if}
      {#if form && 'merge' in form && form.merge}<p class="notice bad" role="alert">{t(({ missing: 'person.mergeMissing', self: 'person.mergeSelf', banned: 'person.mergeBanned' } as const)[form.merge])}</p>{/if}
    </form>
  {/if}
  <HistoryList dates={data.dates} rows={data.rows} tags={data.tags} showEntry showActor={false} empty={t('person.empty')} next={data.next} />
</div>

<style>
  .intro { gap: 4px }
  .merge { display: grid; gap: 6px; max-width: 560px }
  .merge .row { display: flex; gap: 8px }
  .merge .input { flex: 1 1 0; min-width: 0 }
</style>
