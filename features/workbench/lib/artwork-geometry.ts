export {
  type ArtworkDrawPlan,
  type ArtworkDrawPolicy,
  artworkLimitCopy,
  assertDecodedArtworkDimensions,
  assertEncodedArtworkBytes,
  dataUrlEncodedByteLength,
  findVisibleAlphaBounds,
  fitsDisplayBudget,
  getInspectionDimensions,
  type IntegerCrop,
  identityCrop,
  isFullSourceCrop,
  isIdentityCrop,
  isPositiveIntegerDimension,
  mapInspectionCropToSource,
  needsRasterTransform,
  normalizeRotationDegrees,
  type PixelSize,
  planArtworkDraw,
  rotatedBoundingBox,
} from '@/features/artwork/geometry';

import {
  artworkLimitCopy,
  CARD_OUTPUT_MAX_EDGE_PX,
  CARD_OUTPUT_MAX_PIXELS,
} from '@/features/artwork/limits';
import { ArtworkLimitError } from '@/lib/artwork-limit-error';

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
