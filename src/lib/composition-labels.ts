import { FORMATIONS, FORMATION_MAX, ROLE_PRESETS, ROLE_MAX } from './composition'
import { t, type Locale } from './i18n'

/** The localized label of a preset role, or custom text as the editor wrote it. */
export function roleLabel(locale: Locale, role: string): string {
  switch (role) {
    case 'semantic': return t(locale, 'role.semantic')
    case 'phonetic': return t(locale, 'role.phonetic')
    case 'symbol': return t(locale, 'role.symbol')
    case 'also': return t(locale, 'role.also')
    case 'abbreviatedSound': return t(locale, 'role.abbreviatedSound')
    case 'abbreviatedForm': return t(locale, 'role.abbreviatedForm')
    case 'fanqieUpper': return t(locale, 'role.fanqieUpper')
    case 'fanqieLower': return t(locale, 'role.fanqieLower')
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
    case 'compoundPhonoSemantic': return t(locale, 'formation.compoundPhonoSemantic')
    case 'qieshen': return t(locale, 'formation.qieshen')
    case 'single': return t(locale, 'formation.single')
    case 'unknown': return t(locale, 'formation.unknown')
  }
  return formation
}

/** The stored role for what an editor typed: a preset code, or the text as written. */
export function roleFromLabel(locale: Locale, text: string): string {
  const value = [...text.normalize('NFC').trim()].slice(0, ROLE_MAX).join('')
  if (!value) return ''
  if ((ROLE_PRESETS as readonly string[]).includes(value)) return value
  for (const role of ROLE_PRESETS) if (roleLabel(locale, role) === value) return role
  return value
}

/** The stored formation for what an editor typed: a preset code, or the text as written. */
export function formationFromLabel(locale: Locale, text: string): string {
  const value = [...text.normalize('NFC').trim()].slice(0, FORMATION_MAX).join('')
  if (!value) return ''
  if ((FORMATIONS as readonly string[]).includes(value)) return value
  for (const formation of FORMATIONS) if (formationLabel(locale, formation) === value) return formation
  return value
}
