'use node';

import { v } from 'convex/values';
import sharp from 'sharp';

import type { Id } from './_generated/dataModel';
import { action } from './_generated/server';

/**
 * Threshold (3 MiB): at or below this size, JPEG/WebP pass through unchanged and
 * PNG-like inputs get lossless recompression only. Above this size, aggressive
 * optimization runs until output fits under this cap (or best effort).
 */
const MAX_SOURCE_STORAGE_BYTES = 3 * 1024 * 1024;

const INITIAL_QUALITY = 85;
const MIN_QUALITY = 50;
const QUALITY_STEP = 5;
const SCALE_FACTOR_PER_STEP = 0.9;
const MIN_DIMENSION = 32;

function normalizeImageMimeType(mimeType: string): string {
  const raw = mimeType.split(';')[0]?.trim().toLowerCase() ?? '';
  if (raw === 'image/jpg') {
    return 'image/jpeg';
  }
  if (raw !== '') {
    return raw;
  }
  return 'image/png';
}

/** Lossless PNG recompress via Sharp only (no external binaries — Convex cannot execute oxipng). */
async function pngBufferWithMaxSharpCompression(
  input: Buffer,
): Promise<Buffer> {
  return await sharp(input)
    .png({
      compressionLevel: 9,
      adaptiveFiltering: true,
      effort: 10,
    })
    .toBuffer();
}

async function optimizePngBufferLossless(input: Buffer): Promise<Buffer> {
  const squeezed = await pngBufferWithMaxSharpCompression(input);
  return squeezed.length < input.length ? squeezed : input;
}

async function optimizeJpegBufferUnderMaxBytes(
  input: Buffer,
  maxBytes: number,
): Promise<Buffer> {
  let bestBuffer: Buffer = input;
  let bestSize = input.length;

  let scale = 1;
  const meta = await sharp(input).metadata();
  const baseWidth = meta.width ?? 1;
  const baseHeight = meta.height ?? 1;

  while (true) {
    const targetWidth = Math.max(1, Math.round(baseWidth * scale));
    const targetHeight = Math.max(1, Math.round(baseHeight * scale));
    if (Math.min(targetWidth, targetHeight) < MIN_DIMENSION) {
      break;
    }

    for (
      let quality = INITIAL_QUALITY;
      quality >= MIN_QUALITY;
      quality -= QUALITY_STEP
    ) {
      const out = await sharp(input)
        .resize(targetWidth, targetHeight, { fit: 'fill' })
        .jpeg({ mozjpeg: true, quality })
        .toBuffer();
      if (out.length < bestSize) {
        bestSize = out.length;
        bestBuffer = out;
      }
      if (out.length <= maxBytes) {
        return out;
      }
    }

    scale *= SCALE_FACTOR_PER_STEP;
  }

  return bestBuffer;
}

async function optimizeWebpBufferUnderMaxBytes(
  input: Buffer,
  maxBytes: number,
): Promise<Buffer> {
  let bestBuffer: Buffer = input;
  let bestSize = input.length;

  let scale = 1;
  const meta = await sharp(input).metadata();
  const baseWidth = meta.width ?? 1;
  const baseHeight = meta.height ?? 1;

  while (true) {
    const targetWidth = Math.max(1, Math.round(baseWidth * scale));
    const targetHeight = Math.max(1, Math.round(baseHeight * scale));
    if (Math.min(targetWidth, targetHeight) < MIN_DIMENSION) {
      break;
    }

    for (
      let quality = INITIAL_QUALITY;
      quality >= MIN_QUALITY;
      quality -= QUALITY_STEP
    ) {
      const out = await sharp(input)
        .resize(targetWidth, targetHeight, { fit: 'fill' })
        .webp({ quality })
        .toBuffer();
      if (out.length < bestSize) {
        bestSize = out.length;
        bestBuffer = out;
      }
      if (out.length <= maxBytes) {
        return out;
      }
    }

    scale *= SCALE_FACTOR_PER_STEP;
  }

  return bestBuffer;
}

async function optimizePngBufferUnderMaxBytes(
  input: Buffer,
  maxBytes: number,
): Promise<Buffer> {
  let bestBuffer: Buffer = input;
  let bestSize = input.length;

  let scale = 1;
  const meta = await sharp(input).metadata();
  const baseWidth = meta.width ?? 1;
  const baseHeight = meta.height ?? 1;

  while (true) {
    const targetWidth = Math.max(1, Math.round(baseWidth * scale));
    const targetHeight = Math.max(1, Math.round(baseHeight * scale));
    if (Math.min(targetWidth, targetHeight) < MIN_DIMENSION) {
      break;
    }

    const out = await sharp(input)
      .resize(targetWidth, targetHeight, { fit: 'fill' })
      .png({
        compressionLevel: 9,
        adaptiveFiltering: true,
        effort: 10,
      })
      .toBuffer();
    if (out.length < bestSize) {
      bestSize = out.length;
      bestBuffer = out;
    }
    if (out.length <= maxBytes) {
      return out;
    }

    scale *= SCALE_FACTOR_PER_STEP;
  }

  return bestBuffer;
}

async function optimizeImageBufferUnderMaxBytes(
  input: Buffer,
  normalizedMime: string,
  maxBytes: number,
): Promise<Buffer> {
  if (normalizedMime === 'image/jpeg') {
    return await optimizeJpegBufferUnderMaxBytes(input, maxBytes);
  }
  if (normalizedMime === 'image/webp') {
    return await optimizeWebpBufferUnderMaxBytes(input, maxBytes);
  }
  if (normalizedMime === 'image/png') {
    return await optimizePngBufferUnderMaxBytes(input, maxBytes);
  }
  return await optimizePngBufferUnderMaxBytes(input, maxBytes);
}

export const optimizeSourceImage = action({
  args: {
    sourceStorageId: v.id('_storage'),
    mimeType: v.string(),
  },
  returns: v.id('_storage'),
  handler: async (ctx, args): Promise<Id<'_storage'>> => {
    const blob = await ctx.storage.get(args.sourceStorageId);
    if (blob === null) {
      throw new Error('Source image not found in storage');
    }

    const input = Buffer.from(await blob.arrayBuffer());
    const normalizedMime = normalizeImageMimeType(args.mimeType);

    if (input.length <= MAX_SOURCE_STORAGE_BYTES) {
      if (normalizedMime === 'image/jpeg' || normalizedMime === 'image/webp') {
        return args.sourceStorageId;
      }

      let outputBuffer: Buffer;
      try {
        outputBuffer = await optimizePngBufferLossless(input);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to optimize image: ${message}`);
      }

      const outBlob = new Blob([new Uint8Array(outputBuffer)], {
        type: normalizedMime,
      });
      const newStorageId = await ctx.storage.store(outBlob);
      await ctx.storage.delete(args.sourceStorageId);
      return newStorageId;
    }

    let outputBuffer: Buffer;
    try {
      outputBuffer = await optimizeImageBufferUnderMaxBytes(
        input,
        normalizedMime,
        MAX_SOURCE_STORAGE_BYTES,
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to optimize image: ${message}`);
    }

    const outBlob = new Blob([new Uint8Array(outputBuffer)], {
      type: normalizedMime,
    });

    const newStorageId = await ctx.storage.store(outBlob);
    await ctx.storage.delete(args.sourceStorageId);
    return newStorageId;
  },
});
