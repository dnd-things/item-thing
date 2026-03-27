'use node';

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import optimise, { init as initOxipngWasm } from '@jsquash/oxipng/optimise.js';
import { v } from 'convex/values';
import sharp from 'sharp';

import { internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { action } from './_generated/server';

/** Stored source images must fit under this size (best effort if impossible). */
const MAX_SOURCE_STORAGE_BYTES = 2 * 1024 * 1024;

const INITIAL_PALETTE_QUALITY = 90;
const MIN_PALETTE_QUALITY = 40;
const PALETTE_QUALITY_STEP = 5;
const SCALE_FACTOR_PER_STEP = 0.9;
const MIN_DIMENSION = 32;

/** Animated GIF is rasterized to a single PNG (first frame). */
const PALETTE_COLOR_STEPS = [256, 224, 192, 160, 128, 96, 64, 48, 32];

const OUTPUT_MIME_TYPE = 'image/png';

function sha256HexOfBuffer(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

const OXIPNG_OPTIONS = {
  level: 4 as const,
  interlace: false,
  optimiseAlpha: true,
};

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

async function decodeInputToPngSqueezed(input: Buffer): Promise<Buffer> {
  return await sharp(input, { failOn: 'none' })
    .png({
      compressionLevel: 9,
      adaptiveFiltering: true,
      effort: 10,
    })
    .toBuffer();
}

async function oxipngOrSmaller(png: Buffer): Promise<Buffer> {
  try {
    await ensureOxipngWasmLoaded();
    const optimized = await optimise(bufferToArrayBuffer(png), OXIPNG_OPTIONS);
    const out = Buffer.from(optimized);
    return out.length < png.length ? out : png;
  } catch {
    return png;
  }
}

async function optimizePngBufferUnderMaxBytes(
  input: Buffer,
  maxBytes: number,
): Promise<Buffer> {
  let bestBuffer: Buffer = input;
  let bestSize = input.length;

  const meta = await sharp(input).metadata();
  const baseWidth = meta.width ?? 1;
  const baseHeight = meta.height ?? 1;

  let scale = 1;

  while (true) {
    const targetWidth = Math.max(1, Math.round(baseWidth * scale));
    const targetHeight = Math.max(1, Math.round(baseHeight * scale));
    if (Math.min(targetWidth, targetHeight) < MIN_DIMENSION) {
      break;
    }

    const lossless = await sharp(input, { failOn: 'none' })
      .resize(targetWidth, targetHeight, { fit: 'fill' })
      .png({
        compressionLevel: 9,
        adaptiveFiltering: true,
        effort: 10,
      })
      .toBuffer();
    if (lossless.length < bestSize) {
      bestSize = lossless.length;
      bestBuffer = lossless;
    }
    if (lossless.length <= maxBytes) {
      return lossless;
    }

    for (
      let quality = INITIAL_PALETTE_QUALITY;
      quality >= MIN_PALETTE_QUALITY;
      quality -= PALETTE_QUALITY_STEP
    ) {
      for (const colors of PALETTE_COLOR_STEPS) {
        const lossy = await sharp(input, { failOn: 'none' })
          .resize(targetWidth, targetHeight, { fit: 'fill' })
          .png({
            palette: true,
            quality,
            colors,
            effort: 10,
          })
          .toBuffer();
        if (lossy.length < bestSize) {
          bestSize = lossy.length;
          bestBuffer = lossy;
        }
        if (lossy.length <= maxBytes) {
          return lossy;
        }
      }
    }

    scale *= SCALE_FACTOR_PER_STEP;
  }

  return bestBuffer;
}

async function runOptimizationPipeline(input: Buffer): Promise<Buffer> {
  const squeezed = await decodeInputToPngSqueezed(input);
  let current = await oxipngOrSmaller(squeezed);

  if (current.length <= MAX_SOURCE_STORAGE_BYTES) {
    return current;
  }

  current = await optimizePngBufferUnderMaxBytes(
    current,
    MAX_SOURCE_STORAGE_BYTES,
  );
  return await oxipngOrSmaller(current);
}

export const optimizeSourceImage = action({
  args: {
    sourceStorageId: v.id('_storage'),
    mimeType: v.string(),
  },
  returns: v.id('_storage'),
  handler: async (ctx, args): Promise<Id<'_storage'>> => {
    void args.mimeType;

    const blob = await ctx.storage.get(args.sourceStorageId);
    if (blob === null) {
      throw new Error('Source image not found in storage');
    }

    const input = Buffer.from(await blob.arrayBuffer());

    let outputBuffer: Buffer;
    try {
      outputBuffer = await runOptimizationPipeline(input);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to optimize image: ${message}`);
    }

    const outBlob = new Blob([new Uint8Array(outputBuffer)], {
      type: OUTPUT_MIME_TYPE,
    });
    const contentHash = sha256HexOfBuffer(outputBuffer);
    const newStorageId = await ctx.storage.store(outBlob);
    const dedupedStorageId = await ctx.runMutation(
      internal.storageContentHash.finalizeCandidateStorage,
      { candidateStorageId: newStorageId, contentHash },
    );
    await ctx.storage.delete(args.sourceStorageId);
    return dedupedStorageId;
  },
});
