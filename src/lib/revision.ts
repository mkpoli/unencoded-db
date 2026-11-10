export const REVISION_FIELDS = ['script', 'ids', 'description', 'place', 'title', 'author', 'publisher', 'year', 'page', 'note'] as const
export type RevisionField = (typeof REVISION_FIELDS)[number]
export type RevisionSnapshot = { entry_id: number; revision: number; recorded_at: string } & (
  | { tombstone: true }
  | ({ tombstone: false } & Record<RevisionField, string | null>)
)
