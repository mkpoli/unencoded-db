// A description and its layout as the layer document ids-input adjusts and draws, and back. The record
// keeps the layout; the document lasts as long as the drawing or the editing session that needs it.
import { parse } from 'ids-input'
import { affineForChain, fromSequence, layerAtPath, type IdsDocument, type IdsLayer } from 'ids-input/document'
import { cleanLayout, pathOf, placeOf, type Layout } from './layout'

/** The document of `ids` with each moved part drawn through its matrix, or null when `ids` is no description. */
export function layoutDocument(ids: string, layout: Layout | null): IdsDocument | null {
  if (parse(ids).tree === undefined) return null
  let document: IdsDocument
  try { document = fromSequence(ids) } catch { return null }
  for (const [place, matrix] of Object.entries(layout ?? {})) {
    const layer = layerAtPath(document.root, pathOf(place))
    if (layer) layer.transform = [{ type: 'affine', matrix: [...matrix] }]
  }
  return document
}

/** The layout a document holds for `ids`: what each moved part's steps come to as one matrix. */
export function documentLayout(document: IdsDocument, ids: string): Layout | null {
  const found: Layout = {}
  const walk = (layer: IdsLayer, path: number[]) => {
    const matrix = layer.transform?.length ? affineForChain(layer.transform) : null
    if (matrix) found[placeOf(path)] = matrix
    if (layer.kind === 'operator') layer.children.forEach((child, index) => walk(child, [...path, index]))
    else if (layer.kind === 'group') walk(layer.child, path)
  }
  walk(document.root, [])
  return cleanLayout(found, ids)
}
