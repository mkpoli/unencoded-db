import { translate, type Locale, type MessageKey } from '$lib/i18n'

type SocialPage = {
  path: string | null
  title: MessageKey
  detail?: MessageKey
  specimen?: number
  source?: number
  glyphOnly?: boolean
  publicTitle?: boolean
}

// Only catalogue sections may select a public specimen. Account and workflow cards use fixed copy.
export const SOCIAL_PAGES = {
  home: { path: '', title: 'app.name', detail: 'app.tagline', specimen: 1734, publicTitle: true },
  about: { path: '/about', title: 'about.title', specimen: 1734, publicTitle: true },
  batch: { path: '/batch', title: 'batch.title' },
  data: { path: '/data', title: 'data.title', detail: 'data.intro', publicTitle: true },
  chronology: { path: '/chronology', title: 'nav.chronology', source: 2837, publicTitle: true },
  'record-history': { path: '/entry/[id]/history', title: 'entry.history', publicTitle: true },
  report: { path: '/entry/[id]/report', title: 'report.title' },
  'edit-evidence': { path: '/entry/[id]/sighting/[sighting]/edit', title: 'sighting.edit' },
  'add-evidence': { path: '/entry/[id]/sighting/new', title: 'social.addEvidence' },
  favourites: { path: '/favourites', title: 'favourites.title' },
  fonts: { path: '/fonts', title: 'nav.fonts', specimen: 1734, glyphOnly: true, publicTitle: true },
  history: { path: '/history', title: 'history.globalTitle', publicTitle: true },
  notifications: { path: '/notifications', title: 'notifications.title' },
  account: { path: '/me', title: 'me.account' },
  moderation: { path: '/moderate', title: 'moderate.title' },
  new: { path: '/new', title: 'add.title' },
  authorize: { path: '/oauth/authorize', title: 'agent.title' },
  radicals: { path: '/radicals', title: 'nav.radicals', specimen: 3, publicTitle: true },
  sources: { path: '/sources', title: 'nav.sources', source: 2837, publicTitle: true },
  tags: { path: '/tags', title: 'nav.tags', specimen: 3, publicTitle: true },
  contributors: { path: '/u', title: 'people.title', publicTitle: true },
  contributor: { path: '/u/[id]', title: 'social.contributor' },
  fallback: { path: null, title: 'app.name', detail: 'app.tagline' },
  unavailable: { path: null, title: 'error.title' },
  missing: { path: null, title: 'error.notFound' },
} as const satisfies Record<string, SocialPage>

export type SocialPageName = keyof typeof SOCIAL_PAGES

export function getSocialPage(name: string): SocialPage | undefined {
  return Object.hasOwn(SOCIAL_PAGES, name) ? SOCIAL_PAGES[name as SocialPageName] : undefined
}

const ROUTES = new Map<string, SocialPageName>()
for (const [name, card] of Object.entries(SOCIAL_PAGES)) {
  if (card.path !== null) ROUTES.set(`/[locale]${card.path}`, name as SocialPageName)
}

export function socialPageFor(route: string | null, errorStatus: number | null): SocialPageName {
  if (errorStatus === 404) return 'missing'
  if (errorStatus !== null) return 'unavailable'
  return ROUTES.get(route ?? '') ?? 'fallback'
}

export function socialPageTitle(locale: Locale, title: MessageKey) {
  return translate(locale, title)
}
