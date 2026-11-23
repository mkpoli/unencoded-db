// Lookup keys for freely entered names. The citation retains the contributor's spelling.
export const nameLabel = (name: string) => name.normalize('NFKC').trim().replace(/\s+/gu, ' ')
export const nameKey = (name: string) => nameLabel(name).toLowerCase()

// Source cards can show just the host of a URL-only citation.
export const sourceNameKey = (name: string) => nameKey(name).replace(/^https?:\/\/(?=.)/, '')

// Only curated title readings use this looser key. Literal citation and URL searches retain punctuation.
export function titleReadingKey(text: string) {
  return nameKey(text).normalize('NFD')
    .replace(/(\p{Script=Latin})\p{M}+/gu, '$1')
    .normalize('NFC')
    .replace(/[ァ-ヶ]/gu, kana => String.fromCharCode(kana.charCodeAt(0) - 0x60))
    .replace(/[\s\p{P}]+/gu, '')
}
