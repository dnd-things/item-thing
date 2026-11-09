'use node';

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import optimise, { init as initOxipngWasm } from '@jsquash/oxipng/optimise.js';
import sharp from 'sharp';

export const MAX_SOURCE_STORAGE_BYTES = 2 * 1024 * 1024;

const MIN_SHORTEST_EDGE = 32;
const MAX_SCALE_STEPS = 5;
const PALETTE_EFFORT = 7;
const PALETTE_COLORS = 256;
const PALETTE_QUALITIES = [90, 65, 40] as const;
const OUTPUT_MIME_TYPE = 'image/png';

const OXIPNG_OPTIONS = {
  level: 4 as const,
  interlace: false,
  optimiseAlpha: true,
};

type Dimensions = {
  width: number;
  height: number;
};

type FullColorEncodeRequest = {
  source: Buffer;
  width: number;
  height: number;
  resize: boolean;
  mode: 'full-color';
};

type PaletteEncodeRequest = {
  source: Buffer;
  width: number;
  height: number;
  resize: boolean;
  mode: 'palette';
  quality: number;
  colors: number;
  effort: number;
};

export type SourcePngEncodeRequest =
  | FullColorEncodeRequest
  | PaletteEncodeRequest;

export type OptimizeSourcePngOptions = {
  maxBytes?: number;
  dimensions?: Dimensions;
  encode?: (request: SourcePngEncodeRequest) => Promise<Buffer>;
  oxipng?: (png: Buffer) => Promise<Buffer>;
};

function sha256HexOfBuffer(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

function bufferToArrayBuffer(buffer: Buffer): ArrayBuffer {
  const copy = new Uint8Array(buffer.length);
  copy.set(buffer);
  return copy.buffer;
}

let oxipngWasmInitPromise: Promise<void> | undefined;

async function ensureOxipngWasmLoaded(): Promise<void> {
  if (oxipngWasmInitPromise === undefined) {
    oxipngWasmInitPromise = (async () => {
      const require = createRequire(import.meta.url);
      const packageJsonPath = require.resolve('@jsquash/oxipng/package.json');
      const wasmPath = join(
        dirname(packageJsonPath),
        'codec/pkg/squoosh_oxipng_bg.wasm',
      );
      const wasmBytes = readFileSync(wasmPath);
      await initOxipngWasm(wasmBytes);
    })();
  }
  await oxipngWasmInitPromise;
}

async function oxipngBytes(png: Buffer): Promise<Buffer> {
  await ensureOxipngWasmLoaded();
  const optimized = await optimise(bufferToArrayBuffer(png), OXIPNG_OPTIONS);
  return Buffer.from(optimized);
}

function scaleEdge(
  length: number,
  numerator: number,
  denominator: number,
): number {
  return Math.max(1, Math.round((length * numerator) / denominator));
}

function pushDistinct(
  sizes: Dimensions[],
  width: number,
  height: number,
  native: Dimensions,
): void {
  if (width > native.width || height > native.height) {
    return;
  }
  const duplicate = sizes.some(
    (size) => size.width === width && size.height === height,
  );
  if (duplicate) {
    return;
  }
  sizes.push({ width, height });
}

export function sourcePngDimensionSchedule(
  width: number,
  height: number,
): Dimensions[] {
  const native = { width, height };
  const sizes: Dimensions[] = [native];
  const shortest = Math.min(width, height);
  if (shortest <= MIN_SHORTEST_EDGE) {
    return sizes;
  }

  for (let step = 1; step <= MAX_SCALE_STEPS; step += 1) {
    const scaledWidth = scaleEdge(width, 3 ** step, 4 ** step);
    const scaledHeight = scaleEdge(height, 3 ** step, 4 ** step);
    if (Math.min(scaledWidth, scaledHeight) < MIN_SHORTEST_EDGE) {
      break;
    }
    pushDistinct(sizes, scaledWidth, scaledHeight, native);
  }

  pushDistinct(
    sizes,
    scaleEdge(width, MIN_SHORTEST_EDGE, shortest),
    scaleEdge(height, MIN_SHORTEST_EDGE, shortest),
    native,
  );
  return sizes;
}

async function readDimensions(input: Buffer): Promise<Dimensions> {
  const metadata = await sharp(input, { failOn: 'none' }).metadata();
  if (
    metadata.width === undefined ||
    metadata.height === undefined ||
    metadata.width < 1 ||
    metadata.height < 1
  ) {
    throw new Error('Source image has no dimensions');
  }
  return { width: metadata.width, height: metadata.height };
}

function fullColorRequest(
  source: Buffer,
  size: Dimensions,
  resize: boolean,
): FullColorEncodeRequest {
  return {
    source,
    width: size.width,
    height: size.height,
    resize,
    mode: 'full-color',
  };
}

export async function encodeSourcePng(
  request: SourcePngEncodeRequest,
): Promise<Buffer> {
  let pipeline = sharp(request.source, { failOn: 'none' });
  if (request.resize) {
    pipeline = pipeline.resize(request.width, request.height, {
      fit: 'fill',
    });
  }

  if (request.mode === 'palette') {
    return await pipeline
      .png({
        palette: true,
        quality: request.quality,
        colors: request.colors,
        effort: request.effort,
      })
      .toBuffer();
  }

  return await pipeline
    .png({
      palette: false,
      compressionLevel: 9,
      adaptiveFiltering: true,
    })
    .toBuffer();
}

async function applyOxipng(
  png: Buffer,
  oxipng: (png: Buffer) => Promise<Buffer>,
): Promise<Buffer> {
  try {
    const optimized = await oxipng(png);
    if (optimized.length < png.length) {
      return optimized;
    }
    return png;
  } catch {
    return png;
  }
}

export async function optimizeSourcePng(
  input: Buffer,
  options?: OptimizeSourcePngOptions,
): Promise<Buffer> {
  const maxBytes = options?.maxBytes ?? MAX_SOURCE_STORAGE_BYTES;
  const encode = options?.encode ?? encodeSourcePng;
  const oxipng = options?.oxipng ?? oxipngBytes;
  const dimensions = options?.dimensions ?? (await readDimensions(input));
  if (dimensions.width < 1 || dimensions.height < 1) {
    throw new Error('Source image has no dimensions');
  }

  const sizes = sourcePngDimensionSchedule(dimensions.width, dimensions.height);
  const native = sizes[0];
  if (native === undefined) {
    throw new Error('Source image has no dimensions');
  }

  const baseline = await encode(fullColorRequest(input, native, false));
  let smallest = baseline;
  const initial = await applyOxipng(baseline, oxipng);
  if (initial.length < smallest.length) {
    smallest = initial;
  }
  if (initial.length <= maxBytes) {
    return initial;
  }

  const acceptCandidate = async (
    encoded: Buffer,
  ): Promise<Buffer | undefined> => {
    if (encoded.length < smallest.length) {
      smallest = encoded;
    }
    if (encoded.length > maxBytes) {
      return undefined;
    }
    const optimized = await applyOxipng(encoded, oxipng);
    if (optimized.length < encoded.length) {
      return optimized;
    }
    return encoded;
  };

  for (const [index, size] of sizes.entries()) {
    const resize = index > 0;
    if (resize) {
      const accepted = await acceptCandidate(
        await encode(fullColorRequest(baseline, size, true)),
      );
      if (accepted !== undefined) {
        return accepted;
      }
    }

    for (const quality of PALETTE_QUALITIES) {
      const accepted = await acceptCandidate(
        await encode({
          source: baseline,
          width: size.width,
          height: size.height,
          resize,
          mode: 'palette',
          quality,
          colors: PALETTE_COLORS,
          effort: PALETTE_EFFORT,
        }),
      );
      if (accepted !== undefined) {
        return accepted;
      }
    }
  }

  const rescued = await applyOxipng(smallest, oxipng);
  const chosen = rescued.length < smallest.length ? rescued : smallest;
  if (chosen.length <= maxBytes) {
    return chosen;
  }
  throw new Error(
    `Optimized image is ${chosen.length} bytes and exceeds the ${maxBytes}-byte limit`,
  );
}

export async function storeOptimizedSourceImage<
  TStorageId extends string,
>(args: {
  sourceStorageId: TStorageId;
  load: (sourceStorageId: TStorageId) => Promise<Blob | null>;
  optimize: (input: Buffer) => Promise<Buffer>;
  store: (blob: Blob) => Promise<TStorageId>;
  finalize: (input: {
    candidateStorageId: TStorageId;
    contentHash: string;
  }) => Promise<TStorageId>;
  deleteSource: (sourceStorageId: TStorageId) => Promise<void>;
}): Promise<TStorageId> {
  const source = await args.load(args.sourceStorageId);
  if (source === null) {
    throw new Error('Source image not found in storage');
  }

  const input = Buffer.from(await source.arrayBuffer());
  let outputBuffer: Buffer;
  try {
    outputBuffer = await args.optimize(input);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to optimize image: ${message}`);
  }

  const outBlob = new Blob([new Uint8Array(outputBuffer)], {
    type: OUTPUT_MIME_TYPE,
  });
  const contentHash = sha256HexOfBuffer(outputBuffer);
  const newStorageId = await args.store(outBlob);
  const dedupedStorageId = await args.finalize({
    candidateStorageId: newStorageId,
    contentHash,
  });
  await args.deleteSource(args.sourceStorageId);
  return dedupedStorageId;
}
