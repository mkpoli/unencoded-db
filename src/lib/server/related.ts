export const MAX_COMPARISONS = 10
export const comparisonFields = ['character', 'relationship', 'differences', 'evidence'] as const
const limits = { character: 200, relationship: 20, differences: 2000, evidence: 2000 }
const relationships = ['variant', 'not_variant', 'similar', 'uncertain', 'sound', 'meaning', 'glyph', 'usage']
export type Comparison = Record<typeof comparisonFields[number], string>

export function readComparisons(form: FormData) {
  const columns = comparisonFields.map(name => form.getAll(`comparison_${name}`))
  const count = Math.max(...columns.map(column => column.length))
  const rows: Comparison[] = []
  const errors: boolean[] = []
  for (let i = 0; i < count; i++) {
    const row = {} as Comparison
    let invalid = false
    for (let j = 0; j < comparisonFields.length; j++) {
      const name = comparisonFields[j]
      const value = columns[j][i]
      if (typeof value !== 'string') invalid = true
      row[name] = typeof value === 'string' ? value : ''
      if (row[name].length > limits[name]) invalid = true
    }
    if (!row.character.trim() || !relationships.includes(row.relationship)) invalid = true
    rows.push(row)
    errors.push(invalid)
  }
  return { rows, errors, tooMany: count > MAX_COMPARISONS }
}
