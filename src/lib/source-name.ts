import { sourceKind } from './scripts'

// What a source is called wherever it is listed, linked or drawn. A source without a title, as a chat message or a
// letter is, goes by what it appeared in, then by its link, its author, or the little else it states.
const NAMES = [['title'], ['container'], ['url'], ['author', 'source_kind'], ['publisher'], ['report_date']] as const
export type NameField = typeof NAMES[number][number]
type Nameable = { [field in NameField]?: string | null }
type Label = (key: `${string}.${string}`) => string

const stated = (source: Nameable, field: NameField, label: Label) => {
  if (field !== 'source_kind') return source[field] || null
  const kind = sourceKind(source.source_kind)
  return kind && label(`sourceKind.${kind}`)
}

/** The name of a source, and the fields it is made of, which a line beside it leaves out. */
export function sourceName(source: Nameable, label: Label): { text: string; fields: readonly NameField[] } {
  for (const group of NAMES) {
    const fields = group.filter(field => stated(source, field, label))
    if (fields.length) return { text: fields.map(field => stated(source, field, label)).join(' · '), fields }
  }
  return { text: label('source.title'), fields: [] }
}

/** The name of a source standing alone: a message in a group is named with its author too. */
export function sourceHeading(source: Nameable, label: Label) {
  const { text, fields } = sourceName(source, label)
  return fields[0] === 'container' && source.author ? `${source.author} · ${text}` : text
}

/** What a line beside the name says of a source, less the fields that are the name. */
export function sourceByline(source: Nameable, fields: readonly NameField[], label: Label, shown: readonly NameField[]) {
  return shown.filter(field => !fields.includes(field)).map(field => stated(source, field, label)).filter(Boolean).join(' · ')
}
