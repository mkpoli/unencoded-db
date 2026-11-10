export type Encoding = { charset: string; code: string }

export const ENCODING_SETS = [
  { id: 'unicode', label: 'Unicode' },
  { id: 'cns11643', label: 'CNS 11643' },
  { id: 'big5', label: 'Big5' },
  { id: 'big5-hkscs', label: 'Big5-HKSCS' },
  { id: 'gb18030', label: 'GB 18030' },
  { id: 'gb2312', label: 'GB 2312' },
  { id: 'jis0208', label: 'JIS X 0208' },
  { id: 'jis0213', label: 'JIS X 0213' },
  { id: 'ksx1001', label: 'KS X 1001' },
  { id: 'tca-cns', label: 'TCA-CNS 11643' },
  { id: 'iso10646', label: 'ISO/IEC 10646' },
] as const

export const OTHER_ENCODING = 'other'

export function isEncodingSet(value: string) {
  return ENCODING_SETS.some(set => set.id === value)
}

/** The label a stored charset value presents: a standard's label, or a custom label as written. */
export function encodingSetLabel(value: string) {
  return ENCODING_SETS.find(set => set.id === value)?.label ?? value
}

export function cleanEncodingCode(value: string) {
  return value.normalize('NFC').trim()
}
