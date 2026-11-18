import { readShortRecordCode } from '$lib/short-record'
import type { ParamMatcher } from '@sveltejs/kit'

export const match: ParamMatcher = code => readShortRecordCode(code) !== null
