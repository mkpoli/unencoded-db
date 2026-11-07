<script lang="ts">
  import '../style.css'
  let { children } = $props()
</script>
<header><nav><a class="brand" href="/">珍字集覽</a><a href="/new">Add evidence</a></nav></header>
<main>{@render children()}</main>
<footer><a href="/third-party/README.md">Third-party notices</a></footer>
