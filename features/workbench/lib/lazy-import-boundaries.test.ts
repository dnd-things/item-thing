import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

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

test('loadHtmlToImage boundaries', async () => {
  let htmlToImageLoads = 0;
  let shouldReject = false;
  const overrides: Record<string, unknown> = {};
  Object.defineProperty(overrides, 'html-to-image', {
    enumerable: true,
    get() {
      htmlToImageLoads += 1;
      if (shouldReject) {
        shouldReject = false;
        throw new Error('import failed');
      }
      return {
        toPng: async () => 'data:image/png;base64,AA==',
        toJpeg: async () => 'data:image/jpeg;base64,AA==',
      };
    },
  });
  const load = loader(overrides);
  const { loadHtmlToImage } = load(
    'features/workbench/lib/html-to-image-loader.ts',
  ) as {
    loadHtmlToImage: () => Promise<typeof import('html-to-image')>;
  };
  assert.equal(htmlToImageLoads, 0);
  const first = loadHtmlToImage();
  const second = loadHtmlToImage();
  assert.equal(first, second);
  await first;
  assert.equal(htmlToImageLoads, 1);
  await second;
  assert.equal(htmlToImageLoads, 1);

  shouldReject = true;
  const freshOverrides: Record<string, unknown> = {};
  Object.defineProperty(freshOverrides, 'html-to-image', {
    enumerable: true,
    get() {
      htmlToImageLoads += 1;
      if (shouldReject) {
        shouldReject = false;
        throw new Error('import failed');
      }
      return {
        toPng: async () => 'data:image/png;base64,AA==',
        toJpeg: async () => 'data:image/jpeg;base64,AA==',
      };
    },
  });
  const freshLoad = loader(freshOverrides);
  const { loadHtmlToImage: loadAfterReject } = freshLoad(
    'features/workbench/lib/html-to-image-loader.ts',
  ) as {
    loadHtmlToImage: () => Promise<typeof import('html-to-image')>;
  };
  const loadsBeforeReject = htmlToImageLoads;
  await assert.rejects(() => loadAfterReject());
  assert.equal(htmlToImageLoads, loadsBeforeReject + 1);
  await loadAfterReject();
  assert.equal(htmlToImageLoads, loadsBeforeReject + 2);
});

test('workbench lazy import source boundaries', () => {
  const executeRasterSource = fs.readFileSync(
    path.join(root, 'features/workbench/lib/execute-card-raster-export.ts'),
    'utf8',
  );
  assert.equal(executeRasterSource.includes("from 'html-to-image'"), false);
  assert.equal(executeRasterSource.includes("import('html-to-image')"), false);

  const downloadSource = fs.readFileSync(
    path.join(root, 'features/workbench/components/download-controls-card.tsx'),
    'utf8',
  );
  assert.equal(downloadSource.includes("from 'html-to-image'"), false);
  assert.match(downloadSource, /loadHtmlToImage/);
  assert.equal(downloadSource.includes('skipAutoScale'), false);
  assert.equal(downloadSource.includes('quality: 0.92'), false);

  const previewSource = fs.readFileSync(
    path.join(root, 'features/workbench/components/preview-column.tsx'),
    'utf8',
  );
  assert.equal(
    previewSource.includes("from './workbench-settings-drawer'"),
    false,
  );
  assert.match(previewSource, /import\('\.\/workbench-settings-drawer'\)/);
  assert.match(previewSource, /ssr:\s*false/);
  assert.match(previewSource, /hasOpenedSettings \|\| isDrawerOpen/);

  const cardExportSource = fs.readFileSync(
    path.join(root, 'app/internal/card-export/card-export-client.tsx'),
    'utf8',
  );
  assert.match(cardExportSource, /from 'html-to-image'/);
  assert.equal(cardExportSource.includes('loadHtmlToImage'), false);
  assert.equal(cardExportSource.includes("import('html-to-image')"), false);
  assert.equal(cardExportSource.includes('skipAutoScale'), false);
  assert.equal(cardExportSource.includes('quality: 0.92'), false);
});
