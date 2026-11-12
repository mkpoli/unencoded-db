// Where other sites say more: Glyph Atlas shows a character's forms in old books, Han Input finds it by
// reading, parts or input code, IDS Workshop edits and draws a description, and zi.tools and yedict are
// character dictionaries that also search by description. The addresses follow Han Input's and IDS Workshop's.
import { cleanIds, workshopUrl } from './ids'

export type SiteLink = { name: string; href: string }

const codes = (text: string) => [...text].map(char => 'U+' + char.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')).join('-')
const atlas = (text: string, locale: string): SiteLink => ({ name: 'Glyph Atlas', href: `https://glyphatlas.org/${locale}/character/${codes(text)}` })

/** The pages for one encoded character. */
export function characterLinks(char: string, locale: string): SiteLink[] {
  const hex = char.codePointAt(0)!.toString(16).toUpperCase()
  return [
    atlas(char, locale), { name: 'Han Input', href: `https://han.mkpo.li/?c=${hex}` }, { name: 'IDS Workshop', href: workshopUrl(char) },
    { name: '字統網 zi.tools', href: `https://zi.tools/zi/${encodeURIComponent(char)}` },
    { name: '新葉典 yedict', href: `http://www.yedict.com/z/U${hex.padStart(5, '0')}` },
  ]
}

/** The pages for a description sequence. */
export function descriptionLinks(ids: string, locale: string): SiteLink[] {
  const sequence = cleanIds(ids)
  return sequence ? [
    atlas(sequence, locale), { name: 'IDS Workshop', href: workshopUrl(sequence) },
    { name: '字統網 zi.tools', href: `https://zi.tools/?secondary=ids&seq=${encodeURIComponent(sequence)}` },
  ] : []
}
