/**
 * URL of the Convex deployment for server-side HTTP clients (e.g. `ConvexHttpClient`).
 * Prefer `NEXT_PUBLIC_CONVEX_URL`; optional `CONVEX_URL` override for server-only config.
 */
export function getConvexDeploymentUrl(): string | undefined {
  const fromPublic = process.env.NEXT_PUBLIC_CONVEX_URL?.trim();
  if (fromPublic !== undefined && fromPublic.length > 0) {
    return fromPublic;
  }
  const fromServer = process.env.CONVEX_URL?.trim();
  if (fromServer !== undefined && fromServer.length > 0) {
    return fromServer;
  }
  return undefined;
}
