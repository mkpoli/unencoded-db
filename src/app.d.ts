import type { Person } from '$lib/server/people'

declare global {
  namespace App {
    interface Locals { person: Person | null; theme: string }
    interface Platform {
      ctx: ExecutionContext
      env: {
        DB: D1Database
        MEDIA: R2Bucket
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
