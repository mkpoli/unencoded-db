<script lang="ts">
  import RevisionFields from '$lib/components/RevisionFields.svelte'
  import Seo from '$lib/components/Seo.svelte'
  import { recordCode } from '$lib/code'
  import { href, locale, t, when } from '$lib/t'
  import { localized, tagLabels } from '$lib/tags'
  let { data, form } = $props()
  // A comment opens at itself, a change to evidence at that evidence, any other change and a thank at the record's history.
  const target = (notice: { kind: string; entry_id: number; sighting_id: number | null; comment_id: number | null }) => notice.comment_id ? `${href(`/${recordCode(notice.entry_id)}`)}#comment-${notice.comment_id}`
    : notice.sighting_id && notice.kind !== 'thank' && notice.kind !== 'remove' ? `${href(`/${recordCode(notice.entry_id)}`)}#sighting-${notice.sighting_id}` : href(`/${recordCode(notice.entry_id)}/history`)
  // Unread notices of hidden things are counted and not listed, so the count decides, not the list.
  const unread = $derived(!form?.read && data.unread > 0 && data.latest > 0)
  const labels = $derived(tagLabels(localized(data.tags, locale())))
  const tagTypes = $derived(new Map(data.tags.map(tag => [tag.name, tag.type])))
  const stop = (event: MouseEvent) => event.stopPropagation()
  let sent = 0
  $effect(() => {
    const upto = data.latest
    if (!unread || upto <= sent) return
    sent = upto
    const body = new FormData()
    body.set('upto', String(upto))
    void fetch('?', { method: 'POST', body, headers: { 'x-sveltekit-action': 'true' } }).catch(() => {})
  })
</script>

{#snippet line(notification: (typeof data.notifications)[number])}
  <div class="words">
    <div class="meta">
      {#if notification.by_name}<a class="text-link" href={href(`/u/${notification.by_id}`)} onclick={stop}>{notification.by_name}</a>{/if}
      <span>{t(notification.kind === 'comment' ? 'discussion.comment' : notification.kind === 'thank' ? 'notifications.thank' : `history.kind.${notification.kind}`)}</span>
      <a class="text-link record" href={target(notification)} onclick={stop}>{notification.ids || recordCode(notification.entry_id)}</a>
      {#if notification.kind === 'comment' && notification.sighting_id}<span class="badge">{t('discussion.about', { id: notification.sighting_id })}</span>{/if}
      <time datetime={notification.at}>{when(notification.at)}</time>
    </div>
    {#if notification.text}<p class="body">{notification.text}</p>{/if}
  </div>
{/snippet}

<Seo title={t('notifications.title')} />
<div class="page narrow stack">
  <h1>{t('notifications.title')}</h1>
  {#if !data.notifications.length}<p class="muted">{t('notifications.empty')}</p>{/if}
  {#if unread}<noscript><form method="POST"><input type="hidden" name="upto" value={data.latest} /><button class="button" type="submit">{t('notifications.markRead')}</button></form></noscript>{/if}
  {#if data.notifications.length}
    <ol class="notices">
      {#each data.notifications as notification (notification.id)}
        <li class:unread={!notification.read_at && !form?.read}>
          {#if notification.fields || notification.sightingFields}
            <details>
              <summary class="row">{@render line(notification)}<span class="toggle" aria-hidden="true"></span></summary>
              <div class="held">
                {#if notification.fields}<RevisionFields fields={notification.fields} {labels} {tagTypes} />{/if}
                {#if notification.sightingFields}<RevisionFields fields={notification.sightingFields} dates={data.dates} sighting />{/if}
              </div>
            </details>
          {:else}
            <div class="row">{@render line(notification)}</div>
          {/if}
        </li>
      {/each}
    </ol>
  {/if}
  {#if data.next}<a class="text-link" href={href(`/notifications?before=${data.next}`)}>{t('browse.more')}</a>{/if}
</div>

<style>
  .notices { display: flex; flex-direction: column; margin: 0; padding: 0; list-style: none; border: 1px solid var(--line); border-radius: 10px; background: var(--surface); overflow: hidden }
  .notices li { border-inline-start: 3px solid transparent }
  .row { display: flex; align-items: flex-start; gap: 12px; padding: 14px 20px; list-style: none }
  .row::-webkit-details-marker { display: none }
  summary.row { cursor: pointer }
  .words { display: flex; flex: 1 1 0; flex-direction: column; gap: 6px; min-width: 0 }
  .toggle { flex: 0 0 16px; color: var(--muted); font-size: 16px; line-height: 1.2; text-align: center }
  .toggle::before { content: '+' }
  details[open] .toggle::before { content: '−' }
  .held { padding: 18px 20px 20px; border-top: 1px solid var(--line); background: var(--surface-sunken) }
  .notices li + li { border-top: 1px solid var(--line) }
  .notices li.unread { border-inline-start-color: var(--accent); background: var(--accent-light) }
  .meta { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; font-size: 12.5px; color: var(--muted) }
  .meta time { font-variant-numeric: tabular-nums }
  .record { color: var(--ink); font-size: 15px }
  .body { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.6; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 3; line-clamp: 3; overflow: hidden }
  @media (max-width: 700px) { .row { padding: 12px 16px } .held { padding: 16px 16px 18px } }
</style>
