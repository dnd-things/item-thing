import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { Browser, BrowserContext, Page } from 'puppeteer-core';
import { createCardExportBrowserSession } from './card-export-browser-session.ts';

type FakeBrowser = {
  connected: boolean;
  newPage: () => Promise<Page>;
  createBrowserContext: () => Promise<BrowserContext>;
  close: () => Promise<void>;
  on: (event: string, handler: () => void) => void;
};

function createFakeSessionHarness() {
  let launchCount = 0;
  let closeCount = 0;
  let contextCloseCount = 0;
  const browsers: FakeBrowser[] = [];

  const makeBrowser = (options?: { connected?: boolean }): FakeBrowser => {
    const browser: FakeBrowser = {
      connected: options?.connected ?? true,
      on() {
        return undefined;
      },
      async newPage() {
        return { id: `page-${launchCount}` } as unknown as Page;
      },
      async createBrowserContext() {
        return {
          async newPage() {
            return { id: `ctx-page-${contextCloseCount}` } as unknown as Page;
          },
          async close() {
            contextCloseCount += 1;
          },
        } as BrowserContext;
      },
      async close() {
        closeCount += 1;
        browser.connected = false;
      },
    };
    browsers.push(browser);
    return browser;
  };

  let launchImpl: () => Promise<Browser> = async () => {
    launchCount += 1;
    return makeBrowser() as unknown as Browser;
  };

  const session = createCardExportBrowserSession(() => launchImpl());

  return {
    session,
    setLaunch(fn: () => Promise<Browser>) {
      launchImpl = fn;
    },
    launchDefault: async () => {
      launchCount += 1;
      return makeBrowser() as unknown as Browser;
    },
    get counts() {
      return { launchCount, closeCount, contextCloseCount };
    },
    get lastBrowser() {
      return browsers.at(-1);
    },
    browsers,
  };
}

describe('card export browser session', () => {
  const previousVercel = process.env.VERCEL_ENV;

  test('cold mode launches and closes the browser on every job', async () => {
    process.env.VERCEL_ENV = 'preview';
    try {
      const harness = createFakeSessionHarness();
      await harness.session.run(async () => undefined);
      await harness.session.run(async () => undefined);
      assert.equal(harness.counts.launchCount, 2);
      assert.equal(harness.counts.closeCount, 2);
      assert.equal(harness.counts.contextCloseCount, 0);
    } finally {
      if (previousVercel === undefined) {
        delete process.env.VERCEL_ENV;
      } else {
        process.env.VERCEL_ENV = previousVercel;
      }
    }
  });

  test('warm mode reuses one browser and closes a context per job', async () => {
    delete process.env.VERCEL_ENV;
    try {
      const harness = createFakeSessionHarness();
      await harness.session.run(async () => undefined);
      await harness.session.run(async () => undefined);
      assert.equal(harness.counts.launchCount, 1);
      assert.equal(harness.counts.closeCount, 0);
      assert.equal(harness.counts.contextCloseCount, 2);
    } finally {
      if (previousVercel === undefined) {
        delete process.env.VERCEL_ENV;
      } else {
        process.env.VERCEL_ENV = previousVercel;
      }
    }
  });

  test('warm mode launches again when the browser is disconnected', async () => {
    delete process.env.VERCEL_ENV;
    try {
      const harness = createFakeSessionHarness();
      await harness.session.run(async () => undefined);
      const browser = harness.lastBrowser;
      assert.ok(browser);
      browser.connected = false;
      await harness.session.run(async () => undefined);
      assert.equal(harness.counts.launchCount, 2);
      assert.equal(harness.counts.contextCloseCount, 2);
    } finally {
      if (previousVercel === undefined) {
        delete process.env.VERCEL_ENV;
      } else {
        process.env.VERCEL_ENV = previousVercel;
      }
    }
  });

  test('page errors still release the slot and keep a warm browser', async () => {
    delete process.env.VERCEL_ENV;
    try {
      const harness = createFakeSessionHarness();
      await assert.rejects(
        harness.session.run(async () => {
          throw new Error('page failed');
        }),
        { message: 'page failed' },
      );
      assert.equal(harness.counts.launchCount, 1);
      assert.equal(harness.counts.closeCount, 0);
      assert.equal(harness.counts.contextCloseCount, 1);
      await harness.session.run(async () => undefined);
      assert.equal(harness.counts.launchCount, 1);
      assert.equal(harness.counts.contextCloseCount, 2);
    } finally {
      if (previousVercel === undefined) {
        delete process.env.VERCEL_ENV;
      } else {
        process.env.VERCEL_ENV = previousVercel;
      }
    }
  });

  test('overlapping jobs start the next launch only after the first finishes', async () => {
    process.env.VERCEL_ENV = 'preview';
    try {
      const harness = createFakeSessionHarness();
      let releaseFirst: () => void = () => undefined;
      let firstWorkEntered = false;
      const first = harness.session.run(() => {
        firstWorkEntered = true;
        return new Promise<void>((resolve) => {
          releaseFirst = resolve;
        });
      });
      let secondStarted = false;
      const second = harness.session.run(async () => {
        secondStarted = true;
      });
      while (!firstWorkEntered) {
        await Promise.resolve();
      }
      assert.equal(secondStarted, false);
      assert.equal(harness.counts.launchCount, 1);
      releaseFirst();
      await first;
      await second;
      assert.equal(secondStarted, true);
      assert.equal(harness.counts.launchCount, 2);
    } finally {
      if (previousVercel === undefined) {
        delete process.env.VERCEL_ENV;
      } else {
        process.env.VERCEL_ENV = previousVercel;
      }
    }
  });

  test('launch failures still release the slot', async () => {
    process.env.VERCEL_ENV = 'preview';
    try {
      let launchCalls = 0;
      const harness = createFakeSessionHarness();
      harness.setLaunch(async () => {
        launchCalls += 1;
        if (launchCalls === 1) {
          throw new Error('launch failed');
        }
        return harness.launchDefault();
      });
      await assert.rejects(
        harness.session.run(async () => undefined),
        {
          message: 'launch failed',
        },
      );
      await harness.session.run(async () => undefined);
      assert.equal(launchCalls, 2);
      assert.equal(harness.counts.closeCount, 1);
    } finally {
      if (previousVercel === undefined) {
        delete process.env.VERCEL_ENV;
      } else {
        process.env.VERCEL_ENV = previousVercel;
      }
    }
  });
});
