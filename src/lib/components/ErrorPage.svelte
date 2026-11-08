<script lang="ts">
  import { localizedHref, t, type Locale } from '$lib/i18n'

  let { locale, status }: { locale: Locale; status: number } = $props()
  const moderation = $derived(status === 409)
  const message = $derived(status === 404 ? t(locale, 'error.notFound') : moderation ? t(locale, 'error.changed') : t(locale, 'error.title'))
  const home = $derived(moderation ? localizedHref(locale, '/moderate') : localizedHref(locale))
</script>

<svelte:head><title>{message} · {t(locale, 'app.name')}</title></svelte:head>
<div class="error-page">
  <p class="error-status">{status}</p>
  <h1>{message}</h1>
  <a class="secondary" href={home}>{moderation ? t(locale, 'moderate.back') : t(locale, 'error.home')}</a>
</div>
