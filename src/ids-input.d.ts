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

declare module '@han-compose/composer' {
  export type Drawing = { d: string; parts?: unknown[]; slots?: unknown[] }
  export type ComposerSource = {
    ready(): Promise<void>
    load(names: Iterable<string>): Promise<unknown[]>
    filesOf(keys: Iterable<string>): Set<string>
    store(): unknown
  }
  export const dataUrls: Record<string, string>
  export function drawingSvg(drawing: Drawing, options?: { background?: string | null; ink?: string; padding?: number; size?: number; placeholders?: boolean; idPrefix?: string }): string
  export function compose(source: ComposerSource, sequence: string, options?: { separate?: boolean; fontStyle?: 'sans' | 'serif' | 'fangsong' | 'kaisho' }): Promise<Drawing>
  /** The composer in a Web Worker, reading han-compose's export at `base`. */
  export function composerPreview(options: { base: string; separate?: boolean; fontStyle?: 'sans' | 'serif' | 'fangsong' | 'kaisho'; loaders?: Record<string, string> }): ((sequence: string, options?: { signal?: AbortSignal }) => Promise<Drawing>) & { warm(): void }
}

declare module '@han-compose/composer/source' {
  import type { ComposerSource } from '@han-compose/composer'
  export function traitsOf(sequence: string): Record<string, boolean>
  export function traitKey(traits: Record<string, boolean>): string
  export function sourceFor(sequence: string, options?: {
    base?: string
    fontStyle?: string
    separate?: boolean
    bundled?: boolean
    remote?: boolean
    loaders?: Record<string, string>
    traits?: Record<string, boolean>
    fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
    read?: (path: string, url?: string) => Promise<Response | object>
  }): ComposerSource
}

declare module '@han-compose/composer/loader' {
  import type { ComposerSource, Drawing } from '@han-compose/composer'
  export function compose(source: ComposerSource, sequence: string, options?: { separate?: boolean; fontStyle?: 'sans' | 'serif' | 'fangsong' | 'kaisho' }): Promise<Drawing>
}

declare module '@han-compose/composer/drawing-svg' {
  import type { Drawing } from '@han-compose/composer'
  export function drawingSvg(drawing: Drawing, options?: { background?: string | null; ink?: string; padding?: number; size?: number; placeholders?: boolean; idPrefix?: string }): string
}
