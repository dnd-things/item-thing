import sharp from 'sharp';
import { ArtworkLimitError } from '@/lib/artwork-limit-error';

const MIN_VISIBLE_ALPHA = 8;
const RGBA_CHANNEL_COUNT = 4;
const MAX_ALPHA_TRIM_PIXELS = 16_777_216;
const MAX_ARTWORK_EDGE_PX = 4096;
const ARTWORK_TOO_LARGE =
  'Image is too large. Resize it to at most 4096px on each side and try again.';

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
    width > MAX_ARTWORK_EDGE_PX ||
    height > MAX_ARTWORK_EDGE_PX ||
    width * height > MAX_ALPHA_TRIM_PIXELS
  ) {
    throw new ArtworkLimitError('source_dimensions', ARTWORK_TOO_LARGE);
  }
}

export async function trimTransparentBounds(
  input: Buffer,
): Promise<TrimTransparentBoundsResult> {
  let metadata: sharp.Metadata;
  try {
    metadata = await sharp(input, {
      failOn: 'none',
      limitInputPixels: MAX_ALPHA_TRIM_PIXELS,
    }).metadata();
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message.toLowerCase().includes('pixel')) {
      throw new ArtworkLimitError('source_dimensions', ARTWORK_TOO_LARGE);
    }
    throw error instanceof Error ? error : new Error(ARTWORK_TOO_LARGE);
  }
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  const originalMimeType = getMimeTypeForFormat(metadata.format);

  if (width <= 0 || height <= 0) {
    throw new Error('Image dimensions are invalid.');
  }
  assertAdmittedDimensions(width, height);

  if (!metadata.hasAlpha) {
    return {
      buffer: input,
      mimeType: originalMimeType,
      originalMimeType,
      width,
      height,
    };
  }

  const image = sharp(input, {
    failOn: 'none',
    limitInputPixels: MAX_ALPHA_TRIM_PIXELS,
  });
  const raw = await image.ensureAlpha().raw().toBuffer();

  let left = width;
  let right = -1;
  let top = height;
  let bottom = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = raw[(y * width + x) * RGBA_CHANNEL_COUNT + 3];
      if (alpha === undefined || alpha < MIN_VISIBLE_ALPHA) {
        continue;
      }
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    }
  }

  if (right < left || bottom < top) {
    return {
      buffer: input,
      mimeType: originalMimeType,
      originalMimeType,
      width,
      height,
    };
  }

  const trimmedWidth = right - left + 1;
  const trimmedHeight = bottom - top + 1;

  if (
    left === 0 &&
    top === 0 &&
    trimmedWidth === width &&
    trimmedHeight === height
  ) {
    return {
      buffer: input,
      mimeType: originalMimeType,
      originalMimeType,
      width,
      height,
    };
  }

  const trimmedBuffer = await sharp(input, {
    failOn: 'none',
    limitInputPixels: MAX_ALPHA_TRIM_PIXELS,
  })
    .extract({
      left,
      top,
      width: trimmedWidth,
      height: trimmedHeight,
    })
    .png({
      // True-colour crop: Sharp quantizes to a palette when effort is set unless palette is explicit.
      palette: false,
      compressionLevel: 9,
      adaptiveFiltering: true,
    })
    .toBuffer();

  return {
    buffer: trimmedBuffer,
    mimeType: 'image/png',
    originalMimeType,
    width: trimmedWidth,
    height: trimmedHeight,
  };
}
