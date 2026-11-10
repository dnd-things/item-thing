import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { STALE_SOURCE } from '../../../convex/lib/sourceReuse.ts';

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
  let resolve: () => void = () => {
    throw new Error('deferred resolve was not installed');
  };
  const promise = new Promise<void>((next) => {
    resolve = () => next();
  });
  return { promise, resolve };
}

async function flush() {
  for (let i = 0; i < 40; i += 1) {
    await Promise.resolve();
  }
}

type Insert = {
  workbenchSnapshot: { itemName?: string };
  sourceImageStorageId?: string;
  exportFormat: 'png' | 'jpg';
  exportPixelRatio: 1 | 2;
};

test('late export completion keeps the captured reuse epoch', async () => {
  const React = require('react') as typeof import('react');
  const sharp = require('sharp') as typeof import('sharp');
  const base = loader();
  const defaults = (
    base('features/workbench/lib/workbench-options.ts') as {
      defaultMagicItemWorkbenchState: Record<string, unknown>;
    }
  ).defaultMagicItemWorkbenchState;
  const sourceLib = base('features/workbench/lib/artwork-source.ts') as {
    createArtworkBundle: (input: {
      preview: Blob;
      source: Blob;
      sourceWidth: number;
      sourceHeight: number;
      crop: { left: number; top: number; width: number; height: number };
    }) => {
      source: Blob;
      sourceWidth: number;
      sourceHeight: number;
      crop: { left: number; top: number; width: number; height: number };
    };
    materializeCanonicalArtwork: (
      bundle: unknown,
      deps: {
        decodeDimensions: () => Promise<{ width: number; height: number }>;
        readDataUrl: (blob: Blob) => Promise<string>;
        rasterizeCrop: () => Promise<Blob>;
      },
    ) => Promise<{ dataUrl: string }>;
  };
  const exportLib = base('features/workbench/lib/export-card-artwork.ts') as {
    prepareCapturedExport: unknown;
    materializeBrowserCanonical: unknown;
  };
  const readLib = base(
    'features/workbench/lib/read-image-preview-data.ts',
  ) as Record<string, unknown>;
  const jpeg = await sharp({
    create: { width: 48, height: 24, channels: 3, background: 'red' },
  })
    .jpeg()
    .toBuffer();
  const previewABytes = await sharp(jpeg).resize(24, 12).png().toBuffer();
  const previewBBytes = await sharp({
    create: { width: 16, height: 16, channels: 3, background: 'blue' },
  })
    .png()
    .toBuffer();
  const sourceBBytes = await sharp({
    create: { width: 32, height: 32, channels: 3, background: 'blue' },
  })
    .png()
    .toBuffer();
  const copy = (buffer: Buffer) => Uint8Array.from(buffer);
  const dataUrl = async (bytes: Buffer, type: string) =>
    `data:${type};base64,${bytes.toString('base64')}`;
  const sourceUrl = await dataUrl(jpeg, 'image/jpeg');
  const previewA = await dataUrl(previewABytes, 'image/png');
  const previewB = await dataUrl(previewBBytes, 'image/png');
  const sourceBUrl = await dataUrl(sourceBBytes, 'image/png');
  const fileA = new File([copy(jpeg)], 'a.jpg', { type: 'image/jpeg' });
  const fileB = new File([copy(sourceBBytes)], 'b.png', { type: 'image/png' });
  const fileA2 = new File([copy(jpeg)], 'a2.jpg', { type: 'image/jpeg' });
  const bundleA = sourceLib.createArtworkBundle({
    preview: new Blob([copy(previewABytes)], { type: 'image/png' }),
    source: new Blob([copy(jpeg)], { type: 'image/jpeg' }),
    sourceWidth: 48,
    sourceHeight: 24,
    crop: { left: 0, top: 0, width: 48, height: 24 },
  });
  const bundleB = sourceLib.createArtworkBundle({
    preview: new Blob([copy(previewBBytes)], { type: 'image/png' }),
    source: new Blob([copy(sourceBBytes)], { type: 'image/png' }),
    sourceWidth: 32,
    sourceHeight: 32,
    crop: { left: 0, top: 0, width: 32, height: 32 },
  });
  assert.notEqual(sourceUrl, previewA);
  assert.notEqual(sourceUrl, sourceBUrl);

  const previousFrame = globalThis.requestAnimationFrame;
  const previousDocument = globalThis.document;
  try {
    const opened = await openWorkbench({
      React,
      defaults,
      sourceLib,
      exportLib,
      readLib,
      fileA,
      fileB,
      fileA2,
      bundleA,
      bundleB,
      previewA,
      previewB,
      sourceUrl,
      sourceBUrl,
    });
    assert.equal(opened.slot().current, null);
    assert.equal(opened.present(), true);

    opened.holdCapture = true;
    opened.click();
    await opened.untilCapture(1);
    opened.values.imageFile = undefined;
    opened.render();
    assert.equal(opened.previewUrl(), '');
    assert.equal(opened.slot().current, null);
    opened.releaseCapture();
    await opened.untilInserts(1);
    assert.equal(opened.inserts.length, 1);
    assert.equal(opened.inserts[0]?.workbenchSnapshot.itemName, 'A');
    assert.deepEqual(opened.uploads, [sourceUrl]);
    assert.equal(opened.slot().current, null);
    opened.dispose();

    const unmounted = await openWorkbench({
      React,
      defaults,
      sourceLib,
      exportLib,
      readLib,
      fileA,
      fileB,
      fileA2,
      bundleA,
      bundleB,
      previewA,
      previewB,
      sourceUrl,
      sourceBUrl,
    });
    unmounted.holdCapture = true;
    unmounted.click();
    await unmounted.untilCapture(1);
    unmounted.dispose();
    assert.equal(unmounted.slot().current, null);
    unmounted.releaseCapture();
    await unmounted.untilInserts(1);
    assert.equal(unmounted.inserts[0]?.workbenchSnapshot.itemName, 'A');
    assert.deepEqual(unmounted.uploads, [sourceUrl]);
    assert.equal(unmounted.slot().current, null);

    const replaced = await openWorkbench({
      React,
      defaults,
      sourceLib,
      exportLib,
      readLib,
      fileA,
      fileB,
      fileA2,
      bundleA,
      bundleB,
      previewA,
      previewB,
      sourceUrl,
      sourceBUrl,
    });
    replaced.holdCapture = true;
    replaced.failStaleSource = true;
    replaced.click();
    await replaced.untilCapture(1);
    replaced.values.imageFile = fileB;
    await replaced.settleReplacement(previewB);
    assert.equal(replaced.slot().current, null);
    replaced.releaseCapture();
    await replaced.untilRetryHeld();
    assert.equal(replaced.slot().current, null);
    replaced.holdCapture = false;
    replaced.render();
    replaced.click();
    await replaced.untilCapture(2);
    await replaced.untilSlot(sourceBUrl);
    const retainedB = replaced.slot().current?.promise;
    replaced.releaseRetry();
    await replaced.untilSuccessful('A');
    assert.equal(replaced.slot().current?.dataUrl, sourceBUrl);
    assert.equal(replaced.slot().current?.promise, retainedB);
    assert.equal((await retainedB)?.storageId.startsWith('opt-b-'), true);
    assert.equal(
      replaced.inserts.filter(
        (record) => record.workbenchSnapshot.itemName === 'A',
      ).length,
      1,
    );
    assert.equal(
      replaced.uploads.filter((url) => url === sourceUrl).length >= 1,
      true,
    );
    assert.equal(replaced.uploads.includes(sourceBUrl), true);
    replaced.dispose();

    const generation = await openWorkbench({
      React,
      defaults,
      sourceLib,
      exportLib,
      readLib,
      fileA,
      fileB,
      fileA2,
      bundleA,
      bundleB,
      previewA,
      previewB,
      sourceUrl,
      sourceBUrl,
    });
    generation.holdCapture = true;
    generation.failStaleSource = true;
    generation.click();
    await generation.untilCapture(1);
    generation.values.imageFile = fileB;
    await generation.settleReplacement(previewB);
    generation.values.imageFile = fileA2;
    await generation.settleReplacement(previewA);
    assert.equal(generation.previewUrl(), previewA);
    generation.releaseCapture();
    await generation.untilRetryHeld();
    assert.equal(generation.slot().current, null);
    generation.releaseRetry();
    await generation.untilSuccessful('A');
    assert.equal(generation.slot().current, null);
    assert.equal(
      generation.inserts.filter(
        (record) => record.workbenchSnapshot.itemName === 'A',
      ).length,
      1,
    );
    assert.deepEqual(
      generation.uploads.filter((url) => url === sourceUrl).length > 0,
      true,
    );
    const uploadsBeforeNext = generation.uploads.length;
    generation.markLaterGeneration();
    generation.holdCapture = false;
    generation.failStaleSource = false;
    generation.render();
    generation.click();
    await generation.untilCapture(2);
    await generation.untilSlot(sourceUrl);
    assert.equal(generation.uploads.length, uploadsBeforeNext + 1);
    assert.equal(generation.slot().current?.dataUrl, sourceUrl);
    const installed = await generation.slot().current?.promise;
    assert.equal(installed?.storageId.startsWith('opt-a2-'), true);
    generation.dispose();

    const reused = await openWorkbench({
      React,
      defaults,
      sourceLib,
      exportLib,
      readLib,
      fileA,
      fileB,
      fileA2,
      bundleA,
      bundleB,
      previewA,
      previewB,
      sourceUrl,
      sourceBUrl,
    });
    reused.holdCapture = false;
    reused.click();
    await reused.untilCapture(1);
    await reused.untilInserts(1);
    reused.render();
    reused.click();
    await reused.untilCapture(2);
    await reused.untilInserts(2);
    assert.deepEqual(reused.uploads, [sourceUrl]);
    assert.equal(reused.slot().current?.dataUrl, sourceUrl);
    assert.deepEqual(
      reused.inserts.map((record) => record.workbenchSnapshot.itemName),
      ['A', 'A'],
    );
    reused.dispose();
  } finally {
    globalThis.requestAnimationFrame = previousFrame;
    globalThis.document = previousDocument;
  }
});

async function openWorkbench(input: {
  React: typeof import('react');
  defaults: Record<string, unknown>;
  sourceLib: {
    createArtworkBundle: (input: {
      preview: Blob;
      source: Blob;
      sourceWidth: number;
      sourceHeight: number;
      crop: { left: number; top: number; width: number; height: number };
    }) => unknown;
    materializeCanonicalArtwork: (
      bundle: unknown,
      deps: {
        decodeDimensions: () => Promise<{ width: number; height: number }>;
        readDataUrl: (blob: Blob) => Promise<string>;
        rasterizeCrop: () => Promise<Blob>;
      },
    ) => Promise<{ dataUrl: string }>;
  };
  exportLib: { prepareCapturedExport: unknown };
  readLib: Record<string, unknown>;
  fileA: File;
  fileB: File;
  fileA2: File;
  bundleA: {
    source: Blob;
    sourceWidth: number;
    sourceHeight: number;
    crop: { width: number; height: number };
  };
  bundleB: {
    source: Blob;
    sourceWidth: number;
    sourceHeight: number;
    crop: { width: number; height: number };
  };
  previewA: string;
  previewB: string;
  sourceUrl: string;
  sourceBUrl: string;
}) {
  const values: {
    itemName: string;
    imageFile: File | undefined;
    classificationAndRarity: string;
    requiresAttunement: boolean;
    flavorDescription: string;
    mechanicalDescription: string;
  } = {
    itemName: 'A',
    imageFile: undefined,
    classificationAndRarity: '',
    requiresAttunement: false,
    flavorDescription: '',
    mechanicalDescription: '',
  };
  let currentBundle: unknown = input.bundleA;
  let sawImage = false;
  const uploads: string[] = [];
  const inserts: Insert[] = [];
  const frames: Array<(time: number) => void> = [];
  const captureHolds: Array<ReturnType<typeof deferred>> = [];
  let captures = 0;
  let holdCapture = false;
  let failStaleSource = false;
  let failedStale = false;
  let aUploads = 0;
  let bUploads = 0;
  let a2Uploads = 0;
  let laterGeneration = false;
  const retryHold = deferred();
  let retryHeld = false;
  let listener: () => void = () => undefined;
  const session = {
    start() {
      listener();
    },
    dispose() {
      return undefined;
    },
    subscribe(next: () => void) {
      listener = next;
      return () => undefined;
    },
    getNotice() {
      return null;
    },
    takeHydration() {
      const pending = session.hydration;
      session.hydration = null;
      return pending;
    },
    hydration: {
      state: {
        ...input.defaults,
        itemName: 'A',
        imageFileName: 'a.jpg',
        imagePreviewUrl: input.previewA,
      },
      imageFile: input.fileA,
    } as { state: Record<string, unknown>; imageFile: File } | null,
    shouldSkipImageProcessing() {
      return false;
    },
    beginImageWatch(file: File | undefined) {
      if (file === undefined) {
        currentBundle = null;
        return { id: 1, kind: 'clear' as const };
      }
      if (!sawImage) {
        sawImage = true;
        return { id: 1, kind: 'skip' as const };
      }
      return { id: 2, kind: 'prepare' as const };
    },
    cancelImageWatch() {
      return undefined;
    },
    acceptPreview(
      _id: number,
      preview: { bundle?: unknown; previewUrl: string },
    ) {
      currentBundle = preview.bundle ?? null;
      return true;
    },
    failPreview() {
      return undefined;
    },
    captureArtwork() {
      return currentBundle;
    },
    commitClear() {
      currentBundle = null;
    },
    scheduleSnapshot() {
      return undefined;
    },
    cancelDebounce() {
      return undefined;
    },
    notifyStoreDisconnected() {
      return undefined;
    },
  };
  const cells: unknown[] = [];
  const effects: Array<() => void> = [];
  const refs: Array<{ current: unknown }> = [];
  let cursor = 0;
  let dirty = false;
  const react = {
    ...input.React,
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
    useEffect(fn: () => (() => void) | undefined, deps: unknown[]) {
      const index = cursor;
      cursor += 1;
      const previous = cells[index] as
        | { deps?: unknown[]; cleanup?: () => void }
        | undefined;
      const changed =
        !previous ||
        deps.some(
          (value, indexInDeps) =>
            !Object.is(value, previous.deps?.[indexInDeps]),
        );
      if (changed) {
        const cell: { deps: unknown[]; cleanup?: () => void } = { deps };
        cells[index] = cell;
        effects.push(() => {
          previous?.cleanup?.();
          const cleanup = fn();
          if (typeof cleanup === 'function') {
            cell.cleanup = cleanup;
          }
        });
      }
    },
  };
  const preparedFor = (file: File) => {
    if (file === input.fileB) {
      return {
        previewBlob: input.bundleB.source,
        sourceBlob: input.bundleB.source,
        sourceWidth: input.bundleB.sourceWidth,
        sourceHeight: input.bundleB.sourceHeight,
        crop: { left: 0, top: 0, width: 32, height: 32 },
        aspectRatio: 1,
      };
    }
    return {
      previewBlob: new Blob([input.previewA], { type: 'text/plain' }),
      sourceBlob: input.bundleA.source,
      sourceWidth: input.bundleA.sourceWidth,
      sourceHeight: input.bundleA.sourceHeight,
      crop: { left: 0, top: 0, width: 48, height: 24 },
      aspectRatio: 2,
    };
  };
  const load = loader({
    react,
    'react-hook-form': {
      useForm: () => ({
        control: {},
        formState: { errors: {} },
        reset(next: Partial<typeof values>) {
          Object.assign(values, next);
        },
        watch(callback?: (next: typeof values) => void) {
          if (typeof callback === 'function') {
            return { unsubscribe() {} };
          }
          return values;
        },
        getValues(name?: keyof typeof values) {
          return name ? values[name] : values;
        },
        trigger: async () => true,
      }),
    },
    '@/convex/_generated/api': {
      api: {
        itemExports: {
          generateUploadUrl: 'upload',
          createItemExport: 'insert',
          getSourceReuseStatus: 'status',
        },
        optimizeSourceImage: { optimizeSourceImage: 'optimize' },
      },
    },
    'convex/react': {
      useConvex: () => ({
        query: async () => ({ optimizerVersion: 'v1', reusable: true }),
      }),
      useMutation: (name: string) =>
        name === 'upload'
          ? async () => 'upload-url'
          : async (record: Insert) => {
              if (
                failStaleSource &&
                !failedStale &&
                record.workbenchSnapshot.itemName === 'A' &&
                record.sourceImageStorageId
              ) {
                failedStale = true;
                const { ConvexError: LoadedConvexError } =
                  require('convex/values') as {
                    ConvexError: new (data: { code: string }) => Error;
                  };
                throw new LoadedConvexError({ code: STALE_SOURCE });
              }
              inserts.push(record);
            },
      useAction: () => async (action: { sourceStorageId: string }) => {
        if (action.sourceStorageId.startsWith('raw-b-')) {
          return `opt-b-${action.sourceStorageId.slice('raw-b-'.length)}`;
        }
        if (action.sourceStorageId.startsWith('raw-a2-')) {
          return `opt-a2-${action.sourceStorageId.slice('raw-a2-'.length)}`;
        }
        return `opt-a-${action.sourceStorageId.slice('raw-a-'.length)}`;
      },
    },
    './upload-blob-to-convex-storage': {
      dataUrlToBlob: async (url: string) => {
        uploads.push(url);
        return new Blob([url], { type: 'text/plain' });
      },
      uploadBlobToConvexStorage: async () => {
        const url = uploads.at(-1) ?? '';
        if (url === input.sourceBUrl) {
          bUploads += 1;
          return `raw-b-${bUploads}`;
        }
        if (laterGeneration) {
          a2Uploads += 1;
          return `raw-a2-${a2Uploads}`;
        }
        aUploads += 1;
        if (aUploads > 1) {
          retryHeld = true;
          await retryHold.promise;
        }
        return `raw-a-${aUploads}`;
      },
    },
    './lib/workbench-persistence-session': {
      createBrowserWorkbenchPersistenceSession: () => session,
      workbenchPersistenceCopy: { loading: 'loading' },
    },
    './lib/workbench-persistence': {
      readBlobAsDataUrl: async (blob: Blob) =>
        blob === input.bundleB.source ? input.previewB : input.previewA,
    },
    './lib/read-image-preview-data': {
      ...input.readLib,
      readPreparedArtwork: async (file: File) => preparedFor(file),
    },
    './components/item-details-form': { ItemDetailsForm: () => null },
    './components/preview-column': { PreviewColumn: () => null },
    '@/components/ui/button': { Button: 'button' },
    '@/components/ui/toggle-group': {
      ToggleGroup: 'toggles',
      ToggleGroupItem: 'toggle',
    },
    '@hugeicons/core-free-icons': { Download04Icon: {} },
    '@hugeicons/react': { HugeiconsIcon: () => null },
    './card-export-surface': { CardExportSurface: () => null },
    '../lib/export-card-artwork': {
      ...input.exportLib,
      materializeBrowserCanonical: (bundle: {
        sourceWidth: number;
        sourceHeight: number;
      }) =>
        input.sourceLib.materializeCanonicalArtwork(bundle, {
          decodeDimensions: async () => ({
            width: bundle.sourceWidth,
            height: bundle.sourceHeight,
          }),
          readDataUrl: async (blob: Blob) => {
            const bytes = Buffer.from(await blob.arrayBuffer());
            const type = blob.type || 'image/png';
            return `data:${type};base64,${bytes.toString('base64')}`;
          },
          rasterizeCrop: async () => {
            throw new Error('unexpected crop');
          },
        }),
    },
    'html-to-image': {
      toPng: async () => {
        captures += 1;
        if (holdCapture) {
          const hold = deferred();
          captureHolds.push(hold);
          await hold.promise;
        }
        return 'data:image/png;base64,AA==';
      },
      toJpeg: async () => {
        throw new Error('unexpected jpeg');
      },
    },
  });
  const { ItemCardWorkbench } = load(
    'features/workbench/item-card-workbench.tsx',
  ) as {
    ItemCardWorkbench: (props: { showAdvancedWorkbenchControls: boolean }) => {
      type?: unknown;
      props?: { children?: unknown };
    };
  };
  let downloadTree: unknown = null;
  const invoke = (node: unknown) => {
    if (!node || typeof node !== 'object') {
      return;
    }
    const element = node as {
      type?: unknown;
      props?: { children?: unknown };
    };
    if (typeof element.type === 'function') {
      const inner = (element.type as (props: unknown) => unknown)(
        element.props,
      );
      if (
        element.props &&
        typeof element.props === 'object' &&
        'captureExport' in element.props
      ) {
        downloadTree = inner;
      }
      invoke(inner);
      return;
    }
    const children = element.props?.children as import('react').ReactNode;
    for (const child of input.React.Children.toArray(children)) {
      invoke(child);
    }
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
    const children = element.props?.children as import('react').ReactNode;
    for (const child of input.React.Children.toArray(children)) {
      const found = findButton(child);
      if (found) {
        return found;
      }
    }
    return null;
  };
  const render = () => {
    let result: unknown;
    for (let count = 0; count < 20; count += 1) {
      dirty = false;
      cursor = 0;
      downloadTree = null;
      result = ItemCardWorkbench({ showAdvancedWorkbenchControls: false });
      invoke(result);
      const pending = effects.splice(0, effects.length);
      for (const effect of pending) {
        effect();
      }
      if (!dirty) {
        return result;
      }
    }
    throw new Error('workbench render did not settle');
  };
  globalThis.requestAnimationFrame = ((callback: FrameRequestCallback) => {
    frames.push(callback);
    return frames.length;
  }) as typeof requestAnimationFrame;
  globalThis.document = {
    fonts: { ready: Promise.resolve() },
    createElement: () => ({ click() {} }),
  } as unknown as Document;
  render();
  const slot = () => {
    const ref = refs[0] as {
      current: {
        dataUrl?: string;
        promise?: Promise<{ storageId: string }>;
      } | null;
    };
    assert.ok(ref);
    return ref;
  };
  const surface = () => {
    const lockIndex = refs.findIndex(
      (ref) =>
        !!ref.current &&
        typeof ref.current === 'object' &&
        'run' in (ref.current as object),
    );
    assert.ok(
      lockIndex >= 0,
      `missing export lock: ${refs.map((ref) => typeof ref.current).join(',')}`,
    );
    const nodeRef = refs[lockIndex + 1];
    const generationRef = refs[lockIndex + 2] as { current: number };
    assert.ok(nodeRef);
    assert.equal(typeof generationRef?.current, 'number');
    nodeRef.current = {
      offsetWidth: 432,
      offsetHeight: 600,
      getAttribute: () => null,
      querySelector: () => ({
        getAttribute: (name: string) =>
          name === 'data-artwork-state'
            ? 'ready'
            : name === 'data-export-generation'
              ? String(generationRef.current)
              : null,
      }),
      querySelectorAll: () => [{ complete: true, naturalWidth: 48 }],
    };
  };
  const pump = async (until: () => boolean) => {
    for (let i = 0; i < 40 && !until(); i += 1) {
      const frame = frames.shift();
      if (frame) {
        frame(0);
      }
      await flush();
    }
    assert.equal(until(), true);
  };
  const api = {
    values,
    uploads,
    inserts,
    get holdCapture() {
      return holdCapture;
    },
    set holdCapture(value: boolean) {
      holdCapture = value;
    },
    set failStaleSource(value: boolean) {
      failStaleSource = value;
    },
    slot,
    present() {
      const presentRef = refs[1] as { current: boolean };
      return presentRef?.current;
    },
    previewUrl() {
      const state = cells[0] as { imagePreviewUrl?: string } | undefined;
      return state?.imagePreviewUrl ?? '';
    },
    render,
    click() {
      const button = findButton(downloadTree);
      assert.ok(button?.props.onClick, 'export button missing');
      button.props.onClick();
    },
    async untilCapture(count: number) {
      surface();
      await pump(() => captures >= count);
    },
    async untilInserts(count: number) {
      await pump(() => inserts.length >= count);
    },
    async untilRetryHeld() {
      await pump(() => retryHeld);
    },
    releaseCapture() {
      const hold = captureHolds.shift();
      assert.ok(hold);
      hold.resolve();
    },
    releaseRetry() {
      retryHold.resolve();
    },
    async untilSlot(url: string) {
      await pump(() => slot().current?.dataUrl === url);
    },
    async untilSuccessful(itemName: string) {
      await pump(() =>
        inserts.some(
          (record) => record.workbenchSnapshot.itemName === itemName,
        ),
      );
    },
    markLaterGeneration() {
      laterGeneration = true;
    },
    async settleReplacement(nextPreview: string) {
      render();
      await pump(
        () =>
          (cells[0] as { imagePreviewUrl?: string } | undefined)
            ?.imagePreviewUrl === nextPreview,
      );
      render();
    },
    dispose() {
      for (const cell of cells) {
        const cleanup = (cell as { cleanup?: () => void } | undefined)?.cleanup;
        cleanup?.();
      }
    },
  };
  assert.equal(api.present(), true);
  assert.ok(findButton(downloadTree));
  return api;
}
