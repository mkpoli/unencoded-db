<script lang="ts">
  import { page } from '$app/state'
  import { href, t } from '$lib/t'
  const known = $derived(page.error?.message)
  const message = $derived(page.status === 404 ? t('error.notFound') : known === 'slow' || known === 'paused' || known === 'banned' ? t(`error.${known}`) : t('error.title'))
</script>

<div class="page narrow stack">
  <h1>{page.status}</h1>
  <p>{message}</p>
  <p><a class="text-link" href={href()}>{t('error.home')}</a></p>
</div>
