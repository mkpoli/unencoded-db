<script lang="ts" module>
  // ids-input's field and its catalogue for the page's language, fetched once, when a form first shows a
  // description.
  import { idsMessages } from '$lib/ids-messages'
  type Kit = { Field: typeof import('./IdsSequenceField.svelte').default; messages: Record<string, string> | undefined }
  const asked = new Map<string, Promise<Kit>>()
  const ready = new Map<string, Kit>()
  function load(locale: string) {
    let kit = asked.get(locale)
    if (!kit) {
      kit = Promise.all([import('./IdsSequenceField.svelte'), idsMessages(locale)]).then(([field, messages]) => ({ Field: field.default, messages }))
      asked.set(locale, kit)
      kit.then(found => ready.set(locale, found), () => asked.delete(locale))
    }
    return kit
  }
</script>

<script lang="ts">
  // One description of a character, sent as an `ids` value. It is a plain text input until ids-input's
  // sequence field has loaded and takes its place, so the form works before scripts run and without them.
  import { onMount, tick } from 'svelte'
  import { IDS_LENGTH_MAX } from '$lib/ids'
  import { locale } from '$lib/t'

  let { value = $bindable(''), label, titled = false, compact = false }: { value?: string; label: string; titled?: boolean; compact?: boolean } = $props()

  const uid = $props.id()
  const at = locale()
  const placeholder = '⿰亻⿱七木'
  // Once loaded, the field is there from the start. A page drawn on the server has not loaded it yet.
  let kit = $state.raw<Kit | null>(ready.get(at) ?? null)
  let plain = $state<HTMLInputElement>()
  let field = $state<{ focus(): void }>()

  // The field is fetched when the input first shows (a folded form does not ask for it), and takes the
  // input's place between keystrokes, never in the middle of an IME composition.
  let composing = false
  onMount(() => {
    if (kit || !plain) return
    let live = true
    const input = plain
    const swap = async (found: Kit) => {
      if (!live) return
      if (composing) { input.addEventListener('compositionend', () => queueMicrotask(() => swap(found)), { once: true }); return }
      // What was typed before the field loaded goes with it, and so does the focus.
      const focused = document.activeElement === input
      value = input.value
      kit = found
      if (focused) { await tick(); field?.focus() }
    }
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return
      observer.disconnect()
      load(at).then(swap, () => {})
    }, { rootMargin: '400px' })
    observer.observe(input)
    return () => { live = false; observer.disconnect() }
  })

  export const focus = () => (field ?? plain)?.focus()
</script>

{#if kit}
  <kit.Field bind:this={field} bind:value {label} {titled} {compact} messages={kit.messages} locale={at} {placeholder} />
  <input type="hidden" name="ids" {value} />
{:else}
  <div class="plain" class:compact>
    {#if titled}<label for="{uid}-ids">{label}</label>{/if}
    <input bind:this={plain} id="{uid}-ids" class="input" name="ids" bind:value aria-label={titled ? undefined : label} maxlength={IDS_LENGTH_MAX} {placeholder}
      oncompositionstart={() => composing = true} oncompositionend={() => composing = false}
      lang="ja" autocomplete="off" autocorrect="off" autocapitalize="none" spellcheck="false" />
  </div>
{/if}

<style>
  /* The same box as the sequence field, so the page does not move when one replaces the other. */
  .plain { display: flex; flex-direction: column; gap: 6px; min-width: 0 }
  .plain label { font-weight: 500 }
  .plain input { min-height: 0; padding: 6px 10px; border-radius: 8px; font-size: 22px; line-height: 1.5 }
  .plain.compact input { font-size: 18px }
</style>
