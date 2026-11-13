import {
  getImageRightVerticalPositionMin,
  IMAGE_RIGHT_FIXED_VERTICAL_MARGIN_HALF_RANGE_REM_AT_REFERENCE,
  IMAGE_RIGHT_FIXED_VERTICAL_MARGIN_REFERENCE_HEIGHT_PX,
  imageRightVerticalPositionRange,
  type SideLayoutFlowOption,
} from './card-renderer-options';

function fixedImageRightMarginHalfRangeRem(
  surfaceHeightPx: number,
  boundsMin: number,
  boundsMax: number,
): number {
  if (surfaceHeightPx > 0) {
    return (
      (surfaceHeightPx /
        IMAGE_RIGHT_FIXED_VERTICAL_MARGIN_REFERENCE_HEIGHT_PX) *
      IMAGE_RIGHT_FIXED_VERTICAL_MARGIN_HALF_RANGE_REM_AT_REFERENCE
    );
  }
  const span = boundsMax - boundsMin;
  return span / 4;
}

export function imageRightArtworkMarginTopRem(input: {
  imageRightVerticalPosition: number;
  sideLayoutFlow: SideLayoutFlowOption;
  classificationAndRarity: string;
  surfaceHeightPx: number;
}): number {
  if (input.sideLayoutFlow === 'fluid') {
    return input.imageRightVerticalPosition / 2;
  }
  const boundsMin = getImageRightVerticalPositionMin(
    input.classificationAndRarity,
  );
  const boundsMax = imageRightVerticalPositionRange.max;
  const span = boundsMax - boundsMin;
  if (span <= 0) {
    return 0;
  }
  const halfRangeRem = fixedImageRightMarginHalfRangeRem(
    input.surfaceHeightPx,
    boundsMin,
    boundsMax,
  );
  return (
    ((2 * (input.imageRightVerticalPosition - boundsMin)) / span - 1) *
    halfRangeRem
  );
}

export function measureFixedImageRightSurfaceHeightPx(
  surface: HTMLElement,
): number {
  return surface.offsetHeight;
}
