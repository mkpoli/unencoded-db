<script lang="ts">
  import { page } from '$app/state'
  import Seo from '$lib/components/Seo.svelte'
  import { t } from '$lib/t'
  let { data } = $props()
  const n = (count: number) => new Intl.NumberFormat(page.params.locale).format(count)
</script>

<Seo data={data.structured} title={t('data.title')} description={t('data.intro')} />
<div class="page narrow stack data-page">
  <header class="stack head">
    <h1>{t('data.title')}</h1>
    <p class="intro">{t('data.intro')}</p>
  </header>

  <div class="downloads">
    <section class="download">
      <span class="kind">JSON</span>
      <h2>{t('data.records')}</h2>
      <p class="what">{t('data.jsonWhat')}</p>
      <a class="button primary" href="/api/export?format=json" download aria-label={`${t('data.download')}: ${t('data.json')}`}>{t('data.download')}</a>
    </section>
    <section class="download">
      <span class="kind">CSV</span>
      <h2>{t('data.evidence')}</h2>
      <p class="what">{t('data.csvWhat')}</p>
      <a class="button" href="/api/export?format=csv" download aria-label={`${t('data.download')}: ${t('data.csv')}`}>{t('data.download')}</a>
    </section>
    <section class="download">
      <span class="kind">CSV</span>
      <h2>{t('data.media')}</h2>
      <p class="what">{t('data.mediaWhat')}</p>
      <a class="button" href="/api/export?format=media" download aria-label={`${t('data.download')}: ${t('data.media')}`}>{t('data.download')}</a>
    </section>
  </div>

  <dl class="counts">
    <div><dt>{t('data.records')}</dt><dd>{n(data.counts.records)}</dd></div>
    <div><dt>{t('data.evidence')}</dt><dd>{n(data.counts.evidence)}</dd></div>
    <div><dt>{t('data.licenseTitle')}</dt><dd><a class="text-link" href="https://creativecommons.org/licenses/by-sa/4.0/" rel="license noopener" target="_blank">CC BY-SA 4.0</a></dd></div>
  </dl>
  <p class="license-note">{t('data.license')}</p>

  <section class="stack section">
    <h2>{t('data.citeTitle')}</h2>
    <p>{t('data.cite')}</p>
  </section>
  <section class="stack section">
    <h2>{t('data.apiTitle')}</h2>
    <p>{t('data.api')}</p>
    <div class="row"><a class="text-link" href="/api/entries?limit=200">{t('data.paged')}</a></div>
  </section>
</div>

<style>
  .data-page { gap: 28px }
  .head { gap: 8px }
  .intro { max-width: 62ch; color: var(--muted); font-size: 15px }
  .downloads { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px }
  .download { display: flex; flex-direction: column; gap: 7px; padding: 18px; border: 1px solid var(--line); border-radius: 12px; background: var(--surface) }
  .kind { align-self: flex-start; padding: 1px 7px; border-radius: 4px; background: var(--surface-sunken); color: var(--accent); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 10.5px; font-weight: 600; letter-spacing: .08em }
  .download h2 { font-size: 17px }
  .what { flex: 1; color: var(--muted); font-size: 13px; line-height: 1.5 }
  .download .button { align-self: flex-start; margin-top: 4px }
  .counts { display: flex; flex-wrap: wrap; margin: 0; border-block: 1px solid var(--line) }
  .counts > div { flex: 1 1 150px; padding: 13px 0 }
  .counts > div + div { padding-inline-start: 24px; border-inline-start: 1px solid var(--line) }
  .counts dt { color: var(--muted); font-size: 12px }
  .counts dd { margin: 0; font-size: 20px; font-weight: 600; font-variant-numeric: tabular-nums }
  .license-note { margin-top: -10px; color: var(--muted); font-size: 12.5px }
  .section { max-width: 70ch; gap: 6px }
  .section p { color: var(--muted) }
  @media (max-width: 760px) {
    .downloads { grid-template-columns: minmax(0, 1fr) }
    .counts > div { flex-basis: 100% }
    .counts > div + div { padding-inline-start: 0; border-inline-start: 0; border-block-start: 1px solid var(--line) }
  }
</style>
