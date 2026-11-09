import { componentStrokes, parse } from 'ids-input'

export type StrokeEstimate = { strokes: number; approximate: boolean }

export function estimateStrokes(ids: string, counts: Map<string, number | null>): StrokeEstimate | null {
  if ([...ids].length === 1) {
    const strokes = counts.get(ids) ?? null
    return strokes === null ? null : { strokes, approximate: false }
  }
  try {
    const { tree } = parse(ids)
    const counted = componentStrokes(tree, character => counts.get(character) ?? null)
    if (counted.strokes === null) return null
    return { strokes: counted.strokes, approximate: counted.components > 1 }
  } catch {
    return null
  }
}
