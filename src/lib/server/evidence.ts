export const fields = ['script', 'ids', 'description', 'place', 'title', 'author', 'publisher', 'year', 'page', 'note'] as const
export type Evidence = Record<typeof fields[number], string | null>
const limits = { script: 80, ids: 200, description: 5000, place: 500, title: 300, author: 300, publisher: 300, year: 40, page: 80, note: 5000 }

export function readEvidence(form: FormData): Evidence | null {
  const row = {} as Evidence
  for (const name of fields) {
    const value = form.get(name)
    if (value !== null && typeof value !== 'string') return null
    const text = (value ?? '').normalize('NFC').trim()
    if (text.length > limits[name]) return null
    row[name] = text || null
  }
  if (!row.script || !row.place) return null
  return row
}
