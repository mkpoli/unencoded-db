// A description sequence as a person types it: the operators and the parts, with spaces taken out.
export const cleanIds = (text: string) => text.normalize('NFC').replace(/\s+/gu, '')

// The share page of a sequence in the IDS Workshop. A sequence holding a dot or a slash travels as a query.
export function workshopUrl(ids = '') {
  const base = 'https://ids.mkpo.li/'
  if (!ids) return base
  return /[./]/.test(ids) ? `${base}?ids=${encodeURIComponent(ids)}` : base + encodeURIComponent(ids)
}

export const codePoints = (text: string) => [...text].map(c => 'U+' + c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')).join(' ')
