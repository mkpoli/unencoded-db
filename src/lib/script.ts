// The script field is free text; the form offers "Han" as its first value.
export const SCRIPT_MAX = 80

export const isHanScript = (script: string) => script.normalize('NFC').trim().toLowerCase() === 'han'
