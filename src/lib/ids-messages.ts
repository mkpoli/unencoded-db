// ids-input's catalogue for a language of this site, fetched when a form first shows its field. English is
// built into the package.
const CATALOGUES: Record<string, () => Promise<{ default: Record<string, string> }>> = {
  ja: () => import('ids-input/messages/ja.json'),
  ko: () => import('ids-input/messages/ko.json'),
  vi: () => import('ids-input/messages/vi.json'),
  'zh-Hans': () => import('ids-input/messages/zh-Hans.json'),
  'zh-Hant': () => import('ids-input/messages/zh-Hant.json'),
}

const asked = new Map<string, Promise<Record<string, string> | undefined>>()

export function idsMessages(locale: string) {
  let found = asked.get(locale)
  if (!found) asked.set(locale, found = CATALOGUES[locale]?.().then(catalogue => catalogue.default) ?? Promise.resolve(undefined))
  return found
}
