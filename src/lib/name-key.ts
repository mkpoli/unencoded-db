// Lookup keys for freely entered names. The citation retains the contributor's spelling.
export const nameLabel = (name: string) => name.normalize('NFKC').trim().replace(/\s+/gu, ' ')
export const nameKey = (name: string) => nameLabel(name).toLowerCase()

// Source cards can show just the host of a URL-only citation.
export const sourceNameKey = (name: string) => nameKey(name).replace(/^https?:\/\/(?=.)/, '')

// The keys of one name: the whole, each of several names, and the account or number that stands in brackets
// after a name, or is the name.
function keysOf(name: string | null, keys = new Set<string>()) {
  const key = nameKey(name ?? '')
  keys.add(key)
  for (const part of key.split(/[、;]/).map(part => part.trim())) {
    keys.add(part)
    for (const text of [part, ...[...part.matchAll(/[([【]([^()[\]【】]+)[)\]】]/g)].map(match => match[1].trim())]) {
      const account = text.match(/^@(\S+)$/)?.[1], number = text !== part && text.match(/(?:^|\s)(\d{5,})$/)?.[1]
      if (account) keys.add(account).add(`@${account}`)
      if (number) keys.add(number)
    }
  }
  keys.delete('')
  return keys
}
export const authorKeys = (author: string | null) => [...keysOf(author)]

// What else a source is found by: its author, what it appeared in and its link.
export function sourceKeys({ author, container, url }: { author: string | null; container: string | null; url: string | null }) {
  const keys = keysOf(container, keysOf(author))
  keys.add(sourceNameKey(url ?? ''))
  keys.delete('')
  return [...keys]
}

// Of an author who is several people, the one a key names, as the source spells it. The names part where the
// key parts them, at any character that reads as 、 or ;.
export function authorNamed(author: string, key: string) {
  if (nameKey(author) === key) return author
  const parts = ['']
  for (const char of author) if (/^[、;]$/.test(char.normalize('NFKC'))) parts.push(''); else parts[parts.length - 1] += char
  return parts.map(part => part.trim()).find(part => keysOf(part).has(key)) ?? author
}

// Title readings use this looser key. Literal citation and URL searches retain punctuation.
export function titleReadingKey(text: string) {
  return nameKey(text).normalize('NFD')
    .replace(/(\p{Script=Latin})\p{M}+/gu, '$1')
    .normalize('NFC')
    .replace(/[ァ-ヶ]/gu, kana => String.fromCharCode(kana.charCodeAt(0) - 0x60))
    .replace(/[\s\p{P}]+/gu, '')
}
