// Where other sites say more: Glyph Atlas shows a character's forms in old books, Han Input finds it by
// reading, parts or input code, IDS Workshop edits and draws a description, and zi.tools and IRG WS2024
// search by description. The addresses follow Han Input's, IDS Workshop's and hc.jsecs.org's. The
// dictionaries and working sets a character is registered in are in `registries.ts`.
import { cleanIds, workshopUrl } from './ids'
import { ACTIVE_WORKING_SET_LABEL, irgLinks, ortIdsUrl } from './irg-ws'

export type SiteLink = { name: string; href: string; title?: string }

const codes = (text: string) => [...text].map(char => 'U+' + char.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')).join('-')
const atlas = (text: string, locale: string): SiteLink => ({ name: 'Glyph Atlas', href: `https://glyphatlas.org/${locale}/character/${codes(text)}` })

/** The pages for one encoded character, plus IRG Working Set and UAX #45 links when Unihan IRG sources are known. */
export function characterLinks(char: string, locale: string, sources?: readonly string[]): SiteLink[] {
  const hex = char.codePointAt(0)!.toString(16).toUpperCase()
  return [
    atlas(char, locale),
    { name: 'Han Input', href: `https://han.mkpo.li/?c=${hex}` },
    { name: 'IDS Workshop', href: workshopUrl(char) },
    ...irgLinks(char, sources),
  ]
}

/** The pages for a description sequence. */
export function descriptionLinks(ids: string, locale: string): SiteLink[] {
  const sequence = cleanIds(ids)
  if (!sequence) return []
  return [
    atlas(sequence, locale),
    { name: 'IDS Workshop', href: workshopUrl(sequence) },
    { name: '字統網 zi.tools', href: `https://zi.tools/?secondary=ids&seq=${encodeURIComponent(sequence)}` },
    { name: ACTIVE_WORKING_SET_LABEL, href: ortIdsUrl(sequence)!, title: `IDS: ${sequence}` },
  ]
}
