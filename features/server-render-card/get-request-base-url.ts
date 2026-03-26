/**
 * Base URL for the running app (Puppeteer must load the same origin as this handler).
 */
export function getRequestBaseUrl(request: Request): string {
  const envUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.VERCEL_URL;
  if (envUrl !== undefined && envUrl.length > 0) {
    return envUrl.startsWith('http') ? envUrl : `https://${envUrl}`;
  }
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}
