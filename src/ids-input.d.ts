type ComposerDrawing = {
  d: string
  cut?: string
  slots?: { index: number; box: number[] }[]
  stroke?: number[] | null
  parts?: { d: string; cut?: boolean; leaf?: number; box?: number[] }[]
  transforms?: (string | null)[]
  emoji?: { text: string; box: number[]; part?: number; flip?: [boolean, boolean]; cut?: boolean; restored?: boolean }[]
}

declare module 'ids-input/composer' {
  export type Drawing = ComposerDrawing
  export type ComposerSource = {
    ready(): Promise<void>
    load(names: Iterable<string>): Promise<unknown[]>
    filesOf(keys: Iterable<string>): Set<string>
    store(): unknown
  }
  export function createSource(read: (name: string) => Promise<ArrayBuffer | null>, options?: { concurrency?: number }): ComposerSource
  export function compose(source: ComposerSource, sequence: string, options?: { separate?: boolean; fontStyle?: 'sans' | 'serif' | 'kaisho' }): Promise<ComposerDrawing>
  export function composerPreview(options: { base: string; separate?: boolean; fontStyle?: 'sans' | 'serif' | 'kaisho' }): (sequence: string, options?: { signal?: AbortSignal; onSketch?: (leaves: unknown[]) => void }) => Promise<ComposerDrawing>
}

declare module 'ids-input' {
  export type IdsPart = string | IdsNode | null
  export type IdsNode = { op: string; parts: IdsPart[]; marks?: string; note?: string }
  export type IdsProblem = 'component' | 'missing' | 'extra' | 'character'
  export function isDescription(text: string | null | undefined): boolean
  export function parse(ids: string | null | undefined, options?: { open?: boolean }): { tree?: IdsPart; problem?: IdsProblem }
  export function isNode(part: IdsPart | undefined): part is IdsNode
  export function write(tree: IdsPart): string
  export function componentStrokes(tree: unknown, count: (character: string) => number | null | undefined): { components: number; strokes: number | null; filled: boolean }
  export function drawingSvg(drawing: ComposerDrawing, options?: { background?: string | null; ink?: string; padding?: number; size?: number; placeholders?: boolean; idPrefix?: string }): string
}

declare module '*?url' {
  const url: string
  export default url
}
