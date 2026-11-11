import { cleanSourceUrl } from './source-url'

function clean(node: HTMLInputElement) {
  const next = cleanSourceUrl(node.value)
  if (next === node.value) return
  node.value = next
  // Let a bound value and anything watching the field see the cleaned link.
  node.dispatchEvent(new Event('input', { bubbles: true }))
}

/** Clean a pasted or left link field, so share tracking never reaches the form. */
export function cleanLinkInput(node: HTMLInputElement) {
  const pasted = () => setTimeout(() => clean(node))
  const left = () => clean(node)
  node.addEventListener('paste', pasted)
  node.addEventListener('change', left)
  return {
    destroy() {
      node.removeEventListener('paste', pasted)
      node.removeEventListener('change', left)
    },
  }
}
