import { t, type Locale } from './i18n'
import type { EvidenceType } from './evidence-types'

export function evidenceTypeLabel(locale: Locale, type: EvidenceType): string {
  switch (type) {
    case 'mention': return t(locale, 'evidence.type.mention')
    case 'attestation': return t(locale, 'evidence.type.attestation')
    case 'description': return t(locale, 'evidence.type.description')
    case 'definition': return t(locale, 'evidence.type.definition')
    case 'reading': return t(locale, 'evidence.type.reading')
    case 'relation': return t(locale, 'evidence.type.relation')
  }
}

export function evidenceTypeHint(locale: Locale, type: EvidenceType): string {
  switch (type) {
    case 'mention': return t(locale, 'evidence.type.mention.hint')
    case 'attestation': return t(locale, 'evidence.type.attestation.hint')
    case 'description': return t(locale, 'evidence.type.description.hint')
    case 'definition': return t(locale, 'evidence.type.definition.hint')
    case 'reading': return t(locale, 'evidence.type.reading.hint')
    case 'relation': return t(locale, 'evidence.type.relation.hint')
  }
}
