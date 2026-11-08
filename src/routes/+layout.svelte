<script lang="ts">
  import '../style.css'
  let { data, children } = $props()
</script>
<header><nav><a class="brand" href="/">珍字集覽</a><div class="nav-actions"><a href="/new">Add evidence</a>{#if data.signedIn}<span>Glyph Atlas</span><form method="POST" action="/auth/sign-out"><button class="nav-button">Sign out</button></form>{:else if data.signInEnabled && data.hasSession}<form method="POST" action="/auth/sign-in"><button class="nav-button">Link Glyph Atlas account</button></form>{:else if data.signInEnabled}<form method="POST" action="/auth/prepare"><button class="nav-button">Sign in with Glyph Atlas</button></form>{/if}</div></nav></header>
<main>{@render children()}</main>
<footer><a href="/third-party/README.md">Third-party notices</a></footer>
