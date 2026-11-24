import { sourceKind } from './scripts'
import { t } from './t'

// The kind of a source as it is shown, or null for a source without one.
export const kindName = (raw: string | null | undefined) => { const kind = sourceKind(raw); return kind && t(`sourceKind.${kind}`) }
