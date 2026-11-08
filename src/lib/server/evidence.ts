export const fields = ['script', 'ids', 'description', 'place', 'title', 'author', 'publisher', 'year', 'page', 'note'] as const
export type Evidence = Record<typeof fields[number], string | null>
const limits = { script: 80, ids: 200, description: 5000, place: 500, title: 300, author: 300, publisher: 300, year: 40, page: 80, note: 5000 }

/** The fields a submission fails, so an action can report every error in one pass. */
export function invalidFields(form: FormData): (typeof fields[number])[] {
  const invalid: (typeof fields[number])[] = []
  for (const name of fields) {
    const probe = new FormData()
    probe.set('script', 'Han')
    probe.set('place', 'Source')
    const value = form.get(name)
    if (value !== null) probe.set(name, value)
    else probe.delete(name)
    if (!readEvidence(probe)) invalid.push(name)
  }
  return invalid
}

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
