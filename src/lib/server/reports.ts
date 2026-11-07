export const reportReasons = ['spam', 'privacy', 'rights', 'other'] as const
export type ReportReason = typeof reportReasons[number]

export const MAX_REPORT_NOTE = 2000

export type ReportInput = {
  reason: ReportReason
  note: string
}

export function isReportReason(value: string): value is ReportReason {
  return (reportReasons as readonly string[]).includes(value)
}

/** Read the untrusted report form. Unknown reasons, non-text fields and long notes are rejected. */
export function readReportForm(form: FormData): ReportInput | null {
  const reason = form.get('reason')
  if (typeof reason !== 'string' || !isReportReason(reason)) return null

  const value = form.get('note')
  if (value !== null && typeof value !== 'string') return null
  const note = (value ?? '').normalize('NFC').trim()
  if (note.length > MAX_REPORT_NOTE) return null

  return { reason, note }
}
