import { COMPARISON_BOXES, COMPARISON_KINDS, splitCharacters, type Comparison } from '$lib/comparison-rows'

export const MAX_COMPARISONS = COMPARISON_BOXES * COMPARISON_KINDS.length

/** Read the add form's relationship boxes: one character per box, ten boxes per kind. */
export function readComparisons(form: FormData) {
  const rows: Comparison[] = []
  let invalid = false
  for (const kind of COMPARISON_KINDS) {
    const boxes = form.getAll(`comparison_${kind}`)
    if (boxes.length > COMPARISON_BOXES) invalid = true
    for (const box of boxes) {
      if (typeof box !== 'string') { invalid = true; continue }
      const character = box.normalize('NFC').trim()
      if (!character) continue
      // A box that holds more than one character is refused but kept, so the
      // reader can correct it after the failed submission.
      if (splitCharacters(character).length !== 1) invalid = true
      if (!rows.some(row => row.character === character && row.relationship === kind)) rows.push({ character, relationship: kind })
    }
  }
  return { rows, invalid }
}
