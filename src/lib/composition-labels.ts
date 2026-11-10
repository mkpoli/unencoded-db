import type { Formation, Role } from './composition'
import { t, type Locale } from './i18n'

export function roleLabel(locale: Locale, role: Role): string {
  switch (role) {
    case 'semantic': return t(locale, 'role.semantic')
    case 'phonetic': return t(locale, 'role.phonetic')
    case 'symbol': return t(locale, 'role.symbol')
  }
}

export function formationLabel(locale: Locale, formation: Formation): string {
  switch (formation) {
    case 'phonoSemantic': return t(locale, 'formation.phonoSemantic')
    case 'ideographic': return t(locale, 'formation.ideographic')
    case 'indicative': return t(locale, 'formation.indicative')
    case 'sign': return t(locale, 'formation.sign')
    case 'single': return t(locale, 'formation.single')
    case 'unknown': return t(locale, 'formation.unknown')
  }
}
