// Lookup keys for freely entered names. The citation retains the contributor's spelling.
export const nameLabel = (name: string) => name.normalize('NFKC').trim().replace(/\s+/gu, ' ')
export const nameKey = (name: string) => nameLabel(name).toLowerCase()

// Source cards can show just the host of a URL-only citation.
export const sourceNameKey = (name: string) => nameKey(name).replace(/^https?:\/\/(?=.)/, '')
