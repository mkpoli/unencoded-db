// Where the sister sites say more: Glyph Atlas shows a character's forms in old books, Han Input finds it by
// reading, parts or input code, and IDS Workshop edits and draws a description.
import { cleanIds, workshopUrl } from './ids'

export type SiteLink = { name: string; href: string }

const codes = (text: string) => [...text].map(char => 'U+' + char.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')).join('-')
const atlas = (text: string, locale: string): SiteLink => ({ name: 'Glyph Atlas', href: `https://glyphatlas.org/${locale}/character/${codes(text)}` })

/** The pages for one encoded character. */
export function characterLinks(char: string, locale: string): SiteLink[] {
  const hex = char.codePointAt(0)!.toString(16).toUpperCase()
  return [atlas(char, locale), { name: 'Han Input', href: `https://han.mkpo.li/?c=${hex}` }, { name: 'IDS Workshop', href: workshopUrl(char) }]
}

/** The pages for a description sequence. */
export function descriptionLinks(ids: string, locale: string): SiteLink[] {
  const sequence = cleanIds(ids)
  return sequence ? [atlas(sequence, locale), { name: 'IDS Workshop', href: workshopUrl(sequence) }] : []
}
