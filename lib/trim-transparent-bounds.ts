import sharp from 'sharp';

const MIN_VISIBLE_ALPHA = 8;
const RGBA_CHANNEL_COUNT = 4;
const MAX_ALPHA_TRIM_PIXELS = 16_777_216;

export interface TrimTransparentBoundsResult {
  buffer: Buffer;
  mimeType: string;
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

export async function trimTransparentBounds(
  input: Buffer,
): Promise<TrimTransparentBoundsResult> {
  const image = sharp(input, { failOn: 'none' });
  const metadata = await image.metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;

  if (width <= 0 || height <= 0) {
    throw new Error('Image dimensions are invalid.');
  }

  if (!metadata.hasAlpha) {
    return {
      buffer: input,
      mimeType: getMimeTypeForFormat(metadata.format),
      width,
      height,
    };
  }

  if (width * height > MAX_ALPHA_TRIM_PIXELS) {
    throw new Error('Image is too large to inspect transparency safely.');
  }

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
      mimeType: getMimeTypeForFormat(metadata.format),
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
      mimeType: getMimeTypeForFormat(metadata.format),
      width,
      height,
    };
  }

  const trimmedBuffer = await sharp(input, { failOn: 'none' })
    .extract({
      left,
      top,
      width: trimmedWidth,
      height: trimmedHeight,
    })
    .png({
      compressionLevel: 9,
      adaptiveFiltering: true,
      effort: 10,
    })
    .toBuffer();

  return {
    buffer: trimmedBuffer,
    mimeType: 'image/png',
    width: trimmedWidth,
    height: trimmedHeight,
  };
}
