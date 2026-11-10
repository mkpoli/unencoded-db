import { page } from '$app/state'
import { translate, type MessageKey } from './i18n'

export const locale = () => page.params.locale ?? 'en'
export const t = (key: MessageKey | `${string}.${string}`, values?: Record<string, string | number>) => translate(locale(), key, values)
export const href = (path = '') => `/${locale()}${path}`
export const when = (iso: string) => iso.slice(0, 16).replace('T', ' ') + ' UTC'
export const day = (iso: string) => iso.slice(0, 10)
export const media = (key: string) => `/media/v2/${key}`
