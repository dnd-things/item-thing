import sharp from 'sharp';
import { ArtworkLimitError } from '@/lib/artwork-limit-error';

import { findVisibleAlphaBoundsInBuffer } from './alpha-bounds.ts';
import { type IntegerCrop, identityCrop } from './geometry.ts';
import {
  artworkLimitCopy,
  SOURCE_MAX_EDGE_PX,
  SOURCE_MAX_PIXELS,
} from './limits.ts';
import type {
  ArtworkDisplayPreviewEncoder,
  ArtworkPixelReader,
} from './pixel-reader.ts';
import { prepareArtwork } from './prepare.ts';

export interface TrimTransparentBoundsResult {
  buffer: Buffer;
  mimeType: string;
  originalMimeType: string;
  width: number;
  height: number;
}

function getMimeTypeForFormat(format: string | undefined): string {
  const map: Record<string, string> = {
    avif: 'image/avif',
    gif: 'image/gif',
    heif: 'image/heif',
    jpeg: 'image/jpeg',
    jpg: 'image/jpeg',
    png: 'image/png',
    svg: 'image/svg+xml',
    tiff: 'image/tiff',
    webp: 'image/webp',
  };

  if (format !== undefined && map[format] !== undefined) {
    return map[format];
  }

  return 'image/png';
}

function assertAdmittedDimensions(width: number, height: number): void {
  if (
    width > SOURCE_MAX_EDGE_PX ||
    height > SOURCE_MAX_EDGE_PX ||
    width * height > SOURCE_MAX_PIXELS
  ) {
    throw new ArtworkLimitError(
      'source_dimensions',
      artworkLimitCopy.artworkTooLarge,
    );
  }
}

async function decodeSharpMetadata(input: Buffer) {
  try {
    return await sharp(input, {
      failOn: 'none',
      limitInputPixels: SOURCE_MAX_PIXELS,
    }).metadata();
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message.toLowerCase().includes('pixel')) {
      throw new ArtworkLimitError(
        'source_dimensions',
        artworkLimitCopy.artworkTooLarge,
      );
    }
    throw error instanceof Error
      ? error
      : new Error(artworkLimitCopy.artworkTooLarge);
  }
}

function buildSharpPixelReader(
  input: Buffer,
  hasAlpha: boolean,
): ArtworkPixelReader {
  return {
    async contentRectangle(_bytes, sourceWidth, sourceHeight) {
      if (!hasAlpha) {
        return identityCrop(sourceWidth, sourceHeight);
      }
      const image = sharp(input, {
        failOn: 'none',
        limitInputPixels: SOURCE_MAX_PIXELS,
      });
      const raw = await image.ensureAlpha().raw().toBuffer();
      const visible = findVisibleAlphaBoundsInBuffer(
        raw,
        sourceWidth,
        sourceHeight,
      );
      if (visible === null) {
        return identityCrop(sourceWidth, sourceHeight);
      }
      const { left, top, width, height } = visible;
      if (
        left === 0 &&
        top === 0 &&
        width === sourceWidth &&
        height === sourceHeight
      ) {
        return identityCrop(sourceWidth, sourceHeight);
      }
      return visible;
    },
  };
}

function buildSharpPreviewEncoder(
  input: Buffer,
  originalMimeType: string,
  hasAlpha: boolean,
): ArtworkDisplayPreviewEncoder {
  return {
    async displayPreview(
      _bytes,
      sourceWidth,
      sourceHeight,
      contentRectangle: IntegerCrop,
    ) {
      if (
        !hasAlpha ||
        (contentRectangle.left === 0 &&
          contentRectangle.top === 0 &&
          contentRectangle.width === sourceWidth &&
          contentRectangle.height === sourceHeight)
      ) {
        return {
          bytes: input,
          mimeType: originalMimeType,
          width: sourceWidth,
          height: sourceHeight,
        };
      }
      const { left, top, width, height } = contentRectangle;
      const trimmedBuffer = await sharp(input, {
        failOn: 'none',
        limitInputPixels: SOURCE_MAX_PIXELS,
      })
        .extract({ left, top, width, height })
        .png({
          palette: false,
          compressionLevel: 9,
          adaptiveFiltering: true,
        })
        .toBuffer();
      return {
        bytes: trimmedBuffer,
        mimeType: 'image/png',
        width,
        height,
      };
    },
  };
}

export async function prepareArtworkFromBuffer(
  input: Buffer,
): Promise<TrimTransparentBoundsResult> {
  const metadata = await decodeSharpMetadata(input);
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  const originalMimeType = getMimeTypeForFormat(metadata.format);

  if (width <= 0 || height <= 0) {
    throw new Error('Image dimensions are invalid.');
  }
  assertAdmittedDimensions(width, height);

  const hasAlpha = metadata.hasAlpha === true;
  const bytes = new Uint8Array(input);
  const prepared = await prepareArtwork(bytes, {
    decodeDimensions: async () => ({ width, height }),
    pixelReader: buildSharpPixelReader(input, hasAlpha),
    previewEncoder: buildSharpPreviewEncoder(input, originalMimeType, hasAlpha),
  });

  const previewBuffer =
    prepared.displayPreview instanceof Uint8Array
      ? Buffer.from(prepared.displayPreview)
      : Buffer.from(await prepared.displayPreview.arrayBuffer());

  const sameBuffer =
    previewBuffer.byteLength === input.byteLength &&
    previewBuffer.equals(input);

  return {
    buffer: sameBuffer ? input : previewBuffer,
    mimeType: prepared.displayPreviewMimeType,
    originalMimeType,
    width: prepared.displayWidth,
    height: prepared.displayHeight,
  };
}

export async function trimTransparentBounds(
  input: Buffer,
): Promise<TrimTransparentBoundsResult> {
  return prepareArtworkFromBuffer(input);
}
