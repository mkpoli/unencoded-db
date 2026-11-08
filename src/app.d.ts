declare global {
  namespace App {
    interface Platform {
      env: {
        DB: D1Database
        IMAGES: R2Bucket
        ACCESS_TEAM_DOMAIN?: string
        ACCESS_AUD?: string
        MODERATOR_EMAILS?: string
        REPORT_RATE_LIMIT?: RateLimit
        LOCAL_RATE_LIMIT?: string
        ATLAS_ISSUER?: string
        ATLAS_CLIENT_ID?: string
        ATLAS_CLIENT_SECRET?: string
        ATLAS_PUBLIC_ORIGIN?: string
      }
      cf?: IncomingRequestCfProperties
      ctx?: ExecutionContext
    }
    interface Locals {
      moderator: string | null
    }
  }
}
export {}
