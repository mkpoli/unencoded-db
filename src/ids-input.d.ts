declare module 'ids-input' {
  export function parse(ids: string): { tree: unknown }
  export function componentStrokes(tree: unknown, count: (character: string) => number | null | undefined): { components: number; strokes: number | null; filled: boolean }
}

declare module '*?url' {
  const url: string
  export default url
}
