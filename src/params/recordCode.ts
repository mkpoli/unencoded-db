import { parseRecordUrlCode } from '$lib/code'
import type { ParamMatcher } from '@sveltejs/kit'

export const match: ParamMatcher = code => parseRecordUrlCode(code) !== null
