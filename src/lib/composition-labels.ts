import { FORMATIONS, FORMATION_MAX, ROLES, ROLE_MAX } from './composition'
import { t, type Locale } from './i18n'

/** The localized label of a standard role, or custom text as the editor wrote it. */
export function roleLabel(locale: Locale, role: string): string {
  switch (role) {
    case 'semantic': return t(locale, 'role.semantic')
    case 'phonetic': return t(locale, 'role.phonetic')
    case 'symbol': return t(locale, 'role.symbol')
  }
  return role
}

/** The localized label of a standard formation, or custom text as the editor wrote it. */
export function formationLabel(locale: Locale, formation: string): string {
  switch (formation) {
    case 'phonoSemantic': return t(locale, 'formation.phonoSemantic')
    case 'ideographic': return t(locale, 'formation.ideographic')
    case 'indicative': return t(locale, 'formation.indicative')
    case 'sign': return t(locale, 'formation.sign')
    case 'single': return t(locale, 'formation.single')
    case 'unknown': return t(locale, 'formation.unknown')
  }
  return formation
}

/** The stored role for what an editor typed: a standard code, or the text as written. */
export function roleFromLabel(locale: Locale, text: string): string {
  const value = text.normalize('NFC').trim().slice(0, ROLE_MAX)
  if (!value) return ''
  if ((ROLES as readonly string[]).includes(value)) return value
  for (const role of ROLES) if (roleLabel(locale, role) === value) return role
  return value
}

/** The stored formation for what an editor typed: a standard code, or the text as written. */
export function formationFromLabel(locale: Locale, text: string): string {
  const value = text.normalize('NFC').trim().slice(0, FORMATION_MAX)
  if (!value) return ''
  if ((FORMATIONS as readonly string[]).includes(value)) return value
  for (const formation of FORMATIONS) if (formationLabel(locale, formation) === value) return formation
  return value
}
