declare global {
  namespace App {
    interface Platform {
      env: {
        DB: D1Database
        IMAGES: R2Bucket
        ATLAS_ISSUER?: string
        ATLAS_CLIENT_ID?: string
        ATLAS_CLIENT_SECRET?: string
        ATLAS_PUBLIC_ORIGIN?: string
      }
    }
  }
}
export {}
