<script lang="ts">
  // The community's chats and the contact page in one line, on every page that can be reached from it.
  import LinkMark from './LinkMark.svelte'
  import { CHATS, contactPage } from '$lib/community'
  import { locale, t } from '$lib/t'
</script>

{#each CHATS as chat (chat.name)}<span class="chat"><a class="text-link" href={chat.href} target="_blank" rel="noopener"><LinkMark name={chat.mark} />{chat.name}</a></span>{' · '}{/each}<span class="chat"><a class="text-link" href={contactPage(locale())} target="_blank" rel="noopener">{t('footer.contact')}</a></span>

<style>
  .chat { white-space: nowrap }
</style>
