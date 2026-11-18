import type { ParamMatcher } from '@sveltejs/kit'

export const match: ParamMatcher = file => /^[A-Za-z0-9-]{8,128}\.txt$/.test(file)
