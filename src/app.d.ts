declare global {
  namespace App {
    interface Platform {
      env: {
        DB: D1Database
        ACCESS_TEAM_DOMAIN?: string
        ACCESS_AUD?: string
        MODERATOR_EMAILS?: string
        REPORT_RATE_LIMIT?: RateLimit
        LOCAL_RATE_LIMIT?: string
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
