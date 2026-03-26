declare namespace NodeJS {
  interface ProcessEnv {
    CONVEX_DEPLOYMENT: string;
    NEXT_PUBLIC_CONVEX_URL: string;
    /** Shared secret for `POST /api/render-card` (Bearer or `x-render-card-secret`). */
    RENDER_CARD_SECRET?: string;
  }
}
