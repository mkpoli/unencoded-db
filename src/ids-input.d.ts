declare module 'ids-input' {
  export type IdsPart = string | IdsNode | null
  export type IdsNode = { op: string; parts: IdsPart[]; marks?: string; note?: string }
  export type IdsProblem = 'component' | 'missing' | 'extra' | 'character'
  export function isDescription(text: string | null | undefined): boolean
  export function parse(ids: string | null | undefined, options?: { open?: boolean }): { tree?: IdsPart; problem?: IdsProblem }
  export function isNode(part: IdsPart | undefined): part is IdsNode
  export function write(tree: IdsPart): string
  /** A composer's drawing as an SVG document, 1000 units a side. */
  export function drawingSvg(drawing: import('ids-input/composer').Drawing, options?: { background?: string | null; ink?: string; padding?: number; size?: number; placeholders?: boolean; idPrefix?: string }): string
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
  /** A description drawn by the adapter's `preview`. With a `session` and `editable`, its parts are moved, scaled and turned on the drawing. */
  export const IdsPreview: Component<{
    adapter: { preview?: import('ids-input/composer').ComposerPreview }; tree: import('ids-input').IdsPart; chosen?: number[] | null
    messages?: Record<string, string>; locale?: string; small?: boolean; notes?: boolean; delay?: number
    session?: import('ids-input/document').DocumentSession | null; version?: number; editable?: boolean
    scopes?: import('ids-input/document').ScopeTree | null; drawing?: import('ids-input/composer').Drawing | null
    onchoose?: ((path: number[]) => void) | null; onedit?: (() => void) | null
  }, {}, 'scopes' | 'drawing'>
  /** The text of `key` in `messages`, else in English. */
  export function translator(messages: Record<string, string> | undefined, locale?: string): (key: string, params?: Record<string, string | number>) => string
}

declare module 'ids-input/document' {
  export type IdsOperation = { type: string; matrix?: number[] }
  type Layer = { id: string; transform?: IdsOperation[] }
  export type IdsLayer = (Layer & { kind: 'component'; char: string }) | (Layer & { kind: 'operator'; op: string; children: IdsLayer[] }) | (Layer & { kind: 'slot' }) | (Layer & { kind: 'group'; child: IdsLayer })
  /** One character as layers: its parts, and the steps each is drawn through. */
  export type IdsDocument = { format: string; version: number; root: IdsLayer }
  /** A document's drawing, each part's ink in its own scope. */
  export type ScopeTree = { complete: boolean }
  /** A document being edited, with its history. `document` is a copy. */
  export type DocumentSession = {
    readonly document: IdsDocument
    readonly chosen: string | null
    readonly canUndo: boolean
    readonly canRedo: boolean
    open(next: IdsDocument): void
    sync(tree: import('ids-input').IdsPart): boolean
    choose(id: string | null): boolean
    clearTransform(id?: string): string
    undo(): boolean
    redo(): boolean
  }
  export function fromSequence(sequence: string): IdsDocument
  export function layerAtPath(root: IdsLayer, path: number[]): IdsLayer | null
  /** The place of the layer with this id, or null. */
  export function pathOfLayer(root: IdsLayer, id: string): number[] | null
  export function affineForChain(chain: IdsOperation[]): number[] | null
  export function createDocumentSession(initial?: IdsDocument): DocumentSession
  export function scopesMarkup(drawing: ScopeTree, options?: { ink?: string; idPrefix?: string; emoji?: unknown[] | null; cut?: string | null; cutLeaf?: number | null }): { defs: string; body: string }
}

declare module 'ids-input/composer' {
  export type Drawing = { d: string; parts?: { leaf?: number; cut?: boolean }[]; slots?: unknown[]; cut?: string; emoji?: unknown[] }
  export type SketchLeaf = { index: number; box: number[]; empty: boolean }
  export type ComposerPreview = ((sequence: string, options?: { signal?: AbortSignal }) => Promise<Drawing>) & { warm(sequence?: string): void }
  export type ComposerSource = {
    ready(): Promise<void>
    load(names: Iterable<string>): Promise<unknown[]>
    filesOf(keys: Iterable<string>): Set<string>
    store(): unknown
  }
  export function createSource(read: (name: string) => Promise<ArrayBuffer | null>, options?: { concurrency?: number }): ComposerSource
  export function compose(source: ComposerSource, sequence: string, options?: { separate?: boolean; fontStyle?: 'sans' | 'serif' | 'kaisho' }): Promise<Drawing>
  /** The composer in a Web Worker, reading han-compose's export at `base`. */
  export function composerPreview(options: { base: string; separate?: boolean; fontStyle?: 'sans' | 'serif' | 'kaisho' }): ComposerPreview
  /** Where each leaf of `sequence` goes before it is drawn. */
  export function sketch(source: ComposerSource, sequence: string): Promise<SketchLeaf[]>
  /** A document over a drawing made with `separate`: `scopes` is its drawing once every part has its own ink. */
  export function documentView(document: import('ids-input/document').IdsDocument, drawing: Drawing, sketch: SketchLeaf[] | null): { scopes: import('ids-input/document').ScopeTree | null; complete: boolean }
}
