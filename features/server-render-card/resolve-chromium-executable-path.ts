import chromium from '@sparticuz/chromium-min';

/** Matches `dependencies.@sparticuz/chromium-min` and Puppeteer’s supported Chrome (see pptr.dev/chromium-support). */
const SPARTICUZ_CHROMIUM_RELEASE_TAG = 'v143.0.4';
const SPARTICUZ_CHROMIUM_VERSION = '143.0.4';

let cachedExecutablePath: string | null = null;
let downloadPromise: Promise<string> | null = null;

function getDefaultChromiumPackTarUrl(): string {
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
  return `https://github.com/Sparticuz/chromium/releases/download/${SPARTICUZ_CHROMIUM_RELEASE_TAG}/chromium-v${SPARTICUZ_CHROMIUM_VERSION}-pack.${arch}.tar`;
}

function getVercelHostedChromiumPackTarUrl(): string | undefined {
  const host =
    process.env.VERCEL_URL?.trim() ??
    process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (host === undefined || host.length === 0) {
    return undefined;
  }
  return `https://${host}/chromium-pack.tar`;
}

function resolveChromiumPackUrl(): string {
  const explicit = process.env.CHROMIUM_PACK_URL?.trim();
  if (explicit !== undefined && explicit.length > 0) {
    return explicit;
  }
  const vercelHosted = getVercelHostedChromiumPackTarUrl();
  if (vercelHosted !== undefined) {
    return vercelHosted;
  }
  return getDefaultChromiumPackTarUrl();
}

/**
 * Resolves the `@sparticuz/chromium-min` binary path (not for system Chrome — use `PUPPETEER_EXECUTABLE_PATH` in the caller).
 *
 * 1. `CHROMIUM_MIN_BROTLI_PATH` — directory with `chromium.br`, `fonts.tar.br`, `swiftshader.tar.br`.
 * 2. `CHROMIUM_PACK_URL`, or on Vercel `https://${VERCEL_URL}/chromium-pack.tar` from postinstall, else Sparticuz GitHub `chromium-v*-pack.*.tar`.
 *
 * Caches the resolved path (and dedupes concurrent downloads) like puppeteer-on-vercel.
 */
export async function resolveSparticuzChromiumExecutablePath(): Promise<string> {
  const brotliPath = process.env.CHROMIUM_MIN_BROTLI_PATH?.trim();
  if (brotliPath !== undefined && brotliPath.length > 0) {
    return await chromium.executablePath(brotliPath);
  }

  if (cachedExecutablePath !== null) {
    return cachedExecutablePath;
  }

  if (downloadPromise === null) {
    const packUrl = resolveChromiumPackUrl();
    downloadPromise = chromium
      .executablePath(packUrl)
      .then((path) => {
        cachedExecutablePath = path;
        return path;
      })
      .catch((error) => {
        downloadPromise = null;
        throw error;
      });
  }

  return await downloadPromise;
}
