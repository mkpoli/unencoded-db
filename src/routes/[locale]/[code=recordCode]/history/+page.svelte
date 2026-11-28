<script lang="ts">
  import HistoryList from '$lib/components/HistoryList.svelte'
  import Seo from '$lib/components/Seo.svelte'
  import { href, t } from '$lib/t'
  import { recordCode } from '$lib/code'
  let { data, form } = $props()
</script>

<Seo title={t('history.title', { id: recordCode(data.id) })} image={href(`/${recordCode(data.id)}/card.png?view=history&v=${encodeURIComponent(data.updated_at)}`)} />
<div class="page narrow stack">
  <a class="text-link back" href={href(`/${recordCode(data.id)}`)}>← {t('history.back')}</a>
  <h1>{t('history.title', { id: recordCode(data.id) })}</h1>
  {#if form && 'error' in form}<p class="notice bad" role="alert">{t(`error.${form.error}`)}</p>{/if}
  {#if data.removed.length}
    <section class="removed" aria-labelledby="removed">
      <h2 id="removed">{t('history.removedEvidence')}</h2>
      <ul>
        {#each data.removed as sighting (sighting.id)}
          <li>
            <span class="name"><span class="muted">#{sighting.id}</span> {sighting.name}</span>
            <form method="POST" action="?/putBack">
              <input type="hidden" name="sighting" value={sighting.id} />
              <button class="button small" type="submit" aria-label="{t('sighting.putBack')} #{sighting.id}">{t('sighting.putBack')}</button>
            </form>
            <a class="text-link small" href={href(`/${recordCode(data.id)}/report?sighting=${sighting.id}`)} aria-label="{t('entry.report')} #{sighting.id}">{t('entry.report')}</a>
          </li>
        {/each}
      </ul>
    </section>
  {/if}
  <HistoryList dates={data.dates} rows={data.rows} tags={data.tags} currentRev={data.rev} duplicates={data.duplicates} restore thanked={form && 'thanked' in form && form.thanked ? [...data.thanked, form.thanked] : data.thanked} viewer={data.person?.id ?? null} thank redact={Boolean(data.person?.moderator)} empty={t('history.empty')} next={data.next} />
</div>

<style>
  .back { align-self: start; color: var(--muted) }
  .removed { display: flex; flex-direction: column; gap: 8px; padding: 16px 20px; border: 1px solid var(--line); border-radius: 10px; background: var(--surface) }
  .removed h2 { margin: 0; font-size: 14px; font-weight: 600 }
  .removed ul { margin: 0; padding: 0; list-style: none }
  .removed li { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 14px; padding: 6px 0 }
  .removed .name { flex: 1 1 160px; min-width: 0; overflow-wrap: anywhere }
</style>
