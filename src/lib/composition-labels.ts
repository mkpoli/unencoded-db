import { FORMATIONS, FORMATION_MAX, ROLES, ROLE_MAX } from './composition'
import { translate } from './i18n'

/** The localized label of a standard role, or custom text as the editor wrote it. */
export function roleLabel(locale: string, role: string): string {
  return (ROLES as readonly string[]).includes(role) ? translate(locale, `role.${role}`) : role
}

/** The localized label of a standard formation, or custom text as the editor wrote it. */
export function formationLabel(locale: string, formation: string): string {
  return (FORMATIONS as readonly string[]).includes(formation) ? translate(locale, `formation.${formation}`) : formation
}

/** The stored role for what an editor typed: a standard code, or the text as written. */
export function roleFromLabel(locale: string, text: string): string {
  const value = [...text.normalize('NFC').trim()].slice(0, ROLE_MAX).join('')
  if (!value) return ''
  if ((ROLES as readonly string[]).includes(value)) return value
  return ROLES.find(role => roleLabel(locale, role) === value) ?? value
}

/** The stored formation for what an editor typed: a standard code, or the text as written. */
export function formationFromLabel(locale: string, text: string): string {
  const value = [...text.normalize('NFC').trim()].slice(0, FORMATION_MAX).join('')
  if (!value) return ''
  if ((FORMATIONS as readonly string[]).includes(value)) return value
  return FORMATIONS.find(formation => formationLabel(locale, formation) === value) ?? value
}
