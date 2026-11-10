import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { describe, test } from 'node:test';
import sharp from 'sharp';
import {
  encodeSourcePng,
  MAX_SOURCE_STORAGE_BYTES,
  optimizeSourcePng,
  type SourcePngEncodeRequest,
  sourcePngDimensionSchedule,
  storeOptimizedSourceImage,
} from './optimizeSourcePng.ts';

const LEGACY_QUALITIES = [90, 85, 80, 75, 70, 65, 60, 55, 50, 45, 40];
const LEGACY_COLORS = [256, 224, 192, 160, 128, 96, 64, 48, 32];
const BITDEPTH_8_COLORS = [256, 224, 192, 160];
const BITDEPTH_4_COLORS = [128, 96, 64, 48, 32];

type StorageCall = 'store' | 'finalize' | 'delete';

function sha256Hex(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

function pngSignature(buffer: Buffer): boolean {
  return buffer
    .subarray(0, 8)
    .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
}

function writeRgba(
  raw: Buffer,
  width: number,
  x: number,
  y: number,
  red: number,
  green: number,
  blue: number,
  alpha: number,
): void {
  const offset = (y * width + x) * 4;
  raw.writeUInt8(red, offset);
  raw.writeUInt8(green, offset + 1);
  raw.writeUInt8(blue, offset + 2);
  raw.writeUInt8(alpha, offset + 3);
}

function countVisibleColors(raw: Buffer): number {
  const colors = new Set<number>();
  for (let offset = 0; offset < raw.length; offset += 4) {
    if (raw.readUInt8(offset + 3) === 0) {
      continue;
    }
    colors.add(
      (raw.readUInt8(offset) << 16) |
        (raw.readUInt8(offset + 1) << 8) |
        raw.readUInt8(offset + 2),
    );
  }
  return colors.size;
}

async function pngFromRgba(
  raw: Buffer,
  width: number,
  height: number,
): Promise<Buffer> {
  return sharp(raw, { raw: { width, height, channels: 4 } })
    .png({
      palette: false,
      compressionLevel: 9,
      adaptiveFiltering: false,
    })
    .toBuffer();
}

async function decodeRgba(png: Buffer): Promise<{
  data: Buffer;
  width: number;
  height: number;
  isPalette: boolean | undefined;
}> {
  const metadata = await sharp(png).metadata();
  const data = await sharp(png).ensureAlpha().raw().toBuffer();
  return {
    data,
    width: metadata.width ?? 0,
    height: metadata.height ?? 0,
    isPalette: metadata.isPalette,
  };
}

function artworkRaw(width: number, height: number): Buffer {
  const raw = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      const hole = x < 2 && y < 2;
      const soft = x === width - 1;
      const alpha = hole ? 0 : soft ? 24 + y * 9 : 255;
      writeRgba(
        raw,
        width,
        x,
        y,
        index & 255,
        (index >> 8) & 255,
        (index * 13 + 7) & 255,
        alpha,
      );
    }
  }
  return raw;
}

function hashPixel(x: number, y: number): number {
  let value = (x * 374761393 + y * 668265263) ^ (x << 8);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return (value ^ (value >>> 16)) >>> 0;
}

function entropyRaw(size: number): Buffer {
  const raw = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const hashed = hashPixel(x, y);
      const hole = x > 40 && x < 56 && y > 40 && y < 56;
      const edge = x < 8;
      const alpha = hole ? 0 : edge ? 20 + x * 25 : 255;
      writeRgba(
        raw,
        size,
        x,
        y,
        hashed & 255,
        (hashed >>> 8) & 255,
        (hashed >>> 16) & 255,
        alpha,
      );
    }
  }
  return raw;
}

function sharpPngState(
  colors: number,
  quality: number,
): {
  bitdepth: number;
  palette: boolean;
  quality: number;
} {
  const instance = sharp({
    create: {
      width: 1,
      height: 1,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  }).png({
    palette: true,
    quality,
    colors,
    effort: 10,
  });
  const state = instance as unknown as {
    options: {
      pngBitdepth: number;
      pngPalette: boolean;
      pngQuality: number;
    };
  };
  return {
    bitdepth: state.options.pngBitdepth,
    palette: state.options.pngPalette,
    quality: state.options.pngQuality,
  };
}

function scriptedEncoder(lengths: number[]): {
  encode: (request: SourcePngEncodeRequest) => Promise<Buffer>;
  requests: SourcePngEncodeRequest[];
  outputs: Buffer[];
} {
  const requests: SourcePngEncodeRequest[] = [];
  const outputs: Buffer[] = [];
  return {
    requests,
    outputs,
    encode: (request) => {
      const length =
        lengths[requests.length] ?? lengths[lengths.length - 1] ?? 1;
      const output = Buffer.alloc(length, requests.length + 1);
      requests.push(request);
      outputs.push(output);
      return Promise.resolve(output);
    },
  };
}

function dimensionKey(width: number, height: number): string {
  return `${width}x${height}`;
}

describe('installed Sharp palette groups', () => {
  test('legacy color requests collapse to 22 quality and bitdepth tuples', () => {
    const tuples = new Set<string>();
    const bitdepth8: number[] = [];
    const bitdepth4: number[] = [];

    for (const quality of LEGACY_QUALITIES) {
      for (const colors of LEGACY_COLORS) {
        const state = sharpPngState(colors, quality);
        assert.equal(state.palette, true);
        assert.equal(state.quality, quality);
        tuples.add(`${state.quality}:${state.bitdepth}`);
        if (quality === 90 && state.bitdepth === 8) {
          bitdepth8.push(colors);
        }
        if (quality === 90 && state.bitdepth === 4) {
          bitdepth4.push(colors);
        }
      }
    }

    assert.deepEqual(bitdepth8, BITDEPTH_8_COLORS);
    assert.deepEqual(bitdepth4, BITDEPTH_4_COLORS);
    assert.equal(tuples.size, 22);
    assert.equal(tuples.has('90:8'), true);
    assert.equal(tuples.has('40:8'), true);
    assert.equal(tuples.has('90:4'), true);
    assert.equal(tuples.has('40:4'), true);
    assert.equal(tuples.has('65:8'), true);
    assert.equal(tuples.has('65:4'), true);
  });

  test('representative RGBA encodes match within each bitdepth group', async () => {
    const width = 48;
    const height = 48;
    const raw = Buffer.alloc(width * height * 4);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const hashed = hashPixel(x, y);
        writeRgba(
          raw,
          width,
          x,
          y,
          hashed & 255,
          (hashed >>> 8) & 255,
          (hashed >>> 16) & 255,
          255,
        );
      }
    }

    const encoded = new Map<number, Buffer>();
    for (const colors of LEGACY_COLORS) {
      const output = await sharp(raw, {
        raw: { width, height, channels: 4 },
      })
        .png({
          palette: true,
          quality: 90,
          colors,
          effort: 10,
        })
        .toBuffer();
      encoded.set(colors, output);
    }

    const eightBit = encoded.get(256);
    const fourBit = encoded.get(128);
    assert.ok(eightBit !== undefined);
    assert.ok(fourBit !== undefined);
    for (const colors of BITDEPTH_8_COLORS) {
      assert.equal(encoded.get(colors)?.equals(eightBit), true);
    }
    for (const colors of BITDEPTH_4_COLORS) {
      assert.equal(encoded.get(colors)?.equals(fourBit), true);
    }
  });
});

describe('dimension schedule', () => {
  test('covers shape, rounding, short edges, and duplicate removal', () => {
    assert.deepEqual(sourcePngDimensionSchedule(100, 100), [
      { width: 100, height: 100 },
      { width: 75, height: 75 },
      { width: 56, height: 56 },
      { width: 42, height: 42 },
      { width: 32, height: 32 },
    ]);
    assert.deepEqual(sourcePngDimensionSchedule(200, 80), [
      { width: 200, height: 80 },
      { width: 150, height: 60 },
      { width: 113, height: 45 },
      { width: 84, height: 34 },
      { width: 80, height: 32 },
    ]);
    assert.deepEqual(sourcePngDimensionSchedule(40, 400), [
      { width: 40, height: 400 },
      { width: 32, height: 320 },
    ]);
    assert.deepEqual(sourcePngDimensionSchedule(400, 40), [
      { width: 400, height: 40 },
      { width: 320, height: 32 },
    ]);
    assert.deepEqual(sourcePngDimensionSchedule(31, 80), [
      { width: 31, height: 80 },
    ]);
    assert.deepEqual(sourcePngDimensionSchedule(32, 80), [
      { width: 32, height: 80 },
    ]);
    assert.deepEqual(sourcePngDimensionSchedule(33, 80), [
      { width: 33, height: 80 },
      { width: 32, height: 78 },
    ]);
    assert.deepEqual(sourcePngDimensionSchedule(31, 31), [
      { width: 31, height: 31 },
    ]);
    assert.deepEqual(sourcePngDimensionSchedule(32, 32), [
      { width: 32, height: 32 },
    ]);
    assert.deepEqual(sourcePngDimensionSchedule(33, 33), [
      { width: 33, height: 33 },
      { width: 32, height: 32 },
    ]);
    assert.deepEqual(sourcePngDimensionSchedule(1, 40), [
      { width: 1, height: 40 },
    ]);

    const huge = sourcePngDimensionSchedule(100_000, 80_000);
    assert.equal(huge.length <= 7, true);
    assert.deepEqual(huge[0], { width: 100_000, height: 80_000 });
    assert.deepEqual(huge[1], { width: 75_000, height: 60_000 });
    const seen = new Set<string>();
    for (const size of huge) {
      assert.equal(size.width >= 1, true);
      assert.equal(size.height >= 1, true);
      assert.equal(size.width <= 100_000, true);
      assert.equal(size.height <= 80_000, true);
      seen.add(dimensionKey(size.width, size.height));
    }
    assert.equal(seen.size, huge.length);
    const last = huge[huge.length - 1];
    assert.ok(last !== undefined);
    assert.equal(Math.min(last.width, last.height), 32);
  });
});

describe('bounded search', () => {
  test('exact and below-cap initial results stop before palette or resize', async () => {
    const exact = scriptedEncoder([100]);
    const exactOxipng: Buffer[] = [];
    const exactResult = await optimizeSourcePng(Buffer.from('exact'), {
      maxBytes: 100,
      dimensions: { width: 200, height: 200 },
      encode: exact.encode,
      oxipng: (png) => {
        exactOxipng.push(png);
        return Promise.resolve(Buffer.alloc(140, 9));
      },
    });
    assert.equal(exactResult.length, 100);
    assert.equal(exact.requests.length, 1);
    assert.equal(exactOxipng.length, 1);
    assert.equal(exact.requests[0]?.mode, 'full-color');
    assert.equal(exact.requests[0]?.resize, false);

    const below = scriptedEncoder([80]);
    let oxipngCalls = 0;
    const shrunk = Buffer.alloc(70, 3);
    const belowResult = await optimizeSourcePng(Buffer.from('below'), {
      maxBytes: 100,
      dimensions: { width: 64, height: 64 },
      encode: below.encode,
      oxipng: () => {
        oxipngCalls += 1;
        return Promise.resolve(shrunk);
      },
    });
    assert.equal(belowResult, shrunk);
    assert.equal(below.requests.length, 1);
    assert.equal(oxipngCalls, 1);

    const broughtToCap = scriptedEncoder([150]);
    const capped = Buffer.alloc(100, 4);
    const cappedResult = await optimizeSourcePng(Buffer.from('capped'), {
      maxBytes: 100,
      dimensions: { width: 64, height: 64 },
      encode: broughtToCap.encode,
      oxipng: () => Promise.resolve(capped),
    });
    assert.equal(cappedResult, capped);
    assert.equal(broughtToCap.requests.length, 1);
  });

  test('later full-color and palette successes halt the remaining schedule', async () => {
    const palette = scriptedEncoder([300, 280, 120, 40]);
    const paletteOxipng: Buffer[] = [];
    const paletteResult = await optimizeSourcePng(Buffer.from('palette'), {
      maxBytes: 150,
      dimensions: { width: 33, height: 33 },
      encode: palette.encode,
      oxipng: (png) => {
        paletteOxipng.push(png);
        return Promise.resolve(Buffer.alloc(png.length + 20, 8));
      },
    });
    assert.equal(paletteResult, palette.outputs[2]);
    assert.equal(palette.requests.length, 3);
    assert.equal(palette.requests[2]?.mode, 'palette');
    if (palette.requests[2]?.mode === 'palette') {
      assert.equal(palette.requests[2].quality, 65);
      assert.equal(palette.requests[2].colors, 256);
      assert.equal(palette.requests[2].effort, 7);
    }
    assert.equal(paletteOxipng.length, 2);
    assert.equal(paletteOxipng[1], palette.outputs[2]);

    const resized = scriptedEncoder([400, 390, 380, 370, 100]);
    const resizedResult = await optimizeSourcePng(Buffer.from('resize'), {
      maxBytes: 100,
      dimensions: { width: 33, height: 33 },
      encode: resized.encode,
      oxipng: (png) => Promise.resolve(png),
    });
    assert.equal(resizedResult, resized.outputs[4]);
    assert.equal(resized.requests.length, 5);
    assert.equal(resized.requests[4]?.mode, 'full-color');
    assert.equal(resized.requests[4]?.resize, true);
    assert.equal(resized.requests[4]?.width, 32);
    assert.equal(resized.requests[4]?.height, 32);
    assert.equal(
      resized.requests.filter((request) => request.mode === 'full-color')
        .length,
      2,
    );
  });

  test('first accepted candidate wins when later sizes would be smaller', async () => {
    const script = scriptedEncoder([500, 400, 80, 10]);
    const oxipngInputs: Buffer[] = [];
    const result = await optimizeSourcePng(Buffer.from('halt'), {
      maxBytes: 100,
      dimensions: { width: 33, height: 33 },
      encode: (request) => {
        if (script.requests.length >= 3) {
          throw new Error('search continued after an acceptable candidate');
        }
        return script.encode(request);
      },
      oxipng: (png) => {
        oxipngInputs.push(png);
        if (png.length > 100) {
          return Promise.resolve(png);
        }
        return Promise.resolve(Buffer.alloc(90, 6));
      },
    });
    assert.equal(result, script.outputs[2]);
    assert.equal(result.length, 80);
    assert.equal(oxipngInputs.length, 2);
    assert.equal(oxipngInputs[1]?.length, 80);
  });

  test('exhausted search oxipngs the smallest candidate once, then enforces the cap', async () => {
    const lengths = [500, 400, 150, 450, 120, 300, 280, 260];
    const script = scriptedEncoder(lengths);
    const oxipngInputs: Buffer[] = [];
    const rescued = Buffer.alloc(40, 9);
    const result = await optimizeSourcePng(Buffer.from('rescue'), {
      maxBytes: 100,
      dimensions: { width: 33, height: 33 },
      encode: script.encode,
      oxipng: (png) => {
        oxipngInputs.push(png);
        if (oxipngInputs.length === 1) {
          return Promise.resolve(png);
        }
        return Promise.resolve(rescued);
      },
    });
    assert.equal(result, rescued);
    assert.equal(script.requests.length, 8);
    assert.equal(oxipngInputs.length, 2);
    assert.equal(oxipngInputs[1]?.length, 120);

    const equalScript = scriptedEncoder([100, 100, 100, 100]);
    const equalOxipng: Buffer[] = [];
    await assert.rejects(
      () =>
        optimizeSourcePng(Buffer.from('equal'), {
          maxBytes: 50,
          dimensions: { width: 16, height: 16 },
          encode: equalScript.encode,
          oxipng: (png) => {
            equalOxipng.push(png);
            return Promise.resolve(Buffer.alloc(png.length + 5, 2));
          },
        }),
      /Optimized image is 100 bytes and exceeds the 50-byte limit/,
    );
    assert.equal(equalOxipng[1], equalScript.outputs[0]);

    const initialSmaller = scriptedEncoder([200, 180, 170, 160]);
    const initialOxipng = Buffer.alloc(90, 5);
    const rescueInputs: Buffer[] = [];
    const initialRescued = await optimizeSourcePng(
      Buffer.from('initial-small'),
      {
        maxBytes: 40,
        dimensions: { width: 16, height: 16 },
        encode: initialSmaller.encode,
        oxipng: (png) => {
          rescueInputs.push(png);
          if (rescueInputs.length === 1) {
            return Promise.resolve(initialOxipng);
          }
          return Promise.resolve(Buffer.alloc(30, 1));
        },
      },
    );
    assert.equal(initialRescued.length, 30);
    assert.equal(rescueInputs[1], initialOxipng);
  });

  test('a larger final oxipng result is ignored', async () => {
    const script = scriptedEncoder([80]);
    const result = await optimizeSourcePng(Buffer.from('larger'), {
      maxBytes: 100,
      dimensions: { width: 20, height: 20 },
      encode: script.encode,
      oxipng: () => Promise.resolve(Buffer.alloc(95, 3)),
    });
    assert.equal(result, script.outputs[0]);

    const exhausted = scriptedEncoder([120, 110, 100, 130]);
    await assert.rejects(
      () =>
        optimizeSourcePng(Buffer.from('larger-rescue'), {
          maxBytes: 50,
          dimensions: { width: 16, height: 16 },
          encode: exhausted.encode,
          oxipng: (png) => Promise.resolve(Buffer.alloc(png.length + 25, 4)),
        }),
      /Optimized image is 100 bytes and exceeds the 50-byte limit/,
    );
  });

  test('oxipng rejection falls back to its input', async () => {
    const underCap = scriptedEncoder([40]);
    const kept = await optimizeSourcePng(Buffer.from('oxipng-fail'), {
      maxBytes: 100,
      dimensions: { width: 20, height: 20 },
      encode: underCap.encode,
      oxipng: () => Promise.reject(new Error('wasm init failed')),
    });
    assert.equal(kept, underCap.outputs[0]);

    const overCap = scriptedEncoder([90, 80, 70, 60]);
    await assert.rejects(
      () =>
        optimizeSourcePng(Buffer.from('oxipng-fail-over'), {
          maxBytes: 30,
          dimensions: { width: 16, height: 16 },
          encode: overCap.encode,
          oxipng: () => Promise.reject(new Error('optimize failed')),
        }),
      /Optimized image is 60 bytes and exceeds the 30-byte limit/,
    );
  });

  test('encode rejection propagates without a storage-sized fallback', async () => {
    await assert.rejects(
      () =>
        optimizeSourcePng(Buffer.from('bad-encode'), {
          dimensions: { width: 8, height: 8 },
          encode: () => Promise.reject(new Error('decode failed')),
          oxipng: (png) => Promise.resolve(png),
        }),
      /decode failed/,
    );
  });

  test('worst case is 28 encodes and 2 oxipng calls from the original baseline', async () => {
    const input = Buffer.from('original-upload');
    const script = scriptedEncoder(Array.from({ length: 28 }, () => 64));
    const oxipngInputs: Buffer[] = [];
    const seenSources: Buffer[] = [];
    const shrunkInitial = Buffer.alloc(48, 7);
    await assert.rejects(
      () =>
        optimizeSourcePng(input, {
          maxBytes: 1,
          dimensions: { width: 200, height: 200 },
          encode: (request) => {
            seenSources.push(request.source);
            return script.encode(request);
          },
          oxipng: (png) => {
            oxipngInputs.push(png);
            if (oxipngInputs.length === 1) {
              return Promise.resolve(shrunkInitial);
            }
            return Promise.resolve(png);
          },
        }),
      /Optimized image is 48 bytes and exceeds the 1-byte limit/,
    );

    assert.equal(script.requests.length, 28);
    assert.equal(oxipngInputs.length, 2);
    assert.equal(seenSources[0], input);
    const baseline = script.outputs[0];
    assert.ok(baseline !== undefined);
    for (const source of seenSources.slice(1)) {
      assert.equal(source, baseline);
    }
    for (const output of script.outputs.slice(1)) {
      assert.notEqual(seenSources[1], output);
    }
    assert.notEqual(seenSources[1], shrunkInitial);
    assert.equal(oxipngInputs[1], shrunkInitial);

    const nativeFullColor = script.requests.filter(
      (request) => request.mode === 'full-color' && request.resize === false,
    );
    assert.equal(nativeFullColor.length, 1);
    assert.equal(script.requests[4]?.mode, 'full-color');
    assert.equal(script.requests[4]?.resize, true);
    assert.equal(script.requests[4]?.width, 150);
    assert.equal(script.requests[4]?.height, 150);
    assert.deepEqual(
      script.requests
        .slice(1, 4)
        .map((request) => (request.mode === 'palette' ? request.quality : 0)),
      [90, 65, 40],
    );

    const pairs: string[] = [];
    for (const request of script.requests) {
      const key = dimensionKey(request.width, request.height);
      if (pairs[pairs.length - 1] !== key) {
        pairs.push(key);
      }
    }
    assert.deepEqual(
      pairs,
      sourcePngDimensionSchedule(200, 200).map((size) =>
        dimensionKey(size.width, size.height),
      ),
    );
    assert.equal(new Set(pairs).size, pairs.length);
  });

  test('huge metadata dimensions do not allocate a huge image', async () => {
    const input = Buffer.from('tiny');
    const script = scriptedEncoder([8]);
    let largestOutput = 0;
    await assert.rejects(
      () =>
        optimizeSourcePng(input, {
          maxBytes: 1,
          dimensions: { width: 100_000, height: 80_000 },
          encode: async (request) => {
            const output = await script.encode(request);
            largestOutput = Math.max(largestOutput, output.length);
            return output;
          },
          oxipng: (png) => Promise.resolve(png),
        }),
      /exceeds the 1-byte limit/,
    );

    assert.equal(input.length, 4);
    assert.equal(largestOutput, 8);
    assert.equal(script.requests.length <= 28, true);
    const widths = new Set(script.requests.map((request) => request.width));
    assert.equal(widths.has(100_000), true);
    assert.equal(
      script.requests.length,
      1 + 3 + (sourcePngDimensionSchedule(100_000, 80_000).length - 1) * 4,
    );
  });
});

describe('storage boundary', () => {
  test('success stores, finalizes, then deletes the source', async () => {
    const output = Buffer.from('optimized-png');
    const calls: StorageCall[] = [];
    let storedType = '';
    let storedBytes = Buffer.alloc(0);
    const result = await storeOptimizedSourceImage<string>({
      sourceStorageId: 'source-id',
      load: () => Promise.resolve(new Blob([Buffer.from('upload')])),
      optimize: (input) => {
        assert.equal(input.equals(Buffer.from('upload')), true);
        return Promise.resolve(output);
      },
      store: async (blob) => {
        calls.push('store');
        storedType = blob.type;
        storedBytes = Buffer.from(await blob.arrayBuffer());
        return 'stored-id';
      },
      finalize: (payload) => {
        calls.push('finalize');
        assert.equal(payload.candidateStorageId, 'stored-id');
        assert.equal(payload.contentHash, sha256Hex(output));
        return Promise.resolve('deduped-id');
      },
      deleteSource: (sourceStorageId) => {
        calls.push('delete');
        assert.equal(sourceStorageId, 'source-id');
        return Promise.resolve();
      },
    });

    assert.equal(result, 'deduped-id');
    assert.deepEqual(calls, ['store', 'finalize', 'delete']);
    assert.equal(storedType, 'image/png');
    assert.equal(storedBytes.equals(output), true);
  });

  test('optimization failure does not store, finalize, or delete', async () => {
    const rejectedCalls: string[] = [];
    await assert.rejects(
      () =>
        storeOptimizedSourceImage<string>({
          sourceStorageId: 'source-id',
          load: () => Promise.resolve(new Blob([Buffer.from('upload')])),
          optimize: () =>
            Promise.reject(
              new Error(
                'Optimized image is 90 bytes and exceeds the 30-byte limit',
              ),
            ),
          store: () => {
            rejectedCalls.push('store');
            return Promise.resolve('stored-id');
          },
          finalize: () => {
            rejectedCalls.push('finalize');
            return Promise.resolve('deduped-id');
          },
          deleteSource: () => {
            rejectedCalls.push('delete');
            return Promise.resolve();
          },
        }),
      /Failed to optimize image: Optimized image is 90 bytes and exceeds the 30-byte limit/,
    );
    assert.deepEqual(rejectedCalls, []);

    const missingCalls: string[] = [];
    await assert.rejects(
      () =>
        storeOptimizedSourceImage<string>({
          sourceStorageId: 'missing',
          load: () => Promise.resolve(null),
          optimize: () => {
            missingCalls.push('optimize');
            return Promise.resolve(Buffer.from('nope'));
          },
          store: () => {
            missingCalls.push('store');
            return Promise.resolve('stored-id');
          },
          finalize: () => {
            missingCalls.push('finalize');
            return Promise.resolve('deduped-id');
          },
          deleteSource: () => {
            missingCalls.push('delete');
            return Promise.resolve();
          },
        }),
      /Source image not found in storage/,
    );
    assert.deepEqual(missingCalls, []);
  });

  test('native decode failure is wrapped and leaves storage untouched', async () => {
    let rawMessage = '';
    await assert.rejects(
      () => optimizeSourcePng(Buffer.from('not-an-image')),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        rawMessage = error.message;
        return true;
      },
    );
    assert.equal(rawMessage.includes('Failed to optimize image'), false);

    const calls: string[] = [];
    await assert.rejects(
      () =>
        storeOptimizedSourceImage<string>({
          sourceStorageId: 'source-id',
          load: () => Promise.resolve(new Blob([Buffer.from('not-an-image')])),
          optimize: (input) => optimizeSourcePng(input),
          store: () => {
            calls.push('store');
            return Promise.resolve('stored-id');
          },
          finalize: () => {
            calls.push('finalize');
            return Promise.resolve('deduped-id');
          },
          deleteSource: () => {
            calls.push('delete');
            return Promise.resolve();
          },
        }),
      new Error(`Failed to optimize image: ${rawMessage}`),
    );
    assert.deepEqual(calls, []);
  });
});

describe('real Sharp fidelity', () => {
  test('full-color encode keeps palette off and palette encode uses effort 7', async () => {
    const width = 24;
    const height = 24;
    const raw = artworkRaw(width, height);
    assert.ok(countVisibleColors(raw) > 256);
    const source = await pngFromRgba(raw, width, height);

    const fullColor = await encodeSourcePng({
      source,
      width,
      height,
      resize: false,
      mode: 'full-color',
    });
    const directFullColor = await sharp(source, { failOn: 'none' })
      .png({
        palette: false,
        compressionLevel: 9,
        adaptiveFiltering: true,
      })
      .toBuffer();
    const implicitPalette = await sharp(source, { failOn: 'none' })
      .png({
        compressionLevel: 9,
        adaptiveFiltering: true,
        effort: 10,
      })
      .toBuffer();
    assert.equal(fullColor.equals(directFullColor), true);
    assert.equal(fullColor.equals(implicitPalette), false);
    const fullDecoded = await decodeRgba(fullColor);
    assert.equal(fullDecoded.isPalette, false);
    assert.equal(fullDecoded.data.equals(raw), true);

    const gradient = Buffer.alloc(128 * 128 * 4);
    for (let y = 0; y < 128; y += 1) {
      for (let x = 0; x < 128; x += 1) {
        writeRgba(
          gradient,
          128,
          x,
          y,
          Math.floor((x * 255) / 127),
          Math.floor((y * 255) / 127),
          (x * 3 + y * 5) & 255,
          255,
        );
      }
    }
    const gradientPng = await pngFromRgba(gradient, 128, 128);
    const palette = await encodeSourcePng({
      source: gradientPng,
      width: 128,
      height: 128,
      resize: false,
      mode: 'palette',
      quality: 90,
      colors: 256,
      effort: 7,
    });
    const effort7 = await sharp(gradientPng, { failOn: 'none' })
      .png({ palette: true, quality: 90, colors: 256, effort: 7 })
      .toBuffer();
    const effort10 = await sharp(gradientPng, { failOn: 'none' })
      .png({ palette: true, quality: 90, colors: 256, effort: 10 })
      .toBuffer();
    assert.equal(palette.equals(effort7), true);
    assert.equal(palette.equals(effort10), false);
    assert.equal((await decodeRgba(palette)).isPalette, true);

    const resized = await encodeSourcePng({
      source,
      width: 12,
      height: 12,
      resize: true,
      mode: 'full-color',
    });
    const resizedMeta = await sharp(resized).metadata();
    assert.equal(resizedMeta.width, 12);
    assert.equal(resizedMeta.height, 12);
    assert.equal(resizedMeta.isPalette, false);
  });

  test('native full-color pixels survive the initial encode and lossless oxipng', async () => {
    const width = 24;
    const height = 24;
    const raw = artworkRaw(width, height);
    const input = await pngFromRgba(raw, width, height);
    const requests: SourcePngEncodeRequest[] = [];
    const beforeOxipng = await optimizeSourcePng(input, {
      encode: async (request) => {
        requests.push(request);
        return encodeSourcePng(request);
      },
      oxipng: (png) => Promise.resolve(png),
    });
    const decodedBefore = await decodeRgba(beforeOxipng);
    assert.equal(requests.length, 1);
    assert.equal(requests[0]?.mode, 'full-color');
    assert.equal(requests[0]?.resize, false);
    assert.equal(decodedBefore.isPalette, false);
    assert.equal(decodedBefore.width, width);
    assert.equal(decodedBefore.height, height);
    assert.equal(decodedBefore.data.equals(raw), true);
    assert.equal(pngSignature(beforeOxipng), true);

    const afterOxipng = await optimizeSourcePng(input);
    const decodedAfter = await decodeRgba(afterOxipng);
    assert.equal(decodedAfter.width, width);
    assert.equal(decodedAfter.height, height);
    assert.equal(decodedAfter.isPalette, false);
    assert.equal(decodedAfter.data.length, raw.length);
    for (let offset = 0; offset < raw.length; offset += 4) {
      assert.equal(
        decodedAfter.data.readUInt8(offset + 3),
        raw.readUInt8(offset + 3),
      );
      if (raw.readUInt8(offset + 3) === 0) {
        continue;
      }
      assert.equal(decodedAfter.data.readUInt8(offset), raw.readUInt8(offset));
      assert.equal(
        decodedAfter.data.readUInt8(offset + 1),
        raw.readUInt8(offset + 1),
      );
      assert.equal(
        decodedAfter.data.readUInt8(offset + 2),
        raw.readUInt8(offset + 2),
      );
    }
  });

  test('jpeg and the first gif frame stay full color at native size', async () => {
    const width = 16;
    const height = 16;
    const rgb = Buffer.alloc(width * height * 3);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const offset = (y * width + x) * 3;
        rgb.writeUInt8((x * 20) & 255, offset);
        rgb.writeUInt8((y * 15) & 255, offset + 1);
        rgb.writeUInt8(40, offset + 2);
      }
    }
    const jpeg = await sharp(rgb, { raw: { width, height, channels: 3 } })
      .jpeg({ quality: 80 })
      .toBuffer();
    const expectedJpeg = await sharp(jpeg).ensureAlpha().raw().toBuffer();
    const jpegOutput = await optimizeSourcePng(jpeg);
    const decodedJpeg = await decodeRgba(jpegOutput);
    assert.equal(decodedJpeg.width, width);
    assert.equal(decodedJpeg.height, height);
    assert.equal(decodedJpeg.isPalette, false);
    assert.equal(pngSignature(jpegOutput), true);
    assert.equal(decodedJpeg.data.equals(expectedJpeg), true);

    const red = await sharp({
      create: {
        width: 8,
        height: 8,
        channels: 3,
        background: { r: 200, g: 10, b: 10 },
      },
    })
      .png()
      .toBuffer();
    const blue = await sharp({
      create: {
        width: 8,
        height: 8,
        channels: 3,
        background: { r: 10, g: 10, b: 220 },
      },
    })
      .png()
      .toBuffer();
    const gif = await sharp([red, blue], { join: { animated: true } })
      .gif()
      .toBuffer();
    const gifOutput = await optimizeSourcePng(gif, {
      oxipng: (png) => Promise.resolve(png),
    });
    const decodedGif = await decodeRgba(gifOutput);
    assert.equal(decodedGif.width, 8);
    assert.equal(decodedGif.height, 8);
    assert.equal(decodedGif.data.length, 8 * 8 * 4);
    for (let offset = 0; offset < decodedGif.data.length; offset += 4) {
      assert.equal(decodedGif.data.readUInt8(offset), 200);
      assert.equal(decodedGif.data.readUInt8(offset + 1), 10);
      assert.equal(decodedGif.data.readUInt8(offset + 2), 10);
      assert.equal(decodedGif.data.readUInt8(offset + 3), 255);
    }
  });

  test('fallback output stays inside an injected cap and keeps transparency', async () => {
    assert.equal(MAX_SOURCE_STORAGE_BYTES, 2_097_152);
    const size = 96;
    const input = await pngFromRgba(entropyRaw(size), size, size);
    const requests: SourcePngEncodeRequest[] = [];
    const cap = 8000;
    const output = await optimizeSourcePng(input, {
      maxBytes: cap,
      encode: async (request) => {
        requests.push(request);
        return encodeSourcePng(request);
      },
    });
    const decoded = await decodeRgba(output);

    assert.equal(pngSignature(output), true);
    assert.ok(output.length <= cap);
    assert.ok(output.length <= MAX_SOURCE_STORAGE_BYTES);
    assert.equal(decoded.width, 72);
    assert.equal(decoded.height, 72);
    assert.equal(requests.length, 6);
    assert.equal(requests[0]?.mode, 'full-color');
    assert.equal(requests[0]?.resize, false);
    assert.equal(requests[5]?.mode, 'palette');
    assert.equal(requests[5]?.resize, true);
    if (requests[5]?.mode === 'palette') {
      assert.equal(requests[5].quality, 90);
      assert.equal(requests[5].colors, 256);
      assert.equal(requests[5].effort, 7);
    }

    let transparent = 0;
    let partial = 0;
    let opaque = 0;
    for (let offset = 3; offset < decoded.data.length; offset += 4) {
      const alpha = decoded.data.readUInt8(offset);
      if (alpha === 0) {
        transparent += 1;
      } else if (alpha === 255) {
        opaque += 1;
      } else {
        partial += 1;
      }
    }
    assert.ok(transparent > 0);
    assert.ok(partial > 0);
    assert.ok(opaque > 0);
  });
});
