declare global {
  namespace App {
    interface Platform {
      env: {
        DB: D1Database
        CONTRIBUTION_RATE_LIMIT?: { limit(options: { key: string }): Promise<{ success: boolean }> }
        LOCAL_RATE_LIMIT?: string
      }
      cf?: IncomingRequestCfProperties
    }
  }
}
export {}
