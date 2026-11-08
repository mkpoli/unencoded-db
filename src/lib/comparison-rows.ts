export function newComparison() {
  return { character: '', relationship: 'uncertain', differences: '', evidence: '' }
}

export function removeComparison<T>(rows: T[], errors: string[], index: number) {
  return { rows: rows.filter((_, i) => i !== index), errors: errors.filter((_, i) => i !== index) }
}
