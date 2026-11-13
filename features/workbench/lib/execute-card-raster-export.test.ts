import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { readArtworkLimitError } from '../../../lib/artwork-limit-error.ts';
import { artworkLimitCopy } from './artwork-geometry.ts';

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..',
);
const require = createRequire(path.join(root, 'package.json'));

function loader(overrides: Record<string, unknown> = {}) {
  const ts = require('typescript') as typeof import('typescript');
  const cache = new Map<string, { exports: Record<string, unknown> }>();
  const load = (file: string): Record<string, unknown> => {
    const resolved = path.resolve(root, file);
    const cached = cache.get(resolved);
    if (cached) {
      return cached.exports;
    }
    const module = { exports: {} as Record<string, unknown> };
    cache.set(resolved, module);
    const source = ts.transpileModule(fs.readFileSync(resolved, 'utf8'), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
        esModuleInterop: true,
      },
    }).outputText;
    const localRequire = (id: string): unknown => {
      if (Object.hasOwn(overrides, id)) {
        return overrides[id];
      }
      if (id.endsWith('.css')) {
        return {
          __esModule: true,
          default: new Proxy({}, { get: (_target, key) => key }),
        };
      }
      if (id.startsWith('.') || id.startsWith('@/')) {
        let next = id.startsWith('@/')
          ? path.join(root, id.slice(2))
          : path.resolve(path.dirname(resolved), id);
        if (!fs.existsSync(next)) {
          if (fs.existsSync(`${next}.ts`)) {
            next = `${next}.ts`;
          } else if (fs.existsSync(`${next}.tsx`)) {
            next = `${next}.tsx`;
          } else {
            return require(next);
          }
        }
        if (next.endsWith('.ts') || next.endsWith('.tsx')) {
          return load(next);
        }
        return require(next);
      }
      return require(id);
    };
    new Function('require', 'module', 'exports', source)(
      localRequire,
      module,
      module.exports,
    );
    return module.exports;
  };
  return load;
}

function readyNode(generation: number) {
  const images = [{ complete: true, naturalWidth: 32 }];
  const child = {
    getAttribute(name: string) {
      if (name === 'data-artwork-state') {
        return 'ready';
      }
      if (name === 'data-export-generation') {
        return String(generation);
      }
      return null;
    },
  };
  return {
    offsetWidth: 432,
    offsetHeight: 600,
    getAttribute: () => null,
    querySelector: () => child,
    querySelectorAll: () => images,
  };
}

function staleGenerationNode(requestedGeneration: number) {
  const images = [{ complete: true, naturalWidth: 32 }];
  const child = {
    getAttribute(name: string) {
      if (name === 'data-artwork-state') {
        return 'ready';
      }
      if (name === 'data-export-generation') {
        return String(requestedGeneration + 99);
      }
      return null;
    },
  };
  return {
    offsetWidth: 432,
    offsetHeight: 600,
    getAttribute: () => null,
    querySelector: () => child,
    querySelectorAll: () => images,
  };
}

const load = loader();
const { executeCardRasterExport } = load(
  'features/workbench/lib/execute-card-raster-export.ts',
) as {
  executeCardRasterExport: typeof import('./execute-card-raster-export.ts').executeCardRasterExport;
};

test('PNG in-budget returns rasterizer data URL', async () => {
  const pngUrl = 'data:image/png;base64,iVBORw0KGgo=';
  let toPngCalls = 0;
  let toJpegCalls = 0;
  const node = readyNode(3);
  const result = await executeCardRasterExport({
    node,
    format: 'png',
    pixelRatio: 2,
    generation: 3,
    rasterizer: {
      toPng: async (_target, options) => {
        toPngCalls += 1;
        assert.deepEqual(options, { pixelRatio: 2, skipAutoScale: true });
        return pngUrl;
      },
      toJpeg: async () => {
        toJpegCalls += 1;
        return 'data:image/jpeg;base64,AA==';
      },
    },
  });
  assert.equal(result, pngUrl);
  assert.equal(toPngCalls, 1);
  assert.equal(toJpegCalls, 0);
});

test('JPEG returns rasterizer data URL with quality 0.92', async () => {
  const jpegUrl = 'data:image/jpeg;base64,/9j/4AAQ';
  let toJpegCalls = 0;
  const result = await executeCardRasterExport({
    node: readyNode(1),
    format: 'jpg',
    pixelRatio: 1,
    generation: 1,
    rasterizer: {
      toPng: async () => 'data:image/png;base64,AA==',
      toJpeg: async (_target, options) => {
        toJpegCalls += 1;
        assert.deepEqual(options, {
          pixelRatio: 1,
          quality: 0.92,
          skipAutoScale: true,
        });
        return jpegUrl;
      },
    },
  });
  assert.equal(result, jpegUrl);
  assert.equal(toJpegCalls, 1);
});

test('over-budget box rejects with card_output and no data URL', async () => {
  for (const format of ['png', 'jpg'] as const) {
    let encoded = false;
    await assert.rejects(
      () =>
        executeCardRasterExport({
          node: {
            ...readyNode(1),
            offsetHeight: 20_000,
          },
          format,
          pixelRatio: 2,
          generation: 1,
          rasterizer: {
            toPng: async () => {
              encoded = true;
              return 'data:image/png;base64,AA==';
            },
            toJpeg: async () => {
              encoded = true;
              return 'data:image/jpeg;base64,AA==';
            },
          },
        }),
      (error: unknown) => {
        assert.equal(readArtworkLimitError(error)?.code, 'card_output');
        return true;
      },
    );
    assert.equal(encoded, false);
  }
});

test('wrong generation rejects with artwork failed and no data URL', async () => {
  const realNow = Date.now;
  let now = 0;
  Date.now = () => now;
  const frames: Array<() => void> = [];
  const previousFrame = globalThis.requestAnimationFrame;
  globalThis.requestAnimationFrame = ((callback: FrameRequestCallback) => {
    frames.push(() => {
      now += 16;
      callback(now);
    });
    return frames.length;
  }) as typeof requestAnimationFrame;
  let encoded = false;
  try {
    const pending = executeCardRasterExport({
      node: staleGenerationNode(5),
      format: 'png',
      pixelRatio: 2,
      generation: 5,
      rasterizer: {
        toPng: async () => {
          encoded = true;
          return 'data:image/png;base64,AA==';
        },
        toJpeg: async () => {
          encoded = true;
          return 'data:image/jpeg;base64,AA==';
        },
      },
    });
    while (frames.length > 0 && now < 6000) {
      frames.shift()?.();
      await Promise.resolve();
    }
    await assert.rejects(pending, {
      message: artworkLimitCopy.artworkFailed,
    });
    assert.equal(encoded, false);
  } finally {
    Date.now = realNow;
    globalThis.requestAnimationFrame = previousFrame;
  }
});

test('settleSize past budget rejects; shrinking restores export', async () => {
  const node = readyNode(1);
  let encoded = false;
  await assert.rejects(
    () =>
      executeCardRasterExport({
        node,
        format: 'png',
        pixelRatio: 2,
        generation: 1,
        settleSize: async (target) => {
          target.offsetHeight = 20_000;
        },
        rasterizer: {
          toPng: async () => {
            encoded = true;
            return 'data:image/png;base64,AA==';
          },
          toJpeg: async () => {
            encoded = true;
            return 'data:image/jpeg;base64,AA==';
          },
        },
      }),
    (error: unknown) => {
      assert.equal(readArtworkLimitError(error)?.code, 'card_output');
      return true;
    },
  );
  assert.equal(encoded, false);

  const oversize = readyNode(2);
  oversize.offsetHeight = 20_000;
  const pngUrl = 'data:image/png;base64,ok==';
  encoded = false;
  const result = await executeCardRasterExport({
    node: oversize,
    format: 'png',
    pixelRatio: 2,
    generation: 2,
    settleSize: async (target) => {
      target.offsetHeight = 600;
    },
    rasterizer: {
      toPng: async () => {
        encoded = true;
        return pngUrl;
      },
      toJpeg: async () => {
        encoded = true;
        return 'data:image/jpeg;base64,AA==';
      },
    },
  });
  assert.equal(result, pngUrl);
  assert.equal(encoded, true);
});
