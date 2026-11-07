<script lang="ts">
  import '../style.css'
  import { page } from '$app/state'
  let { children } = $props()
</script>
<header><nav><a class="brand" href="/">珍字集覽</a><span class="nav-links"><a href="/new">Add evidence</a>{#if page.data.isModerator}<a href="/moderate">Moderation</a>{/if}</span></nav></header>
<main>{@render children()}</main>
<footer><a href="/third-party/README.md">Third-party notices</a></footer>
