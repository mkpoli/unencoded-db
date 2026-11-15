// The width a reader gives the tiles of a list, kept in a cookie so the server draws the list at it.
export const TILE_SIZES = [96, 120, 145, 180, 230, 300] as const
export type TileSize = (typeof TILE_SIZES)[number]
export const TILE_SIZE: TileSize = 145
export const TILE_SIZE_COOKIE = 'ug.tile'

export function tileSizeOf(value: string | null | undefined): TileSize {
  const size = Number(value)
  return (TILE_SIZES as readonly number[]).includes(size) ? size as TileSize : TILE_SIZE
}
