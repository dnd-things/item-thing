import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
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

function deferred() {
  let resolve: (value?: unknown) => void = () => undefined;
  const promise = new Promise((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

async function flush() {
  for (let i = 0; i < 30; i += 1) {
    await Promise.resolve();
  }
}

test('export surfaces, download ownership, and route limits', async () => {
  const React = require('react') as typeof import('react');
  const load = loader({
    './mechanics-markdown': {
      MechanicsMarkdown: ({ children }: { children?: React.ReactNode }) =>
        React.createElement('div', null, children),
    },
    'next/image': {
      __esModule: true,
      default: ({
        fill: _fill,
        unoptimized: _unoptimized,
        ...props
      }: React.ImgHTMLAttributes<HTMLImageElement> & {
        fill?: boolean;
        unoptimized?: boolean;
      }) => React.createElement('img', props),
    },
  });
  const defaults = (
    load('features/workbench/lib/workbench-options.ts') as {
      defaultMagicItemWorkbenchState: Record<string, unknown>;
    }
  ).defaultMagicItemWorkbenchState;
  const { CardExportSurface } = load(
    'features/workbench/components/card-export-surface.tsx',
  ) as {
    CardExportSurface: (props: {
      prepared: unknown;
      surfaceRef: { current: null };
      exportGeneration: number;
    }) => { props: { children: { props: Record<string, unknown> } } };
  };
  const server =
    require('react-dom/server') as typeof import('react-dom/server');
  for (const cardStyle of ['print', 'minimal'] as const) {
    const prepared = {
      captured: {
        state: { ...defaults, cardStyle },
        bundle: null,
      },
      preparedUrl: '',
      alreadyTransformed: true,
      sourceDataUrl: '',
      release() {
        return undefined;
      },
    };
    const tree = CardExportSurface({
      prepared,
      surfaceRef: { current: null },
      exportGeneration: 4,
    });
    const captureWrapper = tree.props.children;
    assert.equal(captureWrapper.props['data-artwork-state'], undefined);
    const markup = server.renderToStaticMarkup(
      tree as unknown as import('react').ReactElement,
    );
    assert.match(markup, /data-artwork-state="ready"/);
    assert.match(markup, /data-export-generation="4"/);
    assert.equal(markup.includes('data-artwork-state="ready"'), true);
  }

  const { PreviewSurface } = load(
    'features/workbench/components/preview-surface.tsx',
  ) as {
    PreviewSurface: React.ComponentType<{
      cardRef: { current: null };
      workbenchState: Record<string, unknown>;
    }>;
  };
  const previewMarkup = server.renderToStaticMarkup(
    React.createElement(PreviewSurface, {
      cardRef: { current: null },
      workbenchState: {
        ...defaults,
        cardLayout: 'image-right',
        sideLayoutFlow: 'fixed',
      },
    }),
  );
  assert.equal(
    previewMarkup.includes('data-card-preview-surface-height'),
    false,
  );
  const workbenchSource = fs.readFileSync(
    path.join(root, 'features/workbench/item-card-workbench.tsx'),
    'utf8',
  );
  assert.equal(
    workbenchSource.includes('readDisplayedCardPreviewSurfaceHeight'),
    false,
  );

  const slots: unknown[] = [];
  let cursor = 0;
  const refs: Array<{ current: unknown }> = [];
  const hooks = {
    ...React,
    useState(init: unknown) {
      const index = cursor;
      cursor += 1;
      if (!(index in slots)) {
        slots[index] =
          typeof init === 'function' ? (init as () => unknown)() : init;
      }
      return [
        slots[index],
        (value: unknown) => {
          slots[index] =
            typeof value === 'function'
              ? (value as (current: unknown) => unknown)(slots[index])
              : value;
          if (index === 3) {
            const surface = refs[1];
            if (surface) {
              surface.current = value
                ? {
                    offsetWidth: 432,
                    offsetHeight: 600,
                    getAttribute: () => null,
                  }
                : null;
            }
          }
        },
      ];
    },
    useRef(init: unknown) {
      const index = cursor;
      cursor += 1;
      if (!(index in slots)) {
        const ref = { current: init };
        slots[index] = ref;
        refs.push(ref);
      }
      return slots[index];
    },
    useCallback: (fn: unknown) => fn,
  };
  const exportModule = load(
    'features/workbench/lib/export-card-artwork.ts',
  ) as {
    prepareCapturedExport: unknown;
    waitForArtworkState: unknown;
    assertMeasuredCardOutput: unknown;
  };
  const captureGate = deferred();
  const captures: unknown[] = [];
  const links: Array<{ filename: string | undefined }> = [];
  let itemName = 'Captured A';
  const componentLoader = loader({
    react: hooks,
    '@/components/ui/button': { Button: 'button' },
    '@/components/ui/toggle-group': {
      ToggleGroup: 'toggles',
      ToggleGroupItem: 'toggle',
    },
    '@hugeicons/core-free-icons': { Download04Icon: {} },
    '@hugeicons/react': { HugeiconsIcon: () => null },
    './card-export-surface': { CardExportSurface: () => null },
    '../lib/export-card-artwork': {
      ...exportModule,
      prepareCapturedExport: async (captured: unknown) => ({
        captured,
        preparedUrl: 'canonical',
        sourceDataUrl: 'canonical',
        alreadyTransformed: true,
        release() {
          return undefined;
        },
      }),
      waitForArtworkState: async () => undefined,
      assertMeasuredCardOutput() {
        return undefined;
      },
    },
    '../lib/execute-card-raster-export': {
      executeCardRasterExport: async (input: {
        format: 'png' | 'jpg';
        pixelRatio: 1 | 2;
        node: unknown;
        rasterizer: {
          toPng: (
            node: unknown,
            options: { pixelRatio: 1 | 2; skipAutoScale: true },
          ) => Promise<string>;
          toJpeg: (
            node: unknown,
            options: {
              pixelRatio: 1 | 2;
              quality: number;
              skipAutoScale: true;
            },
          ) => Promise<string>;
        };
      }) => {
        if (input.format === 'png') {
          return input.rasterizer.toPng(input.node, {
            pixelRatio: input.pixelRatio,
            skipAutoScale: true,
          });
        }
        return input.rasterizer.toJpeg(input.node, {
          pixelRatio: input.pixelRatio,
          quality: 0.92,
          skipAutoScale: true,
        });
      },
    },
    'html-to-image': {
      toPng: async (node: unknown) => {
        captures.push(node);
        await captureGate.promise;
        return 'data:image/png;base64,AA==';
      },
      toJpeg: async () => {
        throw new Error('unexpected');
      },
    },
  });
  const { DownloadControlsCard } = componentLoader(
    'features/workbench/components/download-controls-card.tsx',
  ) as {
    DownloadControlsCard: (props: unknown) => {
      props: { children?: unknown };
      type?: unknown;
    };
  };
  let callbackName = '';
  const props = {
    cardRef: { current: null },
    getItemName: () => itemName,
    captureExport: (input: { format: 'png' | 'jpg'; pixelRatio: 1 | 2 }) => ({
      state: { ...defaults, itemName: 'Captured A' },
      snapshot: { itemName: 'Captured A' },
      ...input,
    }),
    onExportComplete: (payload: {
      workbenchSnapshot: { itemName: string };
    }) => {
      callbackName = payload.workbenchSnapshot.itemName;
    },
  };
  const previousFrame = globalThis.requestAnimationFrame;
  const previousDocument = globalThis.document;
  globalThis.requestAnimationFrame = ((callback: FrameRequestCallback) => {
    queueMicrotask(() => callback(0));
    return 1;
  }) as typeof requestAnimationFrame;
  globalThis.document = {
    fonts: { ready: Promise.resolve() },
    createElement: () => {
      const link: { download?: string; href?: string; click: () => void } = {
        click() {
          links.push({ filename: link.download });
        },
      };
      return link;
    },
  } as unknown as Document;
  const render = () => {
    cursor = 0;
    return DownloadControlsCard(props);
  };
  const findButton = (
    tree: unknown,
  ): { props: { onClick?: () => void; disabled?: boolean } } | null => {
    if (!tree || typeof tree !== 'object') {
      return null;
    }
    const element = tree as {
      type?: unknown;
      props?: { onClick?: () => void; disabled?: boolean; children?: unknown };
    };
    if (element.type === 'button' && element.props) {
      return { props: element.props };
    }
    const kids = element.props?.children;
    for (const child of Array.isArray(kids) ? kids : [kids]) {
      const found = findButton(child);
      if (found) {
        return found;
      }
    }
    return null;
  };
  const button = findButton(render());
  assert.ok(button);
  const firstClick = button.props.onClick as () => void;
  firstClick();
  firstClick();
  await flush();
  assert.equal(captures.length, 1);
  assert.ok(slots[3]);
  assert.equal(refs[1]?.current == null, false);
  const blocked = findButton(render());
  assert.equal(blocked?.props.disabled, true);
  blocked?.props.onClick?.();
  await flush();
  assert.equal(captures.length, 1);
  assert.ok(slots[3]);
  itemName = 'Edited B';
  captureGate.resolve();
  await flush();
  assert.equal(links[0]?.filename, 'item-thing-captured-a.png');
  assert.equal(callbackName, 'Captured A');
  assert.equal(String(links[0]?.filename).includes('edited-b'), false);

  const frames: Array<() => void> = [];
  globalThis.requestAnimationFrame = ((callback: FrameRequestCallback) => {
    frames.push(() => callback(0));
    return frames.length;
  }) as typeof requestAnimationFrame;
  const early = findButton(render());
  early?.props.onClick?.();
  await flush();
  const held = refs[1]?.current;
  assert.ok(slots[3]);
  const rejected = findButton(render());
  rejected?.props.onClick?.();
  await flush();
  assert.equal(slots[3] == null, false);
  assert.equal(refs[1]?.current, held);
  frames.shift()?.();
  await flush();
  frames.shift()?.();
  await flush();
  assert.equal(captures.length, 2);
  assert.equal(
    slots[2] == null || !String(slots[2]).includes('not ready'),
    true,
  );
  globalThis.requestAnimationFrame = previousFrame;
  globalThis.document = previousDocument;

  const sharp = require('sharp') as typeof import('sharp');
  const oversize = await sharp({
    create: { width: 4097, height: 1, channels: 3, background: 'red' },
  })
    .png()
    .toBuffer();
  let mappedError: Error | undefined;
  try {
    await (
      load('lib/trim-transparent-bounds.ts') as {
        trimTransparentBounds: (input: Buffer) => Promise<unknown>;
      }
    ).trimTransparentBounds(oversize);
  } catch (error) {
    mappedError = error as Error;
  }
  assert.match(mappedError?.message ?? '', /4096px/);
  const { NextResponse } = require('next/server') as {
    NextResponse: typeof import('next/server').NextResponse;
  };
  let errorMode = 'source';
  const routeLoader = loader({
    'next/server': { NextResponse, after() {} },
    '@/lib/server-logger': { serverLogger: { info() {}, error() {} } },
    './get-convex-deployment-url': {
      getConvexDeploymentUrl: () => 'https://example.invalid',
    },
    './get-request-base-url': {
      getRequestBaseUrl: () => 'http://example.invalid',
    },
    './render-card-secret-auth': {
      getApiSecretOrThrow: () => 'fake',
      getInternalSecretOrThrow: () => 'fake',
      isApiRequestAuthorizedBySecret: () => true,
    },
    './render-card-form-schema': {
      parseRenderCardMultipartFormData: async () => ({
        ok: true,
        artworkBuffer: oversize,
        artwork: { name: 'wide.png' },
        fields: { format: 'png', pixelRatio: 2 },
        item: {},
      }),
    },
    './map-render-request-to-workbench-state': {
      mapRenderRequestToMagicItemWorkbenchState: async () => {
        if (errorMode === 'source') {
          throw mappedError;
        }
        return { workbenchState: defaults, originalMimeType: 'image/png' };
      },
    },
    './persist-card-export-to-convex': {
      persistCardExportToConvex: async () => undefined,
    },
    './run-puppeteer-card-export': {
      runPuppeteerCardExport: async () => {
        if (errorMode === 'render') {
          throw new Error('chromium died');
        }
        (
          exportModule as {
            assertMeasuredCardOutput: (w: number, h: number, r: 1 | 2) => void;
          }
        ).assertMeasuredCardOutput(432, 20000, 2);
      },
    },
  });
  const { handleRenderCardRoute } = routeLoader(
    'features/server-render-card/render-card-route-handler.ts',
  ) as {
    handleRenderCardRoute: (
      request: { formData: () => Promise<FormData> },
      style: 'print',
    ) => Promise<{
      status: number;
      json: () => Promise<{ error?: string; message?: string }>;
    }>;
  };
  const request = { formData: async () => new FormData() };
  const sourceResponse = await handleRenderCardRoute(request, 'print');
  const sourceBody = await sourceResponse.json();
  assert.equal(sourceResponse.status, 422);
  assert.equal(sourceBody.error, 'artwork_too_large');
  assert.match(sourceBody.message ?? '', /4096px/);
  errorMode = 'output';
  const outputResponse = await handleRenderCardRoute(request, 'print');
  const outputBody = await outputResponse.json();
  assert.equal(outputResponse.status, 422);
  assert.equal(outputBody.error, 'card_output_too_large');
  assert.equal(outputBody.message, artworkLimitCopy.cardOutput);
  errorMode = 'render';
  const renderResponse = await handleRenderCardRoute(request, 'print');
  const renderBody = await renderResponse.json();
  assert.equal(renderResponse.status, 500);
  assert.equal(renderBody.error, 'render_failed');
});

test('callers block the wrong generation, an incomplete image, and a failed image', async () => {
  const React = require('react') as typeof import('react');
  const sharp = require('sharp') as typeof import('sharp');
  type HookCell = {
    deps?: unknown[];
    createEffect?: () => void;
  };
  function createHost() {
    const cells: unknown[] = [];
    const effects: Array<() => void> = [];
    const refs: Array<{ current: unknown }> = [];
    let cursor = 0;
    let dirty = false;
    const react = {
      ...React,
      useState(init: unknown) {
        const index = cursor;
        cursor += 1;
        if (!(index in cells)) {
          cells[index] =
            typeof init === 'function' ? (init as () => unknown)() : init;
        }
        return [
          cells[index],
          (next: unknown) => {
            const value =
              typeof next === 'function'
                ? (next as (current: unknown) => unknown)(cells[index])
                : next;
            if (!Object.is(value, cells[index])) {
              cells[index] = value;
              dirty = true;
            }
          },
        ];
      },
      useRef(init: unknown) {
        const index = cursor;
        cursor += 1;
        if (!(index in cells)) {
          const ref = { current: init };
          cells[index] = ref;
          refs.push(ref);
        }
        return cells[index];
      },
      useCallback(fn: unknown) {
        return fn;
      },
      useMemo(fn: () => unknown) {
        return fn();
      },
      useEffect(fn: () => void, deps: unknown[]) {
        const index = cursor;
        cursor += 1;
        const previous = cells[index] as HookCell | undefined;
        const changed =
          !previous ||
          deps.some(
            (value, indexInDeps) =>
              !Object.is(value, previous.deps?.[indexInDeps]),
          );
        if (changed) {
          const cell: HookCell = {
            deps,
            createEffect: fn,
          };
          cells[index] = cell;
          effects.push(() => {
            fn();
          });
        }
      },
    };
    return {
      cells,
      refs,
      react,
      render(fn: () => unknown) {
        let result: unknown;
        let count = 0;
        do {
          dirty = false;
          cursor = 0;
          result = fn();
          assert.ok(count < 20);
          count += 1;
        } while (dirty);
        while (effects.length > 0) {
          effects.shift()?.();
        }
        return result;
      },
    };
  }
  function findButton(
    tree: unknown,
  ): { props: { onClick?: () => void; disabled?: boolean } } | null {
    if (!tree || typeof tree !== 'object') {
      return null;
    }
    const element = tree as {
      type?: unknown;
      props?: { onClick?: () => void; disabled?: boolean; children?: unknown };
    };
    if (element.type === 'button' && element.props) {
      return { props: element.props };
    }
    const kids = element.props?.children;
    for (const child of Array.isArray(kids) ? kids : [kids]) {
      const found = findButton(child);
      if (found) {
        return found;
      }
    }
    return null;
  }
  function findType(
    tree: unknown,
    type: unknown,
  ): { props: Record<string, unknown> } | null {
    if (!tree || typeof tree !== 'object') {
      return null;
    }
    const element = tree as {
      type?: unknown;
      props?: { children?: unknown };
    };
    if (element.type === type && element.props) {
      return { props: element.props as Record<string, unknown> };
    }
    const kids = element.props?.children;
    for (const child of Array.isArray(kids) ? kids : [kids]) {
      const found = findType(child, type);
      if (found) {
        return found;
      }
    }
    return null;
  }
  function readinessNode() {
    const state = {
      ready: 'pending',
      generation: '0',
      images: [{ complete: false, naturalWidth: 0 }],
    };
    return {
      state,
      node: {
        offsetWidth: 432,
        offsetHeight: 600,
        getAttribute: () => null,
        querySelector: (selector: string) => {
          assert.equal(selector, '[data-artwork-state]');
          return {
            getAttribute: (name: string) =>
              name === 'data-artwork-state'
                ? state.ready
                : name === 'data-export-generation'
                  ? state.generation
                  : null,
          };
        },
        querySelectorAll: () => state.images,
      },
    };
  }
  const frames: Array<() => void> = [];
  const captures: unknown[] = [];
  const links: string[] = [];
  const anchorHrefs: string[] = [];
  const previousFrame = globalThis.requestAnimationFrame;
  const previousDocument = globalThis.document;
  const previousWindow = (globalThis as { window?: unknown }).window;
  const previousExecutable = process.env.PUPPETEER_EXECUTABLE_PATH;
  const previousApi = process.env.API_SECRET;
  const previousInternal = process.env.INTERNAL_SECRET;
  const previousConvex = process.env.NEXT_PUBLIC_CONVEX_URL;
  const previousVercel = process.env.VERCEL_ENV;
  globalThis.requestAnimationFrame = ((callback: FrameRequestCallback) => {
    frames.push(() => callback(0));
    return frames.length;
  }) as typeof requestAnimationFrame;
  globalThis.document = {
    fonts: { ready: Promise.resolve() },
    createElement: () => {
      const anchor: { download?: string; href?: string; click: () => void } = {
        click() {
          links.push(anchor.download ?? '');
          anchorHrefs.push(anchor.href ?? '');
        },
      };
      return anchor;
    },
  } as unknown as Document;
  const delay = (ms: number) =>
    new Promise<void>((resolve) => {
      setTimeout(resolve, ms);
    });
  const frame = async () => {
    const next = frames.shift();
    assert.ok(next);
    next();
    await flush();
  };
  try {
    const defaults = (
      loader()('features/workbench/lib/workbench-options.ts') as {
        defaultMagicItemWorkbenchState: { itemName: string };
      }
    ).defaultMagicItemWorkbenchState;
    const downloadHost = createHost();
    const downloadDom = readinessNode();
    const downloadLoad = loader({
      react: downloadHost.react,
      '@/components/ui/button': { Button: 'button' },
      '@/components/ui/toggle-group': {
        ToggleGroup: 'div',
        ToggleGroupItem: 'span',
      },
      '@hugeicons/core-free-icons': { Download04Icon: {} },
      '@hugeicons/react': { HugeiconsIcon: () => null },
      './card-export-surface': { CardExportSurface: 'mock-surface' },
      'html-to-image': {
        toPng: async (node: unknown, options: unknown) => {
          captures.push({ node, options });
          return 'data:image/png;base64,AA==';
        },
        toJpeg: async () => {
          throw new Error('unexpected jpeg');
        },
      },
    });
    const { DownloadControlsCard } = downloadLoad(
      'features/workbench/components/download-controls-card.tsx',
    ) as {
      DownloadControlsCard: (props: unknown) => unknown;
    };
    const downloadProps = {
      cardRef: { current: null },
      getItemName: () => 'Wrong live name',
      captureExport: (input: { format: 'png' | 'jpg'; pixelRatio: 1 | 2 }) => ({
        state: { ...defaults, itemName: 'Captured', imagePreviewUrl: '' },
        snapshot: { itemName: 'Captured' },
        bundle: null,
        ...input,
      }),
      onExportComplete() {
        return undefined;
      },
    };
    const renderDownload = () =>
      downloadHost.render(() => DownloadControlsCard(downloadProps));
    const beforeDownload = captures.length;
    const click = findButton(renderDownload())?.props.onClick;
    assert.ok(click);
    click();
    await flush();
    const surface = downloadHost.refs[1];
    assert.ok(surface);
    surface.current = downloadDom.node;
    await frame();
    await frame();
    downloadDom.state.ready = 'ready';
    downloadDom.state.generation = '999';
    downloadDom.state.images = [{ complete: true, naturalWidth: 12 }];
    await frame();
    assert.equal(captures.length, beforeDownload);
    downloadDom.state.generation = '1';
    downloadDom.state.images = [{ complete: false, naturalWidth: 0 }];
    await frame();
    assert.equal(captures.length, beforeDownload);
    assert.equal(findButton(renderDownload())?.props.disabled, true);
    downloadDom.state.images = [{ complete: true, naturalWidth: 0 }];
    await frame();
    await flush();
    assert.equal(captures.length, beforeDownload);
    assert.match(String(downloadHost.cells[2]), /prepare artwork/);
    assert.equal(downloadHost.cells[4], false);
    downloadDom.state.images = [{ complete: true, naturalWidth: 12 }];
    downloadDom.state.generation = '2';
    const successClick = findButton(renderDownload())?.props.onClick;
    assert.ok(successClick);
    successClick();
    await flush();
    surface.current = downloadDom.node;
    await frame();
    await frame();
    await flush();
    assert.equal(captures.length, beforeDownload + 1);
    assert.equal(links.at(-1), 'item-thing-captured.png');
    assert.deepEqual((captures.at(-1) as { options: unknown }).options, {
      pixelRatio: 2,
      skipAutoScale: true,
    });

    const jpegDataUrl = 'data:image/jpeg;base64,/9j/4AAQ';
    const downloadHostJpeg = createHost();
    const downloadDomJpeg = readinessNode();
    downloadHostJpeg.cells[0] = 'jpg';
    const jpegDownloadLoad = loader({
      react: downloadHostJpeg.react,
      '@/components/ui/button': { Button: 'button' },
      '@/components/ui/toggle-group': {
        ToggleGroup: 'div',
        ToggleGroupItem: 'span',
      },
      '@hugeicons/core-free-icons': { Download04Icon: {} },
      '@hugeicons/react': { HugeiconsIcon: () => null },
      './card-export-surface': { CardExportSurface: 'mock-surface' },
      'html-to-image': {
        toPng: async () => {
          throw new Error('unexpected png');
        },
        toJpeg: async (node: unknown, options: unknown) => {
          captures.push({ node, options });
          return jpegDataUrl;
        },
      },
    });
    const { DownloadControlsCard: DownloadControlsCardJpeg } = jpegDownloadLoad(
      'features/workbench/components/download-controls-card.tsx',
    ) as {
      DownloadControlsCard: (props: unknown) => unknown;
    };
    const jpegClick = findButton(
      downloadHostJpeg.render(() => DownloadControlsCardJpeg(downloadProps)),
    )?.props.onClick;
    assert.ok(jpegClick);
    jpegClick();
    await flush();
    const jpegSurface = downloadHostJpeg.refs[1];
    assert.ok(jpegSurface);
    jpegSurface.current = downloadDomJpeg.node;
    await frame();
    await frame();
    downloadDomJpeg.state.ready = 'ready';
    downloadDomJpeg.state.generation = '1';
    downloadDomJpeg.state.images = [{ complete: true, naturalWidth: 12 }];
    await frame();
    await flush();
    assert.equal(links.at(-1), 'item-thing-captured.jpg');
    assert.equal(anchorHrefs.at(-1), jpegDataUrl);
    assert.deepEqual((captures.at(-1) as { options: unknown }).options, {
      pixelRatio: 2,
      quality: 0.92,
      skipAutoScale: true,
    });

    frames.length = 0;
    const automatedJpegHost = createHost();
    const automatedJpegDom = readinessNode();
    (globalThis as { window?: unknown }).window = {
      __MAGIC_ITEM_CARD_EXPORT__: {
        state: defaults,
        format: 'jpg',
        pixelRatio: 2,
      },
    };
    const beforeJpegAutomated = captures.length;
    const automatedJpegLoad = loader({
      react: automatedJpegHost.react,
      '@/features/card-renderer/card-renderer': {
        CardRenderer: 'production-renderer-boundary',
      },
      'html-to-image': {
        toPng: async () => {
          throw new Error('unexpected png');
        },
        toJpeg: async (node: unknown, options: unknown) => {
          captures.push({ node, options });
          return jpegDataUrl;
        },
      },
    });
    const { CardExportClient: CardExportClientJpeg } = automatedJpegLoad(
      'app/internal/card-export/card-export-client.tsx',
    ) as { CardExportClient: () => unknown };
    automatedJpegHost.render(CardExportClientJpeg);
    const automatedJpegRef = automatedJpegHost.refs[0];
    assert.ok(automatedJpegRef);
    automatedJpegRef.current = automatedJpegDom.node;
    automatedJpegHost.render(CardExportClientJpeg);
    await flush();
    await frame();
    await frame();
    await frame();
    const jpegWindow = (
      globalThis as unknown as {
        window: {
          __CARD_EXPORT_STATUS__?: string;
          __CARD_EXPORT_RESULT__?: string;
        };
      }
    ).window;
    assert.equal(jpegWindow.__CARD_EXPORT_STATUS__, undefined);
    automatedJpegDom.state.ready = 'ready';
    automatedJpegDom.state.generation = '1';
    automatedJpegDom.state.images = [{ complete: true, naturalWidth: 12 }];
    for (let stableFrames = 0; stableFrames < 5; stableFrames += 1) {
      await flush();
      if (frames.length > 0) {
        await frame();
      }
      if (jpegWindow.__CARD_EXPORT_STATUS__ === 'ok') {
        break;
      }
    }
    await flush();
    assert.equal(jpegWindow.__CARD_EXPORT_STATUS__, 'ok');
    assert.equal(jpegWindow.__CARD_EXPORT_RESULT__, jpegDataUrl);
    assert.equal(captures.length, beforeJpegAutomated + 1);
    assert.deepEqual((captures.at(-1) as { options: unknown }).options, {
      pixelRatio: 2,
      quality: 0.92,
      skipAutoScale: true,
    });
    assert.equal(automatedJpegDom.node.offsetWidth, 432);
    assert.equal(automatedJpegDom.node.offsetHeight, 600);

    const fontGate = deferred();
    (globalThis.document as { fonts: { ready: Promise<unknown> } }).fonts = {
      ready: fontGate.promise,
    };
    let fontDownloadCompleted = false;
    const fontDownloadHost = createHost();
    const fontDownloadDom = readinessNode();
    const fontDownloadLoad = loader({
      react: fontDownloadHost.react,
      '@/components/ui/button': { Button: 'button' },
      '@/components/ui/toggle-group': {
        ToggleGroup: 'div',
        ToggleGroupItem: 'span',
      },
      '@hugeicons/core-free-icons': { Download04Icon: {} },
      '@hugeicons/react': { HugeiconsIcon: () => null },
      './card-export-surface': { CardExportSurface: 'mock-surface' },
      'html-to-image': {
        toPng: async (node: unknown, options: unknown) => {
          captures.push({ node, options });
          return 'data:image/png;base64,AA==';
        },
        toJpeg: async () => {
          throw new Error('unexpected jpeg');
        },
      },
    });
    const { DownloadControlsCard: FontDownloadControlsCard } = fontDownloadLoad(
      'features/workbench/components/download-controls-card.tsx',
    ) as {
      DownloadControlsCard: (props: unknown) => unknown;
    };
    const fontDownloadProps = {
      ...downloadProps,
      onExportComplete() {
        fontDownloadCompleted = true;
      },
    };
    const renderFontDownload = () =>
      fontDownloadHost.render(() =>
        FontDownloadControlsCard(fontDownloadProps),
      );
    const beforeFontCaptures = captures.length;
    const beforeFontLinks = links.length;
    const fontDownloadClick = findButton(renderFontDownload())?.props.onClick;
    assert.ok(fontDownloadClick);
    fontDownloadClick();
    await flush();
    const fontSurface = fontDownloadHost.refs[1];
    assert.ok(fontSurface);
    fontSurface.current = fontDownloadDom.node;
    await frame();
    await frame();
    assert.equal(captures.length, beforeFontCaptures);
    assert.equal(links.length, beforeFontLinks);
    assert.equal(fontDownloadCompleted, false);
    fontDownloadDom.state.ready = 'ready';
    fontDownloadDom.state.generation = '1';
    fontDownloadDom.state.images = [{ complete: true, naturalWidth: 12 }];
    await flush();
    while (frames.length > 0) {
      await frame();
    }
    await flush();
    assert.equal(captures.length, beforeFontCaptures);
    assert.equal(links.length, beforeFontLinks);
    assert.equal(fontDownloadCompleted, false);
    fontGate.resolve();
    await flush();
    for (let wait = 0; wait < 12; wait += 1) {
      await flush();
      if (frames.length > 0) {
        await frame();
      }
      if (captures.length > beforeFontCaptures) {
        break;
      }
    }
    assert.equal(captures.length, beforeFontCaptures + 1);
    assert.equal(links.at(-1), 'item-thing-captured.png');
    assert.equal(fontDownloadCompleted, true);

    const headlessFontGate = deferred();
    (globalThis.document as { fonts: { ready: Promise<unknown> } }).fonts = {
      ready: headlessFontGate.promise,
    };
    frames.length = 0;
    const headlessFontHost = createHost();
    const headlessFontDom = readinessNode();
    (globalThis as { window?: unknown }).window = {
      __MAGIC_ITEM_CARD_EXPORT__: {
        state: defaults,
        format: 'png',
        pixelRatio: 2,
      },
    };
    const beforeHeadlessCaptures = captures.length;
    const headlessFontLoad = loader({
      react: headlessFontHost.react,
      '@/features/card-renderer/card-renderer': {
        CardRenderer: 'production-renderer-boundary',
      },
      'html-to-image': {
        toPng: async (node: unknown, options: unknown) => {
          captures.push({ node, options });
          return 'data:image/png;base64,AA==';
        },
        toJpeg: async () => {
          throw new Error('unexpected jpeg');
        },
      },
    });
    const { CardExportClient: HeadlessFontCardExportClient } = headlessFontLoad(
      'app/internal/card-export/card-export-client.tsx',
    ) as { CardExportClient: () => unknown };
    headlessFontHost.render(HeadlessFontCardExportClient);
    const headlessFontRef = headlessFontHost.refs[0];
    assert.ok(headlessFontRef);
    headlessFontRef.current = headlessFontDom.node;
    headlessFontHost.render(HeadlessFontCardExportClient);
    await flush();
    const headlessFontWindow = (
      globalThis as unknown as {
        window: {
          __CARD_EXPORT_STATUS__?: string;
          __CARD_EXPORT_RESULT__?: string;
        };
      }
    ).window;
    assert.equal(headlessFontWindow.__CARD_EXPORT_STATUS__, undefined);
    assert.equal(captures.length, beforeHeadlessCaptures);
    headlessFontDom.state.ready = 'ready';
    headlessFontDom.state.generation = '1';
    headlessFontDom.state.images = [{ complete: true, naturalWidth: 12 }];
    await flush();
    while (frames.length > 0) {
      await frame();
    }
    await flush();
    assert.equal(headlessFontWindow.__CARD_EXPORT_STATUS__, undefined);
    assert.equal(captures.length, beforeHeadlessCaptures);
    headlessFontGate.resolve();
    await flush();
    for (let wait = 0; wait < 12; wait += 1) {
      await flush();
      if (frames.length > 0) {
        await frame();
      }
      if (headlessFontWindow.__CARD_EXPORT_STATUS__ === 'ok') {
        break;
      }
    }
    await flush();
    assert.equal(headlessFontWindow.__CARD_EXPORT_STATUS__, 'ok');
    assert.equal(
      headlessFontWindow.__CARD_EXPORT_RESULT__,
      'data:image/png;base64,AA==',
    );
    assert.equal(captures.length, beforeHeadlessCaptures + 1);

    (globalThis.document as { fonts: { ready: Promise<unknown> } }).fonts = {
      ready: Promise.resolve(),
    };

    let serializedOutputError = '';
    for (const mode of ['failed-image', 'output-limit'] as const) {
      frames.length = 0;
      const host = createHost();
      const dom = readinessNode();
      if (mode === 'output-limit') {
        dom.node.offsetHeight = 20000;
      }
      (globalThis as { window?: unknown }).window = {
        __MAGIC_ITEM_CARD_EXPORT__: {
          state: defaults,
          format: 'png',
          pixelRatio: 2,
        },
      };
      const before = captures.length;
      const clientLoad = loader({
        react: host.react,
        '@/features/card-renderer/card-renderer': {
          CardRenderer: 'production-renderer-boundary',
        },
        'html-to-image': {
          toPng: async (node: unknown, options: unknown) => {
            captures.push({ node, options });
            return 'data:image/png;base64,AA==';
          },
          toJpeg: async () => {
            throw new Error('unexpected jpeg');
          },
        },
      });
      const { CardExportClient } = clientLoad(
        'app/internal/card-export/card-export-client.tsx',
      ) as { CardExportClient: () => unknown };
      host.render(CardExportClient);
      const cardRef = host.refs[0];
      assert.ok(cardRef);
      cardRef.current = dom.node;
      const tree = host.render(CardExportClient);
      const renderer = findType(tree, 'production-renderer-boundary');
      const rendererProps = renderer?.props as
        | { exportGeneration?: unknown; artworkDrawPolicy?: unknown }
        | undefined;
      assert.equal(rendererProps?.exportGeneration, 1);
      assert.equal(rendererProps?.artworkDrawPolicy, 'export');
      await flush();
      await frame();
      await frame();
      await frame();
      const view = (
        globalThis as unknown as {
          window: {
            __CARD_EXPORT_STATUS__?: string;
            __CARD_EXPORT_ERROR__?: string;
          };
        }
      ).window;
      assert.equal(view.__CARD_EXPORT_STATUS__, undefined);
      dom.state.ready = 'ready';
      dom.state.generation = '999';
      dom.state.images = [{ complete: true, naturalWidth: 12 }];
      await frame();
      await delay(250);
      assert.equal(view.__CARD_EXPORT_STATUS__, undefined);
      assert.equal(captures.length, before);
      dom.state.generation = '1';
      dom.state.images = [{ complete: false, naturalWidth: 0 }];
      await frame();
      await delay(250);
      assert.equal(view.__CARD_EXPORT_STATUS__, undefined);
      assert.equal(captures.length, before);
      dom.state.images = [
        { complete: true, naturalWidth: mode === 'failed-image' ? 0 : 12 },
      ];
      await flush();
      for (let stableFrames = 0; stableFrames < 5; stableFrames += 1) {
        await flush();
        if (frames.length > 0) {
          await frame();
        }
        if (view.__CARD_EXPORT_STATUS__ === 'error') {
          break;
        }
      }
      await flush();
      assert.equal(view.__CARD_EXPORT_STATUS__, 'error');
      assert.equal(captures.length, before);
      if (mode === 'output-limit') {
        serializedOutputError = String(view.__CARD_EXPORT_ERROR__);
        assert.equal(JSON.parse(serializedOutputError).code, 'card_output');
      } else {
        assert.match(String(view.__CARD_EXPORT_ERROR__), /prepare artwork/);
      }
    }
    assert.equal(JSON.parse(serializedOutputError).kind, 'artwork-limit');

    let closeCount = 0;
    let launchCount = 0;
    const page = {
      async setExtraHTTPHeaders() {
        return undefined;
      },
      async evaluateOnNewDocument() {
        return undefined;
      },
      async goto() {
        return undefined;
      },
      async waitForFunction() {
        return undefined;
      },
      async evaluate(callback: () => unknown) {
        return callback();
      },
    };
    process.env.PUPPETEER_EXECUTABLE_PATH = '/mock/review-only';
    process.env.VERCEL_ENV = 'preview';
    process.env.API_SECRET = 'test-secret';
    process.env.INTERNAL_SECRET = 'test-internal';
    process.env.NEXT_PUBLIC_CONVEX_URL = 'https://review.invalid';
    const routeLoad = loader({
      'next/server': {
        NextResponse: (require('next/server') as typeof import('next/server'))
          .NextResponse,
        after() {
          return undefined;
        },
      },
      '@/lib/server-logger': {
        serverLogger: {
          info() {},
          debug() {},
          error() {},
          child() {
            return this;
          },
        },
      },
      './persist-card-export-to-convex': {
        persistCardExportToConvex: async () => {
          throw new Error('unexpected archive');
        },
      },
      '@sparticuz/chromium-min': { __esModule: true, default: {} },
      'puppeteer-core': {
        __esModule: true,
        default: {
          async launch() {
            launchCount += 1;
            return {
              async newPage() {
                return page;
              },
              async close() {
                closeCount += 1;
              },
            };
          },
        },
      },
    });
    const { handleRenderCardRoute } = routeLoad(
      'features/server-render-card/render-card-route-handler.ts',
    ) as {
      handleRenderCardRoute: (
        request: Request,
        style: 'print' | 'minimal',
      ) => Promise<{
        status: number;
        json: () => Promise<{ error?: string; message?: string }>;
      }>;
    };
    const bytes = await sharp({
      create: { width: 32, height: 16, channels: 3, background: 'red' },
    })
      .png()
      .toBuffer();
    const requestFor = (buffer: Buffer) => {
      const form = new FormData();
      form.set(
        'artwork',
        new File([new Uint8Array(buffer)], 'art.png', { type: 'image/png' }),
      );
      form.set(
        'item',
        JSON.stringify({
          itemName: 'Review',
          classificationAndRarity: 'Weapon, rare',
          requiresAttunement: false,
          flavorDescription: '',
          mechanicalDescription: 'Test.',
        }),
      );
      form.set('format', 'png');
      form.set('pixelRatio', '2');
      return new Request('http://127.0.0.1:3000/api/render-card', {
        method: 'POST',
        headers: { 'x-api-secret': 'test-secret' },
        body: form,
      });
    };
    const outputResponse = await handleRenderCardRoute(
      requestFor(bytes),
      'print',
    );
    const outputBody = await outputResponse.json();
    assert.equal(outputResponse.status, 422);
    assert.equal(outputBody.error, 'card_output_too_large');
    assert.equal(outputBody.message, JSON.parse(serializedOutputError).message);
    assert.equal(launchCount, 1);
    assert.equal(closeCount, 1);
    const view = (
      globalThis as unknown as {
        window: { __CARD_EXPORT_ERROR__?: string };
      }
    ).window;
    view.__CARD_EXPORT_ERROR__ = 'chromium died';
    const failure = await handleRenderCardRoute(requestFor(bytes), 'minimal');
    const failureBody = await failure.json();
    assert.equal(failure.status, 500);
    assert.equal(failureBody.error, 'render_failed');
    assert.equal(closeCount, 2);
    const oversize = await sharp({
      create: { width: 4097, height: 1, channels: 3, background: 'red' },
    })
      .png()
      .toBuffer();
    const sourceLimit = await handleRenderCardRoute(
      requestFor(oversize),
      'print',
    );
    const sourceBody = await sourceLimit.json();
    assert.equal(sourceLimit.status, 422);
    assert.equal(sourceBody.error, 'artwork_too_large');
    assert.match(sourceBody.message ?? '', /4096px/);
    assert.equal(launchCount, 2);
  } finally {
    globalThis.requestAnimationFrame = previousFrame;
    globalThis.document = previousDocument;
    (globalThis as { window?: unknown }).window = previousWindow;
    const env = process.env as Record<string, string | undefined>;
    const restoreEnv = (name: string, previous: string | undefined) => {
      if (previous === undefined) {
        delete env[name];
        return;
      }
      env[name] = previous;
    };
    restoreEnv('PUPPETEER_EXECUTABLE_PATH', previousExecutable);
    restoreEnv('VERCEL_ENV', previousVercel);
    restoreEnv('API_SECRET', previousApi);
    restoreEnv('INTERNAL_SECRET', previousInternal);
    restoreEnv('NEXT_PUBLIC_CONVEX_URL', previousConvex);
  }
});
