declare global {
  namespace App {
    interface Platform {
      env: {
        DB: D1Database
        IMAGES: R2Bucket
        ACCESS_TEAM_DOMAIN?: string
        ACCESS_AUD?: string
        MODERATOR_EMAILS?: string
        ATLAS_ISSUER?: string
        ATLAS_CLIENT_ID?: string
        ATLAS_CLIENT_SECRET?: string
        ATLAS_PUBLIC_ORIGIN?: string
        CONTRIBUTION_RATE_LIMIT?: { limit(options: { key: string }): Promise<{ success: boolean }> }
        LOCAL_RATE_LIMIT?: string
      }
      cf?: IncomingRequestCfProperties
    }
    interface Locals {
      moderator: string | null
    }
  }
}
export {}
