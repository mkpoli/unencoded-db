import type { GlyphStyle } from '$lib/composer'
import type { Person } from '$lib/server/people'
import type { TileSize } from '$lib/tile-size'

declare global {
  namespace App {
    interface Locals { person: Person | null; theme: string; glyphStyle: GlyphStyle; tileSize: TileSize }
    interface Platform {
      ctx: ExecutionContext
      env: {
        DB: D1Database
        MEDIA: R2Bucket
        ASSETS: Fetcher
        ADDS?: RateLimit
        EDITS?: RateLimit
        ATLAS_ISSUER?: string
        ATLAS_CLIENT_ID?: string
        ATLAS_CLIENT_SECRET?: string
        IP_SALT?: string
        WRITES_PAUSED?: string
      }
    }
  }
}

export {}
