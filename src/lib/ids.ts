// A description sequence as a person types it: the operators and the parts, with spaces taken out.
export const cleanIds = (text: string) => text.normalize('NFC').replace(/\s+/gu, '')
