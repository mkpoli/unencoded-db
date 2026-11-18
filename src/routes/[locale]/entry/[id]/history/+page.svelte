<script lang="ts">
  import HistoryList from '$lib/components/HistoryList.svelte'
  import Seo from '$lib/components/Seo.svelte'
  import { href, t } from '$lib/t'
  import { recordCode } from '$lib/code'
  let { data, form } = $props()
</script>

<Seo title={t('history.title', { id: recordCode(data.id) })} image={href(`/entry/${data.id}/card.png?view=history`)} />
<div class="page narrow stack">
  <a class="text-link back" href={href(`/entry/${data.id}`)}>← {t('history.back')}</a>
  <h1>{t('history.title', { id: recordCode(data.id) })}</h1>
  {#if form?.error}<p class="notice bad" role="alert">{t(`error.${form.error}`)}</p>{/if}
  <HistoryList dates={data.dates} rows={data.rows} tags={data.tags} currentRev={data.rev} restore redact={Boolean(data.person?.moderator)} empty={t('history.empty')} next={data.next} />
</div>

<style>
  .back { align-self: start; color: var(--muted) }
</style>
