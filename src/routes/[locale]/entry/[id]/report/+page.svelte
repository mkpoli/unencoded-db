<script lang="ts">
  import Seo from '$lib/components/Seo.svelte'
  import { href, t } from '$lib/t'
  let { data, form } = $props()
</script>

<Seo title={t('report.title')} />
<div class="page narrow stack">
  <a class="text-link back" href={href(`/entry/${data.target.entry}`)}>← {t('history.back')}</a>
  <h1>{t('report.title')}</h1>
  {#if form?.sent}
    <p role="status">{t('report.sent')}</p>
  {:else}
    <h2>{t('duplicate.title')}</h2>
    <form method="POST" action={`${href(`/entry/${data.target.entry}/duplicate`)}?/merge`} class="row find">
      <label class="sr-only" for="of">{t('duplicate.of')}</label>
      <input class="input" id="of" name="of" placeholder={t('duplicate.of')} required />
      <button class="button primary" type="submit">{t('duplicate.merge')}</button>
    </form>
    <p class="muted">{t('report.hint')}</p>
    {#if form?.error}<p class="notice bad" role="alert">{t(`error.${form.error}`)}</p>{/if}
    <form method="POST" class="stack">
      <div class="field">
        <label for="reason">{t('error.reason')}</label>
        <textarea class="input" id="reason" name="reason" rows="5" maxlength="2000" required>{form?.reason ?? ''}</textarea>
      </div>
      <div><button class="button primary" type="submit">{t('report.send')}</button></div>
    </form>
  {/if}
</div>
<style>
  .back { align-self: start; color: var(--muted) }
  h2 { font-size: 16px; font-weight: 600 }
  .find .input { flex: 1 1 0; width: auto; min-width: 0 }
</style>
