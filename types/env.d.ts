declare namespace NodeJS {
  interface ProcessEnv {
    CONVEX_DEPLOYMENT: string;
    /** Same deployment URL as `NEXT_PUBLIC_CONVEX_URL` when you want it only on the server. */
    CONVEX_URL?: string;
    NEXT_PUBLIC_CONVEX_URL: string;
    /** Optional public site URL for server-side absolute links (e.g. Puppeteer base URL). */
    NEXT_PUBLIC_APP_URL?: string;
    /** Vercel deployment host; used as fallback base URL when `NEXT_PUBLIC_APP_URL` is unset. */
    VERCEL_URL?: string;
    /** Set on Vercel serverless; local `next dev` is undefined so bundled `puppeteer` is used. */
    VERCEL_ENV?: string;
    /** Vercel production hostname (e.g. `my-app.vercel.app`); used with `CHROMIUM_PACK_URL` resolution. */
    VERCEL_PROJECT_PRODUCTION_URL?: string;
    /** Local Chrome/Chromium binary for `puppeteer-core` (skips `@sparticuz/chromium-min` resolution). */
    PUPPETEER_EXECUTABLE_PATH?: string;
    /** Directory containing Sparticuz Brotli assets (`chromium.br`, etc.) for `@sparticuz/chromium-min`. */
    CHROMIUM_MIN_BROTLI_PATH?: string;
    /** HTTPS URL to a `chromium-v*-pack.*.tar` for `@sparticuz/chromium-min` when not using local brotli files. */
    CHROMIUM_PACK_URL?: string;
    /** Secret for `POST /api/render-card` (Bearer or `x-api-secret`). */
    API_SECRET?: string;
    /** Secret for `/internal/*` routes (Bearer or `x-internal-secret`). */
    INTERNAL_SECRET?: string;
    /** Pino log level (e.g. `info`, `debug`). */
    LOG_LEVEL?: string;
  }
}
