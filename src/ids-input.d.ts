declare module 'ids-input/composer' {
  export type Drawing = { d: string; parts?: unknown[]; slots?: unknown[] }
  export type ComposerSource = {
    ready(): Promise<void>
    load(names: Iterable<string>): Promise<unknown[]>
    filesOf(keys: Iterable<string>): Set<string>
    store(): unknown
  }
  export function createSource(read: (name: string) => Promise<ArrayBuffer | null>, options?: { concurrency?: number }): ComposerSource
  export function compose(source: ComposerSource, sequence: string, options?: { separate?: boolean; fontStyle?: 'sans' | 'serif' | 'kaisho' }): Promise<Drawing>
}

declare module 'ids-input' {
  export function isDescription(text: string | null | undefined): boolean
  export function parse(ids: string): { tree: unknown }
  export function componentStrokes(tree: unknown, count: (character: string) => number | null | undefined): { components: number; strokes: number | null; filled: boolean }
}

declare module '*?url' {
  const url: string
  export default url
}
