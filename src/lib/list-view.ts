// How a reader goes through a list: all of it loading on as they scroll, or a page at a time. Kept in a
// cookie so the server draws the list the same way.
export const LIST_VIEWS = ['all', 'paged'] as const
export type ListView = (typeof LIST_VIEWS)[number]
export const LIST_VIEW: ListView = 'all'
export const LIST_VIEW_COOKIE = 'ug.view'
export const listViewOf = (value: string | null | undefined): ListView => (LIST_VIEWS as readonly string[]).includes(value ?? '') ? value as ListView : LIST_VIEW
