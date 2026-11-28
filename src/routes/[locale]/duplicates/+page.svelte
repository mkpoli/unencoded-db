<script lang="ts">
  import IdsGlyph from '$lib/components/IdsGlyph.svelte'
  import Seo from '$lib/components/Seo.svelte'
  import { recordCode } from '$lib/code'
  import { scriptName } from '$lib/scripts'
  import { href, locale, media, t } from '$lib/t'
  let { data } = $props()
</script>

<Seo title={t('duplicates.title')} />
<div class="page stack">
  <h1>{t('duplicates.title')}</h1>
  {#if data.groups.length}
    <div class="groups">
      {#each data.groups as group (group.id)}
        <section class="group" aria-labelledby="group-{group.id}">
          <header>
            <h2 id="group-{group.id}">{group.ids.join(' ')}</h2>
            <span class="badge" class:unifiable={!group.same}>{t(group.same ? 'duplicate.alike' : 'browse.unifiable')}</span>
          </header>
          <div class="records">
            {#each group.records as record (record.id)}
              <article class="record">
                <a class="plates" href={href(`/${recordCode(record.id)}`)} aria-label={t('entry.record', { id: recordCode(record.id) })}>
                  <span class="plate">{#if record.ids}<IdsGlyph ids={record.ids} layout={record.layout} path={data.glyphs?.[record.id]} />{/if}</span>
                  <span class="plate">{#if record.cover_key}<img src={media(record.cover_key)} alt="" loading="lazy" decoding="async" />{:else}<span class="blank">{t('browse.noImage')}</span>{/if}</span>
                </a>
                <div class="about"><a class="code" href={href(`/${recordCode(record.id)}`)}>{recordCode(record.id)}</a><span class="badge">{scriptName(locale(), record.script, record.script_other)}</span><span class="count">{t(record.sightings === 1 ? 'browse.sighting' : 'browse.sightings', { n: record.sightings })}</span></div>
              </article>
            {/each}
          </div>
          <div class="compare">
            {#each group.pairs as [earlier, later] (`${earlier}.${later}`)}<a class="button" href={href(`/${recordCode(later)}/duplicate?of=${earlier}`)}>{t('duplicate.compare')} <span class="code">{recordCode(earlier)} · {recordCode(later)}</span></a>{/each}
          </div>
        </section>
      {/each}
    </div>
  {:else if data.next === null}
    <p class="empty muted">{t('duplicates.empty')}</p>
  {/if}
  {#if data.next !== null}<a class="button more" href="?after={data.next}">{t('browse.more')}</a>{/if}
</div>

<style>
  .groups { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(480px, 100%), 1fr)); gap: 20px }
  .group { display: flex; flex-direction: column; gap: 12px; min-width: 0; padding: 16px; border: 1px solid var(--line); border-radius: 10px; background: var(--surface) }
  header { display: flex; flex-wrap: wrap; align-items: center; gap: 12px }
  h2 { margin: 0; font-size: 18px; font-weight: 400; line-height: 1.35; overflow-wrap: anywhere }
  .records { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px }
  .record { display: flex; flex-direction: column; gap: 8px; min-width: 0; container-type: inline-size }
  .plates { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; border-radius: 6px }
  .plate { display: grid; place-items: center; aspect-ratio: 1; min-width: 0; overflow: hidden; border-radius: 6px; background: var(--surface-tile); color: var(--ink) }
  .plates:hover .plate { outline: 2px solid var(--line-strong); outline-offset: 1px }
  img { display: block; width: 100%; height: 100%; object-fit: contain }
  .blank { padding: 8px; color: var(--muted); font-size: 12px; text-align: center }
  .about { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 8px }
  .about .code:hover { text-decoration: underline }
  .count { color: var(--muted); font-size: 12px }
  .compare { display: flex; flex-wrap: wrap; gap: 8px; margin-top: auto }
  .empty { padding: 48px 16px; text-align: center }
  .more { align-self: start }
  @container (max-width: 200px) { .plates { grid-template-columns: 1fr } }
</style>
