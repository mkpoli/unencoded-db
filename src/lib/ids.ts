// A description sequence as a person types it: the operators and the parts, with spaces taken out.
export const cleanIds = (text: string) => text.normalize('NFC').replace(/\s+/gu, '')

export const IDS_MAX = 20
export const IDS_LENGTH_MAX = 200
/** Room for the longest field a valid list can produce. */
export const IDS_FIELD_MAX = IDS_MAX * IDS_LENGTH_MAX + (IDS_MAX - 1) * 2

/** One character may be described more than one way. A field separates the sequences with commas;
 * the stored value keeps the same order separated by spaces. The first description draws the glyph. */
export function splitIds(text: string | null | undefined): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const part of (text ?? '').split(/[\s,，、]+/u)) {
    const sequence = cleanIds(part)
    if (!sequence || seen.has(sequence)) continue
    seen.add(sequence)
    out.push(sequence)
  }
  return out
}

/** A stored value for these descriptions, or null when there are none. */
export function joinIds(values: Iterable<string>): string | null {
  const sequences = splitIds([...values].join(' '))
  return sequences.length ? sequences.join(' ') : null
}

/** Several descriptions as a form field shows them. */
export function formatIds(text: string | null | undefined): string {
  return splitIds(text).join(', ')
}

/** The description whose glyph the record draws. */
export function primaryIds(text: string | null | undefined): string | null {
  return splitIds(text)[0] ?? null
}

/** The IDS Workshop URL for a description, or its empty editor for none. */
export function workshopUrl(ids = '') {
  const base = 'https://ids.mkpo.li/'
  const sequence = cleanIds(ids)
  return /[./]/.test(sequence) ? `${base}?ids=${encodeURIComponent(sequence)}` : base + encodeURIComponent(sequence)
}
