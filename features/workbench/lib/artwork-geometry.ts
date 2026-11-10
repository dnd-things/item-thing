import { ArtworkLimitError } from '@/lib/artwork-limit-error';

export const MIN_VISIBLE_ALPHA = 8;
export const INSPECTION_MAX_EDGE_PX = 2048;
export const INSPECTION_MAX_PIXELS = 4_194_304;
export const DISPLAY_MAX_EDGE_PX = 1024;
export const DISPLAY_MAX_PIXELS = 1_048_576;
export const SOURCE_MAX_BYTES = 32 * 1024 * 1024;
export const SOURCE_MAX_EDGE_PX = 4096;
export const SOURCE_MAX_PIXELS = 16_777_216;
export const EXPORT_TRANSFORM_MAX_EDGE_PX = 6144;
export const EXPORT_TRANSFORM_MAX_PIXELS = 37_748_736;
export const CARD_OUTPUT_MAX_EDGE_PX = 16384;
export const CARD_OUTPUT_MAX_PIXELS = 33_554_432;

export const artworkLimitCopy = {
  encodedBytes:
    'This image is over 32 MiB. Resize or compress it and try again.',
  dimensions:
    'This image is over 4096px or 16 megapixels. Resize it and try again.',
  invalidDimensions: 'Image dimensions are invalid.',
  displayEncode: 'Could not prepare a display preview for this image.',
  exportTransform:
    'Rotated artwork is over 6144px. Use a smaller image and try again.',
  cardOutput:
    'This card export is too large. Lower the scale or card size and try again.',
  cardUnmeasured: 'Card preview is not ready to export.',
  encodeFailed: 'Could not encode artwork.',
  sourceMismatch:
    'Saved artwork does not match its recorded size. Replace the image and try again.',
  savedTooLarge:
    'Saved artwork exceeds 4096px or 32 MiB. Replace the image to save and export it.',
  exportBusy: 'An export is already running.',
  artworkFailed: 'Could not prepare artwork for export.',
  missingSource:
    'This image has no exportable source. Replace it and try again.',
} as const;

export interface IntegerCrop {
  left: number;
  top: number;
  width: number;
  height: number;
}

export type ArtworkDrawPolicy = 'display' | 'export';

export interface PixelSize {
  width: number;
  height: number;
  scale: number;
}

export function isPositiveIntegerDimension(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

export function assertEncodedArtworkBytes(byteLength: number): void {
  if (!Number.isFinite(byteLength) || byteLength < 0) {
    throw new ArtworkLimitError('encoded_bytes', artworkLimitCopy.encodedBytes);
  }
  if (byteLength > SOURCE_MAX_BYTES) {
    throw new ArtworkLimitError('encoded_bytes', artworkLimitCopy.encodedBytes);
  }
}

export function dataUrlEncodedByteLength(dataUrl: string): number | null {
  const trimmed = dataUrl.trim();
  if (trimmed.slice(0, 5).toLowerCase() !== 'data:') {
    return null;
  }
  const commaIndex = trimmed.indexOf(',');
  if (commaIndex < 0) {
    return null;
  }
  const meta = trimmed.slice(5, commaIndex).toLowerCase();
  if (!meta.includes('base64')) {
    return null;
  }
  const payload = trimmed.slice(commaIndex + 1).replace(/\s/g, '');
  if (payload.length === 0) {
    return 0;
  }
  const padding = payload.endsWith('==') ? 2 : payload.endsWith('=') ? 1 : 0;
  return Math.floor((payload.length * 3) / 4) - padding;
}

export function assertDecodedArtworkDimensions(
  width: number,
  height: number,
): void {
  if (
    !isPositiveIntegerDimension(width) ||
    !isPositiveIntegerDimension(height)
  ) {
    throw new Error(artworkLimitCopy.invalidDimensions);
  }
  if (
    width > SOURCE_MAX_EDGE_PX ||
    height > SOURCE_MAX_EDGE_PX ||
    width * height > SOURCE_MAX_PIXELS
  ) {
    throw new ArtworkLimitError(
      'source_dimensions',
      artworkLimitCopy.dimensions,
    );
  }
}

export function fitsDisplayBudget(width: number, height: number): boolean {
  return (
    width > 0 &&
    height > 0 &&
    width <= DISPLAY_MAX_EDGE_PX &&
    height <= DISPLAY_MAX_EDGE_PX &&
    width * height <= DISPLAY_MAX_PIXELS
  );
}

export function fitInsideBudget(
  width: number,
  height: number,
  maxEdge: number,
  maxPixels: number,
  allowUpscale: boolean,
): PixelSize {
  if (width <= 0 || height <= 0) {
    throw new Error(artworkLimitCopy.invalidDimensions);
  }
  const longest = Math.max(width, height);
  const pixels = width * height;
  let scale = allowUpscale ? Number.POSITIVE_INFINITY : 1;
  scale = Math.min(scale, maxEdge / longest, Math.sqrt(maxPixels / pixels));
  if (!Number.isFinite(scale) || scale <= 0) {
    throw new Error(artworkLimitCopy.invalidDimensions);
  }
  if (scale > 1) {
    scale = 1;
  }
  const contain = (value: number) => Math.max(1, Math.ceil(value - 1e-9));
  let fittedWidth = contain(width * scale);
  let fittedHeight = contain(height * scale);
  for (let attempt = 0; attempt < 12; attempt += 1) {
    if (
      fittedWidth <= maxEdge &&
      fittedHeight <= maxEdge &&
      fittedWidth * fittedHeight <= maxPixels
    ) {
      break;
    }
    const shrink = Math.min(
      maxEdge / fittedWidth,
      maxEdge / fittedHeight,
      Math.sqrt(maxPixels / (fittedWidth * fittedHeight)),
    );
    if (!Number.isFinite(shrink) || shrink <= 0 || shrink >= 1) {
      if (fittedWidth >= fittedHeight && fittedWidth > 1) {
        fittedWidth -= 1;
      } else if (fittedHeight > 1) {
        fittedHeight -= 1;
      } else {
        break;
      }
      continue;
    }
    scale *= shrink;
    fittedWidth = contain(width * scale);
    fittedHeight = contain(height * scale);
  }
  const uniform = Math.min(fittedWidth / width, fittedHeight / height);
  if (!Number.isFinite(uniform) || uniform <= 0) {
    throw new Error(artworkLimitCopy.invalidDimensions);
  }
  return {
    width: fittedWidth,
    height: fittedHeight,
    scale: uniform > 1 ? 1 : uniform,
  };
}

export function getInspectionDimensions(
  width: number,
  height: number,
): { width: number; height: number } {
  const scale = Math.min(1, INSPECTION_MAX_EDGE_PX / Math.max(width, height));
  let inspectionWidth = Math.max(1, Math.round(width * scale));
  let inspectionHeight = Math.max(1, Math.round(height * scale));
  while (
    inspectionWidth > INSPECTION_MAX_EDGE_PX ||
    inspectionHeight > INSPECTION_MAX_EDGE_PX ||
    inspectionWidth * inspectionHeight > INSPECTION_MAX_PIXELS
  ) {
    if (inspectionWidth >= inspectionHeight && inspectionWidth > 1) {
      inspectionWidth -= 1;
    } else if (inspectionHeight > 1) {
      inspectionHeight -= 1;
    } else {
      break;
    }
  }
  return { width: inspectionWidth, height: inspectionHeight };
}

export function findVisibleAlphaBounds(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): IntegerCrop | null {
  let left = width;
  let right = -1;
  let top = height;
  let bottom = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = data[(y * width + x) * 4 + 3];
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
    return null;
  }

  return {
    left,
    top,
    width: right - left + 1,
    height: bottom - top + 1,
  };
}

export function mapInspectionCropToSource(
  scaled: IntegerCrop,
  sourceWidth: number,
  sourceHeight: number,
  inspectionWidth: number,
  inspectionHeight: number,
): IntegerCrop {
  const left = Math.max(
    0,
    Math.floor((scaled.left * sourceWidth) / inspectionWidth),
  );
  const top = Math.max(
    0,
    Math.floor((scaled.top * sourceHeight) / inspectionHeight),
  );
  const right = Math.min(
    sourceWidth,
    Math.ceil(((scaled.left + scaled.width) * sourceWidth) / inspectionWidth),
  );
  const bottom = Math.min(
    sourceHeight,
    Math.ceil(((scaled.top + scaled.height) * sourceHeight) / inspectionHeight),
  );
  const width = right - left;
  const height = bottom - top;
  if (width < 1 || height < 1) {
    return identityCrop(sourceWidth, sourceHeight);
  }
  return { left, top, width, height };
}

export function identityCrop(width: number, height: number): IntegerCrop {
  return { left: 0, top: 0, width, height };
}

export function isIdentityCrop(
  crop: IntegerCrop,
  width: number,
  height: number,
): boolean {
  return (
    crop.left === 0 &&
    crop.top === 0 &&
    crop.width === width &&
    crop.height === height
  );
}

export function isFullSourceCrop(
  crop: IntegerCrop | null,
  width: number,
  height: number,
): boolean {
  return (
    crop === null ||
    (crop.left === 0 &&
      crop.top === 0 &&
      crop.width === width &&
      crop.height === height)
  );
}

export function normalizeRotationDegrees(degrees: number): number {
  return ((degrees % 360) + 360) % 360;
}

export function rotatedBoundingBox(
  width: number,
  height: number,
  degrees: number,
): { width: number; height: number } {
  const rotation = normalizeRotationDegrees(degrees);
  if (rotation === 0) {
    return { width, height };
  }
  const theta = (rotation * Math.PI) / 180;
  const cosine = Math.abs(Math.cos(theta));
  const sine = Math.abs(Math.sin(theta));
  return {
    width: Math.ceil(width * cosine + height * sine),
    height: Math.ceil(width * sine + height * cosine),
  };
}

export interface ArtworkDrawPlan {
  policy: ArtworkDrawPolicy;
  destinationWidth: number;
  destinationHeight: number;
  fitScale: number;
  rotationRadians: number;
  flipX: number;
  flipY: number;
  logicalWidth: number;
  logicalHeight: number;
}

export function planArtworkDraw(input: {
  logicalWidth: number;
  logicalHeight: number;
  rotationDegrees: number;
  flipHorizontal: boolean;
  flipVertical: boolean;
  policy: ArtworkDrawPolicy;
}): ArtworkDrawPlan {
  assertDecodedArtworkDimensions(input.logicalWidth, input.logicalHeight);
  const bounds = rotatedBoundingBox(
    input.logicalWidth,
    input.logicalHeight,
    input.rotationDegrees,
  );
  const fitted =
    input.policy === 'display'
      ? fitInsideBudget(
          bounds.width,
          bounds.height,
          DISPLAY_MAX_EDGE_PX,
          DISPLAY_MAX_PIXELS,
          false,
        )
      : fitExportTransform(bounds.width, bounds.height);
  return {
    policy: input.policy,
    destinationWidth: fitted.width,
    destinationHeight: fitted.height,
    fitScale: fitted.scale,
    rotationRadians:
      (normalizeRotationDegrees(input.rotationDegrees) * Math.PI) / 180,
    flipX: input.flipHorizontal ? -1 : 1,
    flipY: input.flipVertical ? -1 : 1,
    logicalWidth: input.logicalWidth,
    logicalHeight: input.logicalHeight,
  };
}

function fitExportTransform(width: number, height: number): PixelSize {
  if (
    width > EXPORT_TRANSFORM_MAX_EDGE_PX ||
    height > EXPORT_TRANSFORM_MAX_EDGE_PX ||
    width * height > EXPORT_TRANSFORM_MAX_PIXELS
  ) {
    throw new Error(artworkLimitCopy.exportTransform);
  }
  return { width, height, scale: 1 };
}

export function assertCardOutputBudget(
  width: number,
  height: number,
  pixelRatio: number,
): void {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    throw new Error(artworkLimitCopy.cardUnmeasured);
  }
  const outputWidth = width * pixelRatio;
  const outputHeight = height * pixelRatio;
  if (
    outputWidth > CARD_OUTPUT_MAX_EDGE_PX ||
    outputHeight > CARD_OUTPUT_MAX_EDGE_PX ||
    outputWidth * outputHeight > CARD_OUTPUT_MAX_PIXELS
  ) {
    throw new ArtworkLimitError('card_output', artworkLimitCopy.cardOutput);
  }
}

export function needsRasterTransform(
  rotationDegrees: number,
  flipHorizontal: boolean,
  flipVertical: boolean,
): boolean {
  return (
    normalizeRotationDegrees(rotationDegrees) !== 0 ||
    flipHorizontal ||
    flipVertical
  );
}
