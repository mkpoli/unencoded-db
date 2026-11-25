// Lookup keys for freely entered names. The citation retains the contributor's spelling.
export const nameLabel = (name: string) => name.normalize('NFKC').trim().replace(/\s+/gu, ' ')
export const nameKey = (name: string) => nameLabel(name).toLowerCase()

// Source cards can show just the host of a URL-only citation.
export const sourceNameKey = (name: string) => nameKey(name).replace(/^https?:\/\/(?=.)/, '')

// What else a source is found by: its author and each of several authors, what it appeared in, its link, and the
// account or group number that stands in brackets after a name.
export function sourceKeys({ author, container, url }: { author: string | null; container: string | null; url: string | null }) {
  const keys = new Set<string>()
  for (const name of [author, container]) {
    const key = nameKey(name ?? '')
    keys.add(key)
    for (const part of key.split(/[、;]/)) keys.add(part.trim())
    for (const [, account, number] of key.matchAll(/(?:^|\()@([a-z0-9_.-]+)|\((\d{5,})\)/g)) {
      if (account) keys.add(account).add(`@${account}`)
      if (number) keys.add(number)
    }
  }
  keys.add(sourceNameKey(url ?? ''))
  keys.delete('')
  return [...keys]
}

// Title readings use this looser key. Literal citation and URL searches retain punctuation.
export function titleReadingKey(text: string) {
  return nameKey(text).normalize('NFD')
    .replace(/(\p{Script=Latin})\p{M}+/gu, '$1')
    .normalize('NFC')
    .replace(/[ァ-ヶ]/gu, kana => String.fromCharCode(kana.charCodeAt(0) - 0x60))
    .replace(/[\s\p{P}]+/gu, '')
}
