import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import sharp from 'sharp';
import { imageRightArtworkMarginTopRem } from '@/features/card-renderer/lib/image-right-artwork-placement.ts';
import {
  ArtworkLimitError,
  artworkLimitErrorFromSerialized,
  artworkLimitHttpResponse,
  serializeArtworkLimitError,
} from '@/lib/artwork-limit-error.ts';
import {
  artworkLimitCopy,
  assertCardOutputBudget,
  assertDecodedArtworkDimensions,
  assertEncodedArtworkBytes,
  CARD_OUTPUT_MAX_EDGE_PX,
  DISPLAY_MAX_EDGE_PX,
  DISPLAY_MAX_PIXELS,
  dataUrlEncodedByteLength,
  findVisibleAlphaBounds,
  getInspectionDimensions,
  INSPECTION_MAX_EDGE_PX,
  identityCrop,
  mapInspectionCropToSource,
  planArtworkDraw,
  rotatedBoundingBox,
  SOURCE_MAX_BYTES,
  SOURCE_MAX_EDGE_PX,
} from './artwork-geometry.ts';
import type { DrawCanvas, DrawContext } from './artwork-raster.ts';
import {
  paintTransformedDrawable,
  renderTransformedCanvas,
} from './artwork-raster.ts';
import {
  createArtworkBundle,
  createArtworkReadGate,
  dropCanonicalArtwork,
  materializeCanonicalArtwork,
  readArtworkBundle,
} from './artwork-source.ts';
import {
  completeCapturedExport,
  createCardExportLock,
  prepareCapturedExport,
  waitForArtworkState,
  waitForStableElementBox,
} from './export-card-artwork.ts';
import { readPreparedArtwork } from './read-image-preview-data.ts';
import { defaultMagicItemWorkbenchState } from './workbench-options.ts';
import { toWorkbenchSnapshotForExport } from './workbench-snapshot-for-export.ts';

function rgba(
  width: number,
  height: number,
  fill: (x: number, y: number) => number,
) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      data[offset] = 12;
      data[offset + 1] = 34;
      data[offset + 2] = 56;
      data[offset + 3] = fill(x, y);
    }
  }
  return data;
}

class FakeContext implements DrawContext {
  readonly calls: string[] = [];
  readonly pixels: Uint8ClampedArray | 'throw';

  constructor(pixels: Uint8ClampedArray | 'throw') {
    this.pixels = pixels;
  }

  drawImage(): void {
    this.calls.push('draw');
  }

  translate(): void {
    this.calls.push('translate');
  }

  rotate(): void {
    this.calls.push('rotate');
  }

  scale(): void {
    this.calls.push('scale');
  }

  save(): void {
    this.calls.push('save');
  }

  restore(): void {
    this.calls.push('restore');
  }

  getImageData(): { data: Uint8ClampedArray } {
    if (this.pixels === 'throw') {
      throw new Error('readback failed');
    }
    return { data: this.pixels };
  }
}

function recordingFactory(pixels: Uint8ClampedArray | 'throw' | 'fallback') {
  const created: Array<{ width: number; height: number }> = [];
  const contexts: FakeContext[] = [];
  return {
    created,
    contexts,
    factory: {
      create(width: number, height: number): DrawCanvas {
        created.push({ width, height });
        const context = new FakeContext(
          pixels === 'fallback' ? new Uint8ClampedArray() : pixels,
        );
        contexts.push(context);
        const canvas: DrawCanvas = {
          width,
          height,
          getContext() {
            return context;
          },
          toBlob(callback) {
            callback(
              new Blob([Uint8Array.from([1, 2, 3])], { type: 'image/png' }),
            );
          },
        };
        return canvas;
      },
      release(canvas: DrawCanvas) {
        canvas.width = 0;
        canvas.height = 0;
      },
    },
    readPixels(): Uint8ClampedArray | 'fallback' {
      if (pixels === 'fallback') {
        return 'fallback';
      }
      if (pixels === 'throw') {
        throw new Error('readback failed');
      }
      return pixels;
    },
  };
}

function fakeDecoded(width: number, height: number): HTMLImageElement {
  return {
    naturalWidth: width,
    naturalHeight: height,
    width,
    height,
    src: '',
  } as HTMLImageElement;
}

describe('artwork geometry', () => {
  test('inspection and display budgets stay inside their ceilings', () => {
    const inspection = getInspectionDimensions(5000, 1200);
    assert.ok(
      Math.max(inspection.width, inspection.height) <= INSPECTION_MAX_EDGE_PX,
    );
    assert.ok(inspection.width * inspection.height <= 4_194_304);
    const odd = getInspectionDimensions(7, 5);
    assert.deepEqual(odd, { width: 7, height: 5 });
    const display = planArtworkDraw({
      logicalWidth: 1024,
      logicalHeight: 1024,
      rotationDegrees: 45,
      flipHorizontal: true,
      flipVertical: true,
      policy: 'display',
    });
    assert.ok(display.destinationWidth <= DISPLAY_MAX_EDGE_PX);
    assert.ok(display.destinationHeight <= DISPLAY_MAX_EDGE_PX);
    assert.ok(
      display.destinationWidth * display.destinationHeight <=
        DISPLAY_MAX_PIXELS,
    );
    assert.ok(display.destinationWidth < 1449);
    const native = planArtworkDraw({
      logicalWidth: 1024,
      logicalHeight: 1024,
      rotationDegrees: 45,
      flipHorizontal: false,
      flipVertical: false,
      policy: 'export',
    });
    assert.equal(
      native.destinationWidth,
      rotatedBoundingBox(1024, 1024, 45).width,
    );
    assert.ok(native.destinationWidth > DISPLAY_MAX_EDGE_PX);
    const rotatedSource = planArtworkDraw({
      logicalWidth: 4096,
      logicalHeight: 4096,
      rotationDegrees: 45,
      flipHorizontal: false,
      flipVertical: false,
      policy: 'export',
    });
    assert.equal(rotatedSource.destinationWidth, 5793);
    assert.equal(rotatedSource.fitScale, 1);
  });

  test('rotation bounds keep the existing ceil convention', () => {
    assert.deepEqual(rotatedBoundingBox(10, 4, 0), { width: 10, height: 4 });
    assert.deepEqual(rotatedBoundingBox(10, 4, 360), { width: 10, height: 4 });
    const rightAngle = Math.PI / 2;
    assert.deepEqual(rotatedBoundingBox(10, 4, 90), {
      width: Math.ceil(
        10 * Math.abs(Math.cos(rightAngle)) +
          4 * Math.abs(Math.sin(rightAngle)),
      ),
      height: Math.ceil(
        10 * Math.abs(Math.sin(rightAngle)) +
          4 * Math.abs(Math.cos(rightAngle)),
      ),
    });
    const halfTurn = Math.PI;
    assert.deepEqual(rotatedBoundingBox(10, 4, 180), {
      width: Math.ceil(
        10 * Math.abs(Math.cos(halfTurn)) + 4 * Math.abs(Math.sin(halfTurn)),
      ),
      height: Math.ceil(
        10 * Math.abs(Math.sin(halfTurn)) + 4 * Math.abs(Math.cos(halfTurn)),
      ),
    });
    assert.deepEqual(
      rotatedBoundingBox(10, 4, 15),
      rotatedBoundingBox(10, 4, 15),
    );
    const near = rotatedBoundingBox(30, 10, 1);
    const theta = (1 * Math.PI) / 180;
    assert.equal(
      near.width,
      Math.ceil(
        30 * Math.abs(Math.cos(theta)) + 10 * Math.abs(Math.sin(theta)),
      ),
    );
  });

  test('crop mapping matches the floor and ceil inspection formula', () => {
    const pixels = rgba(5, 4, (x, y) => (x === 3 && y === 1 ? 8 : 7));
    const visible = findVisibleAlphaBounds(pixels, 5, 4);
    assert.deepEqual(visible, { left: 3, top: 1, width: 1, height: 1 });
    const mapped = mapInspectionCropToSource(
      visible ?? identityCrop(5, 4),
      11,
      9,
      5,
      4,
    );
    assert.deepEqual(mapped, {
      left: Math.floor((3 * 11) / 5),
      top: Math.floor((1 * 9) / 4),
      width:
        Math.min(11, Math.ceil(((3 + 1) * 11) / 5)) - Math.floor((3 * 11) / 5),
      height:
        Math.min(9, Math.ceil(((1 + 1) * 9) / 4)) - Math.floor((1 * 9) / 4),
    });
    assert.equal(
      findVisibleAlphaBounds(
        rgba(3, 2, () => 0),
        3,
        2,
      ),
      null,
    );
  });

  test('admission limits reject the byte and pixel boundaries', () => {
    assert.doesNotThrow(() => assertEncodedArtworkBytes(SOURCE_MAX_BYTES));
    assert.throws(() => assertEncodedArtworkBytes(SOURCE_MAX_BYTES + 1), {
      message: artworkLimitCopy.encodedBytes,
    });
    assert.doesNotThrow(() =>
      assertDecodedArtworkDimensions(SOURCE_MAX_EDGE_PX, SOURCE_MAX_EDGE_PX),
    );
    assert.throws(
      () => assertDecodedArtworkDimensions(SOURCE_MAX_EDGE_PX + 1, 2),
      { message: artworkLimitCopy.dimensions },
    );
    assert.throws(() => assertDecodedArtworkDimensions(Number.NaN, 2), {
      message: artworkLimitCopy.invalidDimensions,
    });
    assert.throws(() => assertCardOutputBudget(0, 10, 2), {
      message: artworkLimitCopy.cardUnmeasured,
    });
    assert.throws(
      () => assertCardOutputBudget(CARD_OUTPUT_MAX_EDGE_PX, 10, 2),
      { message: artworkLimitCopy.cardOutput },
    );
  });

  test('thin display draws keep a uniform scale inside the destination', () => {
    const cases = [
      { width: 1, height: 4096, rotation: 0, flipHorizontal: true },
      { width: 3, height: 4096, rotation: 0, flipHorizontal: false },
      { width: 7, height: 4096, rotation: 0, flipHorizontal: false },
      { width: 4096, height: 1, rotation: 0, flipHorizontal: false },
      { width: 4096, height: 5, rotation: 0, flipHorizontal: true },
      { width: 4096, height: 1, rotation: 90, flipHorizontal: false },
      { width: 4096, height: 3, rotation: 90, flipHorizontal: true },
      { width: 1, height: 4096, rotation: 15, flipHorizontal: true },
      { width: 10, height: 4, rotation: 0, flipHorizontal: false },
    ];
    for (const entry of cases) {
      const plan = planArtworkDraw({
        logicalWidth: entry.width,
        logicalHeight: entry.height,
        rotationDegrees: entry.rotation,
        flipHorizontal: entry.flipHorizontal,
        flipVertical: false,
        policy: 'display',
      });
      assert.ok(plan.destinationWidth <= DISPLAY_MAX_EDGE_PX);
      assert.ok(plan.destinationHeight <= DISPLAY_MAX_EDGE_PX);
      assert.ok(
        plan.destinationWidth * plan.destinationHeight <= DISPLAY_MAX_PIXELS,
      );
      const drawn: unknown[][] = [];
      paintTransformedDrawable(
        {
          save() {},
          restore() {},
          translate() {},
          scale() {},
          rotate() {},
          drawImage(...args: unknown[]) {
            drawn.push(args);
          },
        } as unknown as DrawContext,
        { width: entry.width, height: entry.height },
        plan,
      );
      const call = drawn[0] ?? [];
      const drawnWidth = Number(call[call.length - 2]);
      const drawnHeight = Number(call[call.length - 1]);
      assert.ok(drawnWidth > 0);
      assert.ok(drawnHeight > 0);
      assert.equal(drawnWidth / entry.width, drawnHeight / entry.height);
      const cosine = Math.cos(plan.rotationRadians);
      const sine = Math.sin(plan.rotationRadians);
      const centerX = plan.destinationWidth / 2;
      const centerY = plan.destinationHeight / 2;
      const points = [-1, 1].flatMap((xSide) =>
        [-1, 1].map((ySide) => {
          const x = (xSide * drawnWidth) / 2;
          const y = (ySide * drawnHeight) / 2;
          const rotatedX = x * cosine - y * sine;
          const rotatedY = x * sine + y * cosine;
          return {
            x: rotatedX * plan.flipX + centerX,
            y: rotatedY * plan.flipY + centerY,
          };
        }),
      );
      for (const point of points) {
        assert.ok(point.x >= -1e-4 && point.x <= plan.destinationWidth + 1e-4);
        assert.ok(point.y >= -1e-4 && point.y <= plan.destinationHeight + 1e-4);
      }
      const xs = points.map((point) => point.x);
      const ys = points.map((point) => point.y);
      const extent = Math.max(
        Math.max(...xs) - Math.min(...xs),
        Math.max(...ys) - Math.min(...ys),
      );
      assert.ok(
        extent >=
          Math.min(DISPLAY_MAX_EDGE_PX, Math.max(entry.width, entry.height)) -
            1,
      );
    }
    const exported = planArtworkDraw({
      logicalWidth: 1,
      logicalHeight: 4096,
      rotationDegrees: 90,
      flipHorizontal: true,
      flipVertical: false,
      policy: 'export',
    });
    const exportedBounds = rotatedBoundingBox(1, 4096, 90);
    assert.equal(exported.fitScale, 1);
    assert.equal(exported.destinationWidth, exportedBounds.width);
    assert.equal(exported.destinationHeight, exportedBounds.height);
    assert.ok(exported.destinationWidth > DISPLAY_MAX_EDGE_PX);
  });
});

describe('prepared artwork raster wiring', () => {
  test('fake canvas records a bounded preview and the exact crop', async () => {
    const width = 6;
    const height = 5;
    const pixels = rgba(width, height, (x, y) =>
      x >= 1 && x <= 3 && y >= 2 && y <= 4 ? 255 : 0,
    );
    const recording = recordingFactory(pixels);
    const file = new File([Uint8Array.from([9, 9, 9])], 'art.png', {
      type: 'image/png',
    });
    const prepared = await readPreparedArtwork(file, {
      decode: async () => fakeDecoded(width, height),
      factory: recording.factory,
      readPixels: () => recording.readPixels(),
    });
    assert.deepEqual(prepared.crop, { left: 1, top: 2, width: 3, height: 3 });
    assert.equal(prepared.aspectRatio, 1);
    assert.notEqual(prepared.previewBlob, file);
    assert.equal(prepared.sourceBlob, file);
    for (const canvas of recording.created) {
      assert.ok(canvas.width <= INSPECTION_MAX_EDGE_PX);
      assert.ok(canvas.height <= INSPECTION_MAX_EDGE_PX);
      if (
        canvas.width <= DISPLAY_MAX_EDGE_PX &&
        canvas.height <= DISPLAY_MAX_EDGE_PX
      ) {
        assert.ok(canvas.width * canvas.height <= DISPLAY_MAX_PIXELS);
      }
    }
    const displayCanvases = recording.created.filter(
      (canvas) => canvas.width === 3 && canvas.height === 3,
    );
    assert.equal(displayCanvases.length, 1);
  });

  test('readback failure still builds a bounded preview of the full rectangle', async () => {
    const recording = recordingFactory('fallback');
    const file = new File([Uint8Array.from([4])], 'full.png', {
      type: 'image/png',
    });
    const prepared = await readPreparedArtwork(file, {
      decode: async () => fakeDecoded(8, 2),
      factory: recording.factory,
      readPixels: () => 'fallback',
    });
    assert.deepEqual(prepared.crop, identityCrop(8, 2));
    assert.notEqual(
      await prepared.previewBlob.arrayBuffer(),
      await file.arrayBuffer(),
    );
    assert.ok(recording.created.every((canvas) => canvas.width <= 8));
  });

  test('oversized bytes never decode and oversized pixels never allocate', async () => {
    let decoded = 0;
    const huge = new File([new Uint8Array(1)], 'huge.png', {
      type: 'image/png',
    });
    Object.defineProperty(huge, 'size', { value: SOURCE_MAX_BYTES + 1 });
    await assert.rejects(
      readPreparedArtwork(huge, {
        decode: async () => {
          decoded += 1;
          return fakeDecoded(1, 1);
        },
      }),
      { message: artworkLimitCopy.encodedBytes },
    );
    assert.equal(decoded, 0);
    const recording = recordingFactory(new Uint8ClampedArray(16));
    await assert.rejects(
      readPreparedArtwork(new File([Uint8Array.from([1])], 'wide.png'), {
        decode: async () => fakeDecoded(SOURCE_MAX_EDGE_PX + 1, 2),
        factory: recording.factory,
      }),
      { message: artworkLimitCopy.dimensions },
    );
    assert.equal(recording.created.length, 0);
  });

  test('one canvas composes rotate then flip and export is not display-capped', () => {
    const recording = recordingFactory(new Uint8ClampedArray(64));
    const canvas = renderTransformedCanvas(
      { width: 20, height: 10 },
      {
        logicalWidth: 20,
        logicalHeight: 10,
        rotationDegrees: 90,
        flipHorizontal: true,
        flipVertical: false,
        policy: 'display',
      },
      recording.factory,
    );
    assert.equal(recording.created.length, 1);
    const bounds = rotatedBoundingBox(20, 10, 90);
    assert.equal(canvas.width, bounds.width);
    assert.equal(canvas.height, bounds.height);
    assert.ok(canvas.width <= DISPLAY_MAX_EDGE_PX);
    const context = recording.contexts[0];
    assert.ok(context);
    assert.deepEqual(
      context.calls.filter((call) => call !== 'draw'),
      ['save', 'translate', 'scale', 'rotate', 'restore'],
    );
    paintTransformedDrawable(
      context,
      { width: 20, height: 10 },
      planArtworkDraw({
        logicalWidth: 20,
        logicalHeight: 10,
        rotationDegrees: 180,
        flipHorizontal: false,
        flipVertical: true,
        policy: 'export',
      }),
    );
    const exported = planArtworkDraw({
      logicalWidth: 2000,
      logicalHeight: 1000,
      rotationDegrees: 0,
      flipHorizontal: false,
      flipVertical: false,
      policy: 'export',
    });
    assert.equal(exported.destinationWidth, 2000);
    assert.equal(exported.destinationHeight, 1000);
  });

  test('the read gate decodes only the active job and the latest pending file', async () => {
    const started: string[] = [];
    let releaseFirst: () => void = () => undefined;
    const gate = createArtworkReadGate(async (file, isCancelled) => {
      started.push(file.name);
      if (file.name === 'a.png') {
        await new Promise<void>((resolve) => {
          releaseFirst = resolve;
        });
      }
      if (isCancelled()) {
        throw new DOMException('The operation was aborted.', 'AbortError');
      }
      return file.name;
    });
    const first = gate.submit(new File([], 'a.png'), () => false);
    const second = gate.submit(new File([], 'b.png'), () => false);
    const secondSettled = second.then(
      () => 'resolved',
      () => 'rejected',
    );
    const third = gate.submit(new File([], 'c.png'), () => false);
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.deepEqual(started, ['a.png']);
    releaseFirst();
    assert.equal(await secondSettled, 'rejected');
    assert.equal(await first, 'a.png');
    assert.equal(await third, 'c.png');
    assert.deepEqual(started, ['a.png', 'c.png']);
  });

  test('clearing a pending read does not stick the gate, and a sync failure can be followed', async () => {
    const started: string[] = [];
    let releaseFirst: () => void = () => undefined;
    let cancelPending = false;
    const gate = createArtworkReadGate(async (file) => {
      started.push(file.name);
      if (file.name === 'a.png') {
        await new Promise<void>((resolve) => {
          releaseFirst = resolve;
        });
      }
      if (file.name === 'bad.png') {
        throw new Error('sync-fail');
      }
      return file.name;
    });
    const active = gate.submit(new File([], 'a.png'), () => false);
    const pending = gate.submit(new File([], 'b.png'), () => cancelPending);
    await new Promise((resolve) => setTimeout(resolve, 0));
    cancelPending = true;
    releaseFirst();
    assert.equal(await active, 'a.png');
    await assert.rejects(pending, { name: 'AbortError' });
    const next = Promise.race([
      gate.submit(new File([], 'c.png'), () => false),
      new Promise<string>((_resolve, reject) => {
        setTimeout(() => reject(new Error('stuck')), 50);
      }),
    ]);
    assert.equal(await next, 'c.png');
    assert.deepEqual(started, ['a.png', 'c.png']);

    const failing = createArtworkReadGate(async (file) => {
      if (file.name === 'bad.png') {
        throw new Error('sync-fail');
      }
      return file.name;
    });
    const rejected = failing.submit(new File([], 'bad.png'), () => false);
    const followed = failing.submit(new File([], 'good.png'), () => false);
    await assert.rejects(rejected, { message: 'sync-fail' });
    assert.equal(await followed, 'good.png');
  });

  test('a drawing exception releases the canvas before it escapes', () => {
    let released = 0;
    const canvas = {
      width: 12,
      height: 8,
      getContext() {
        return {
          save() {
            return undefined;
          },
          translate() {
            return undefined;
          },
          scale() {
            return undefined;
          },
          rotate() {
            return undefined;
          },
          drawImage() {
            throw new Error('draw failed');
          },
          restore() {
            return undefined;
          },
          getImageData() {
            throw new Error('unused');
          },
        };
      },
      toBlob() {
        return undefined;
      },
    };
    assert.throws(
      () =>
        renderTransformedCanvas(
          { width: 4, height: 4 },
          {
            logicalWidth: 4,
            logicalHeight: 4,
            rotationDegrees: 15,
            flipHorizontal: false,
            flipVertical: false,
            policy: 'export',
          },
          {
            create() {
              return canvas;
            },
            release(value) {
              released += 1;
              value.width = 0;
              value.height = 0;
            },
          },
        ),
      { message: 'draw failed' },
    );
    assert.equal(released, 1);
    assert.equal(canvas.width, 0);
    assert.equal(canvas.height, 0);
  });
});

describe('canonical export preparation', () => {
  test('identity crop keeps real source bytes and a failed promise can retry', async () => {
    const source = await sharp({
      create: {
        width: 2,
        height: 2,
        channels: 3,
        background: { r: 1, g: 2, b: 3 },
      },
    })
      .png()
      .toBuffer();
    const sourceBlob = new Blob([Uint8Array.from(source)], {
      type: 'image/png',
    });
    const preview = new Blob([Uint8Array.from([7])], { type: 'image/png' });
    const bundle = createArtworkBundle({
      preview,
      source: sourceBlob,
      sourceWidth: 2,
      sourceHeight: 2,
      crop: identityCrop(2, 2),
    });
    let decodes = 0;
    const canonical = await materializeCanonicalArtwork(bundle, {
      decodeDimensions: async () => {
        decodes += 1;
        return { width: 2, height: 2 };
      },
      readDataUrl: async (blob) => `data:${blob.type};size=${blob.size}`,
      rasterizeCrop: async () => {
        throw new Error('identity crop must not rasterize');
      },
    });
    assert.equal(canonical.blob, sourceBlob);
    assert.equal(canonical.mimeType, 'image/png');
    assert.deepEqual(
      new Uint8Array(await canonical.blob.arrayBuffer()),
      new Uint8Array(source),
    );
    await materializeCanonicalArtwork(bundle, {
      decodeDimensions: async () => {
        decodes += 1;
        return { width: 2, height: 2 };
      },
      readDataUrl: async () => 'unused',
      rasterizeCrop: async () => preview,
    });
    assert.equal(decodes, 1);
    dropCanonicalArtwork(bundle);
    let attempts = 0;
    await assert.rejects(
      materializeCanonicalArtwork(bundle, {
        decodeDimensions: async () => {
          attempts += 1;
          return { width: 1, height: 1 };
        },
        readDataUrl: async () => 'bad',
        rasterizeCrop: async () => preview,
      }),
      { message: artworkLimitCopy.sourceMismatch },
    );
    const retried = await materializeCanonicalArtwork(bundle, {
      decodeDimensions: async () => ({ width: 2, height: 2 }),
      readDataUrl: async () => 'data:image/png;retry',
      rasterizeCrop: async () => preview,
    });
    assert.equal(attempts, 1);
    assert.equal(retried.dataUrl, 'data:image/png;retry');
  });

  test('captured export keeps the old snapshot and full source after replacement', async () => {
    const source = new Blob([Uint8Array.from([9, 8, 7])], {
      type: 'image/png',
    });
    const preview = new Blob([Uint8Array.from([1])], { type: 'image/png' });
    const bundle = createArtworkBundle({
      preview,
      source,
      sourceWidth: 3,
      sourceHeight: 1,
      crop: { left: 1, top: 0, width: 1, height: 1 },
    });
    const state = {
      ...defaultMagicItemWorkbenchState,
      itemName: 'Captured',
      imagePreviewUrl: 'data:image/png;base64,preview',
      imageRotationDegrees: 90,
      imageFlipHorizontal: true,
      resolvedImageAspectRatio: 1,
    };
    const captured = {
      state,
      snapshot: toWorkbenchSnapshotForExport(state),
      format: 'jpg' as const,
      pixelRatio: 2 as const,
      bundle,
      reuseEpoch: 0,
    };
    let crops = 0;
    const prepared = await prepareCapturedExport(captured, {
      materialize: (value) =>
        materializeCanonicalArtwork(value, {
          decodeDimensions: async () => ({ width: 3, height: 1 }),
          readDataUrl: async () => 'data:image/png;base64,canonical',
          rasterizeCrop: async () => {
            crops += 1;
            return new Blob([Uint8Array.from([5, 5])], { type: 'image/png' });
          },
        }),
      renderTransformedUrl: async () => ({
        url: 'blob:transformed',
        release() {
          return undefined;
        },
      }),
    });
    state.itemName = 'Replaced';
    const completed = completeCapturedExport(prepared, 'data:image/jpeg,card');
    assert.equal(crops, 1);
    assert.equal(prepared.preparedUrl, 'blob:transformed');
    assert.equal(prepared.sourceDataUrl, 'data:image/png;base64,canonical');
    assert.equal(prepared.alreadyTransformed, true);
    assert.equal(completed.exportPixelRatio, 2);
    assert.equal(completed.exportFormat, 'jpg');
    assert.equal(completed.workbenchSnapshot.itemName, 'Captured');
    assert.equal(
      completed.sourceImagePreviewDataUrl.includes('canonical'),
      true,
    );
    const repeated = await prepareCapturedExport(captured, {
      materialize: (value) =>
        materializeCanonicalArtwork(value, {
          decodeDimensions: async () => {
            throw new Error('should reuse');
          },
          readDataUrl: async () => 'unused',
          rasterizeCrop: async () => preview,
        }),
      renderTransformedUrl: async () => ({
        url: 'blob:again',
        release() {
          return undefined;
        },
      }),
    });
    assert.equal(crops, 1);
    assert.equal(repeated.sourceDataUrl, 'data:image/png;base64,canonical');
    const lock = createCardExportLock();
    let release: () => void = () => undefined;
    const running = lock.run(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    await assert.rejects(
      lock.run(async () => undefined),
      {
        message: artworkLimitCopy.exportBusy,
      },
    );
    release();
    await running;
    assert.equal(readArtworkBundle(bundle)?.crop.width, 1);
  });

  test('an oversized preview bundle is rejected before it can be decoded', () => {
    const preview = new Blob([Uint8Array.from([1, 2, 3])], {
      type: 'image/png',
    });
    const source = new Blob([Uint8Array.from([4, 5, 6])], {
      type: 'image/png',
    });
    const input = {
      preview,
      source,
      sourceWidth: 8,
      sourceHeight: 8,
      crop: identityCrop(8, 8),
    };
    Object.defineProperty(preview, 'size', {
      value: SOURCE_MAX_BYTES,
      configurable: true,
    });
    assert.equal(readArtworkBundle(createArtworkBundle(input))?.source, source);
    Object.defineProperty(preview, 'size', {
      value: SOURCE_MAX_BYTES + 1,
      configurable: true,
    });
    assert.equal(readArtworkBundle(createArtworkBundle(input)), null);
    Object.defineProperty(preview, 'size', { value: 12, configurable: true });
    Object.defineProperty(source, 'size', {
      value: SOURCE_MAX_BYTES + 1,
      configurable: true,
    });
    assert.equal(readArtworkBundle(createArtworkBundle(input)), null);
  });

  test('a visible preview without a source is an export error', async () => {
    const state = {
      ...defaultMagicItemWorkbenchState,
      imagePreviewUrl: 'data:image/png;base64,AAAA',
    };
    await assert.rejects(
      prepareCapturedExport(
        {
          state,
          snapshot: toWorkbenchSnapshotForExport(state),
          format: 'png',
          pixelRatio: 2,
          bundle: null,
          reuseEpoch: 0,
        },
        {
          materialize: async () => {
            throw new Error('unexpected');
          },
          renderTransformedUrl: async () => {
            throw new Error('unexpected');
          },
        },
      ),
      { message: artworkLimitCopy.missingSource },
    );
  });
});

describe('export readiness, measurement, and limit responses', () => {
  test('wait uses the renderer inside the capture node, its generation, and a decoded image', async () => {
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
    try {
      let phase = 0;
      const child = {
        getAttribute(name: string) {
          if (name === 'data-artwork-state') {
            return phase === 0 ? 'pending' : 'ready';
          }
          if (name === 'data-export-generation') {
            return '4';
          }
          return null;
        },
      };
      const images = [{ complete: false, naturalWidth: 0 }];
      const node = {
        getAttribute: () => null,
        querySelector: () => child,
        querySelectorAll: () => images,
      };
      const pending = waitForArtworkState(node, { generation: 4 });
      phase = 1;
      images[0] = { complete: true, naturalWidth: 32 };
      frames.shift()?.();
      await pending;
      await assert.rejects(
        waitForArtworkState(
          {
            getAttribute: () => null,
            querySelector: () => child,
            querySelectorAll: () => [{ complete: true, naturalWidth: 0 }],
          },
          { generation: 4 },
        ),
        { message: artworkLimitCopy.artworkFailed },
      );
    } finally {
      Date.now = realNow;
      globalThis.requestAnimationFrame = previousFrame;
    }
  });

  test('stable box resolves on the second matching frame', async () => {
    const frames: Array<() => void> = [];
    const previousFrame = globalThis.requestAnimationFrame;
    globalThis.requestAnimationFrame = ((callback: FrameRequestCallback) => {
      frames.push(() => callback(0));
      return frames.length;
    }) as typeof requestAnimationFrame;
    try {
      const pending = waitForStableElementBox({
        offsetWidth: 432,
        offsetHeight: 600,
      });
      frames.shift()?.();
      await Promise.resolve();
      let settled = false;
      void pending.then(() => {
        settled = true;
      });
      await Promise.resolve();
      assert.equal(settled, false);
      frames.shift()?.();
      await pending;
    } finally {
      globalThis.requestAnimationFrame = previousFrame;
    }
  });

  test('stable box ignores a zero-sized frame', async () => {
    const frames: Array<() => void> = [];
    const previousFrame = globalThis.requestAnimationFrame;
    globalThis.requestAnimationFrame = ((callback: FrameRequestCallback) => {
      frames.push(() => callback(0));
      return frames.length;
    }) as typeof requestAnimationFrame;
    try {
      let width = 0;
      let height = 0;
      const node = {
        get offsetWidth() {
          return width;
        },
        get offsetHeight() {
          return height;
        },
      };
      const pending = waitForStableElementBox(node);
      frames.shift()?.();
      await Promise.resolve();
      width = 432;
      height = 600;
      frames.shift()?.();
      await Promise.resolve();
      frames.shift()?.();
      await Promise.resolve();
      await pending;
    } finally {
      globalThis.requestAnimationFrame = previousFrame;
    }
  });

  test('stable box resets after a size change', async () => {
    const frames: Array<() => void> = [];
    const previousFrame = globalThis.requestAnimationFrame;
    globalThis.requestAnimationFrame = ((callback: FrameRequestCallback) => {
      frames.push(() => callback(0));
      return frames.length;
    }) as typeof requestAnimationFrame;
    try {
      let width = 100;
      let height = 600;
      const node = {
        get offsetWidth() {
          return width;
        },
        get offsetHeight() {
          return height;
        },
      };
      const pending = waitForStableElementBox(node);
      frames.shift()?.();
      await Promise.resolve();
      height = 500;
      frames.shift()?.();
      await Promise.resolve();
      width = 432;
      height = 600;
      frames.shift()?.();
      await Promise.resolve();
      frames.shift()?.();
      await Promise.resolve();
      await pending;
    } finally {
      globalThis.requestAnimationFrame = previousFrame;
    }
  });

  test('stable box throws cardUnmeasured after the deadline', async () => {
    const frames: Array<() => void> = [];
    const previousFrame = globalThis.requestAnimationFrame;
    globalThis.requestAnimationFrame = ((callback: FrameRequestCallback) => {
      frames.push(() => callback(0));
      return frames.length;
    }) as typeof requestAnimationFrame;
    const realNow = Date.now;
    let now = 0;
    Date.now = () => now;
    try {
      const pending = waitForStableElementBox({
        offsetWidth: 10,
        offsetHeight: 10,
      });
      now = 10_000;
      frames.shift()?.();
      await Promise.resolve();
      await assert.rejects(pending, {
        message: artworkLimitCopy.cardUnmeasured,
      });
    } finally {
      Date.now = realNow;
      globalThis.requestAnimationFrame = previousFrame;
    }
  });

  test('fixed-side margin uses latched surface height not shifted outer height', () => {
    const latchedMargin = imageRightArtworkMarginTopRem({
      imageRightVerticalPosition: 32,
      sideLayoutFlow: 'fixed',
      classificationAndRarity: 'Weapon, rare',
      surfaceHeightPx: 779,
    });
    const shiftedMargin = imageRightArtworkMarginTopRem({
      imageRightVerticalPosition: 32,
      sideLayoutFlow: 'fixed',
      classificationAndRarity: 'Weapon, rare',
      surfaceHeightPx: 900,
    });
    assert.equal(latchedMargin, 30);
    assert.notEqual(latchedMargin, shiftedMargin);
  });

  test('legacy data URL byte length is known before a native decode', () => {
    assert.equal(dataUrlEncodedByteLength('data:image/png;base64,AAAA'), 3);
    const payloadLength = Math.ceil((SOURCE_MAX_BYTES + 1) / 3) * 4;
    const estimated = Math.floor((payloadLength * 3) / 4);
    assert.ok(estimated > SOURCE_MAX_BYTES);
  });

  test('source and card-output limits keep guidance and map to 422', () => {
    const source = new ArtworkLimitError(
      'source_dimensions',
      'Image is too large. Resize it to at most 4096px on each side and try again.',
    );
    const output = new ArtworkLimitError(
      'card_output',
      artworkLimitCopy.cardOutput,
    );
    assert.deepEqual(artworkLimitHttpResponse(source), {
      status: 422,
      body: {
        error: 'artwork_too_large',
        message: source.message,
      },
    });
    assert.deepEqual(artworkLimitHttpResponse(output), {
      status: 422,
      body: {
        error: 'card_output_too_large',
        message: artworkLimitCopy.cardOutput,
      },
    });
    assert.equal(artworkLimitHttpResponse(new Error('chromium died')), null);
    const serialized = serializeArtworkLimitError(output);
    assert.ok(serialized);
    const restored = artworkLimitErrorFromSerialized(serialized);
    assert.equal(restored?.code, 'card_output');
    assert.equal(restored?.message, artworkLimitCopy.cardOutput);
    assert.throws(() => assertCardOutputBudget(432, 20_000, 2), {
      name: 'ArtworkLimitError',
      message: artworkLimitCopy.cardOutput,
    });
  });
});
