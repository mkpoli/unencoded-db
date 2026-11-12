declare module 'ids-input' {
  export type IdsPart = string | IdsNode | null
  export type IdsNode = { op: string; parts: IdsPart[]; marks?: string; note?: string }
  export type IdsProblem = 'component' | 'missing' | 'extra' | 'character'
  export function isDescription(text: string | null | undefined): boolean
  export function parse(ids: string | null | undefined, options?: { open?: boolean }): { tree?: IdsPart; problem?: IdsProblem }
  export function isNode(part: IdsPart | undefined): part is IdsNode
  export function write(tree: IdsPart): string
}

declare module 'ids-input/adapter' {
  export function babelStoneAdapter(options: Record<string, string>): unknown
}

declare module 'ids-input/svelte' {
  import type { Component } from 'svelte'
  export const IdsInput: Component<any>
  export const IdsSequence: Component<{ editor: IdsEditor; label?: boolean; placeholder?: string; onenter?: () => void }>
  /** What a host needs of the editor behind a sequence field. */
  export type IdsEditor = {
    /** The text in the field, `⬚` for each empty slot. */
    readonly draft: string
    /** What is wrong with the text, in the editor's language, or '' when nothing is. */
    readonly problem: string
    reset(text: string): void
    listen(heard: (text: string, whole: boolean) => void): () => void
  }
  export function createEditor(options: () => { adapter: { structure(char: string): Promise<unknown[]> }; messages?: Record<string, string>; locale?: string; disabled?: boolean; tintMode?: 'hover' | 'on' | 'off' }): IdsEditor
}

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
