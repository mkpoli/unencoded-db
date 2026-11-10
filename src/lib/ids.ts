// A description sequence as a person types it: the operators and the parts, with spaces taken out.
export const cleanIds = (text: string) => text.normalize('NFC').replace(/\s+/gu, '')

/** The IDS Workshop URL for a description, or its empty editor for none. */
export function workshopUrl(ids = '') {
  const base = 'https://ids.mkpo.li/'
  const sequence = cleanIds(ids)
  return /[./]/.test(sequence) ? `${base}?ids=${encodeURIComponent(sequence)}` : base + encodeURIComponent(sequence)
}
