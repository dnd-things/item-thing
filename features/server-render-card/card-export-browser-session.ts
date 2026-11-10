import type { Browser, BrowserContext, Page } from 'puppeteer-core';

export interface CardExportSessionTimings {
  queueWaitMs: number;
  launchMs: number;
  reused: boolean;
}

export interface CardExportBrowserSession {
  run<T>(
    work: (page: Page) => Promise<T>,
  ): Promise<{ value: T; timings: CardExportSessionTimings }>;
}

function warmReuseEnabled(): boolean {
  return process.env.VERCEL_ENV === undefined;
}

export function createCardExportBrowserSession(
  launchBrowser: () => Promise<Browser>,
): CardExportBrowserSession {
  let running = false;
  let warmBrowser: Browser | null = null;
  const waiters: Array<{
    work: (page: Page) => Promise<unknown>;
    enqueuedAt: number;
    resolve: (result: {
      value: unknown;
      timings: CardExportSessionTimings;
    }) => void;
    reject: (error: unknown) => void;
  }> = [];

  const dropWarmBrowserIfDisconnected = () => {
    if (warmBrowser && !warmBrowser.connected) {
      warmBrowser = null;
    }
  };

  const pump = (): void => {
    if (running || waiters.length === 0) {
      return;
    }
    running = true;
    const job = waiters.shift();
    if (!job) {
      running = false;
      return;
    }
    void (async () => {
      const queueWaitMs = Date.now() - job.enqueuedAt;
      const warm = warmReuseEnabled();
      let launchMs = 0;
      let reused = false;
      let browser: Browser | undefined;
      let context: BrowserContext | null = null;
      try {
        dropWarmBrowserIfDisconnected();
        if (warm && warmBrowser?.connected) {
          browser = warmBrowser;
          reused = true;
        } else {
          const launchStart = Date.now();
          browser = await launchBrowser();
          launchMs = Date.now() - launchStart;
          if (warm) {
            warmBrowser = browser;
            browser.on('disconnected', () => {
              if (warmBrowser === browser) {
                warmBrowser = null;
              }
            });
          }
        }

        let page: Page;
        if (warm) {
          context = await browser.createBrowserContext();
          page = await context.newPage();
        } else {
          page = await browser.newPage();
        }

        const value = await job.work(page);
        job.resolve({
          value,
          timings: { queueWaitMs, launchMs, reused },
        });
      } catch (error) {
        job.reject(error);
      } finally {
        if (context) {
          try {
            await context.close();
          } catch {}
        }
        if (!warm && browser) {
          try {
            await browser.close();
          } catch {}
        }
        running = false;
        pump();
      }
    })();
  };

  return {
    run<T>(work: (page: Page) => Promise<T>) {
      return new Promise<{ value: T; timings: CardExportSessionTimings }>(
        (resolve, reject) => {
          waiters.push({
            work: work as (page: Page) => Promise<unknown>,
            enqueuedAt: Date.now(),
            resolve: resolve as (result: {
              value: unknown;
              timings: CardExportSessionTimings;
            }) => void,
            reject,
          });
          pump();
        },
      );
    },
  };
}
