import chromium from '@sparticuz/chromium-min';
import type { Browser } from 'puppeteer-core';
import puppeteer from 'puppeteer-core';

import type { CardExportBrowserPayload } from './card-export-payload';
import { dataUrlToBuffer } from './data-url-to-buffer';
import { resolveSparticuzChromiumExecutablePath } from './resolve-chromium-executable-path';

export interface RunPuppeteerCardExportParams {
  baseUrl: string;
  payload: CardExportBrowserPayload;
  internalSecret: string;
}

export interface RunPuppeteerCardExportResult {
  body: Buffer;
  contentType: string;
}

const CARD_EXPORT_VIEWPORT = {
  deviceScaleFactor: 1,
  hasTouch: false,
  height: 1080,
  isLandscape: true,
  isMobile: false,
  width: 1920,
} as const;

const SERVERLESS_CHROMIUM_LAUNCH_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
] as const;

async function launchBrowserWithCustomExecutablePath(
  executablePath: string,
): Promise<Browser> {
  return await puppeteer.launch({
    args: [...SERVERLESS_CHROMIUM_LAUNCH_ARGS],
    defaultViewport: CARD_EXPORT_VIEWPORT,
    executablePath,
    headless: true,
  });
}

async function launchBrowserWithBundledPuppeteer(): Promise<Browser> {
  const puppeteerBundled = await import('puppeteer');
  return await puppeteerBundled.default.launch({
    defaultViewport: CARD_EXPORT_VIEWPORT,
    headless: true,
  });
}

async function launchBrowserWithSparticuzChromium(): Promise<Browser> {
  const executablePath = await resolveSparticuzChromiumExecutablePath();
  return await puppeteer.launch({
    args: puppeteer.defaultArgs({
      args: chromium.args,
      headless: 'shell',
    }),
    defaultViewport: CARD_EXPORT_VIEWPORT,
    executablePath,
    headless: 'shell',
  });
}

async function launchBrowserForCardExport(): Promise<Browser> {
  const customExecutablePath = process.env.PUPPETEER_EXECUTABLE_PATH?.trim();
  if (customExecutablePath !== undefined && customExecutablePath.length > 0) {
    return await launchBrowserWithCustomExecutablePath(customExecutablePath);
  }

  if (process.env.VERCEL_ENV === undefined) {
    return await launchBrowserWithBundledPuppeteer();
  }

  return await launchBrowserWithSparticuzChromium();
}

export async function runPuppeteerCardExport(
  params: RunPuppeteerCardExportParams,
): Promise<RunPuppeteerCardExportResult> {
  const serializedPayload = JSON.stringify(params.payload);

  const browser = await launchBrowserForCardExport();

  try {
    const page = await browser.newPage();
    await page.setExtraHTTPHeaders({
      'x-internal-secret': params.internalSecret,
    });

    await page.evaluateOnNewDocument((inner: string) => {
      const w = window as unknown as {
        __MAGIC_ITEM_CARD_EXPORT__?: CardExportBrowserPayload;
      };
      w.__MAGIC_ITEM_CARD_EXPORT__ = JSON.parse(
        inner,
      ) as CardExportBrowserPayload;
    }, serializedPayload);

    const exportUrl = new URL('/internal/card-export', params.baseUrl).href;
    await page.goto(exportUrl, { waitUntil: 'load', timeout: 120_000 });

    await page.waitForFunction(
      () => {
        const w = window as unknown as {
          __CARD_EXPORT_STATUS__?: string;
        };
        return (
          w.__CARD_EXPORT_STATUS__ === 'ok' ||
          w.__CARD_EXPORT_STATUS__ === 'error'
        );
      },
      { timeout: 120_000 },
    );

    const outcome = await page.evaluate(() => {
      const w = window as unknown as {
        __CARD_EXPORT_STATUS__?: string;
        __CARD_EXPORT_ERROR__?: string;
        __CARD_EXPORT_RESULT__?: string;
      };
      return {
        status: w.__CARD_EXPORT_STATUS__,
        error: w.__CARD_EXPORT_ERROR__,
        result: w.__CARD_EXPORT_RESULT__,
      };
    });

    if (outcome.status !== 'ok' || outcome.result === undefined) {
      throw new Error(outcome.error ?? 'card_export_failed');
    }

    const { mimeType, buffer } = dataUrlToBuffer(outcome.result);
    return {
      body: buffer,
      contentType: mimeType,
    };
  } finally {
    await browser.close();
  }
}
