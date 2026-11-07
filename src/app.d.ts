declare global {
  namespace App {
    interface Platform {
      env: {
        DB: D1Database
        ACCESS_TEAM_DOMAIN?: string
        ACCESS_AUD?: string
        MODERATOR_EMAILS?: string
      }
    }
    interface Locals {
      moderator: string | null
    }
  }
}
export {}
