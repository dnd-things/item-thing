import type { DurableCardState } from '@/lib/durable-card-state';

type CardLayoutOption = DurableCardState['cardLayout'];
type SideLayoutFlowOption = DurableCardState['sideLayoutFlow'];

const IMAGE_RIGHT_FIXED_VERTICAL_MARGIN_REFERENCE_HEIGHT_PX = 779;
const IMAGE_RIGHT_FIXED_VERTICAL_MARGIN_HALF_RANGE_REM_AT_REFERENCE = 30;
const IMAGE_RIGHT_VERTICAL_POSITION_CARD_HEIGHT_PX_PER_STEP = 16;
const IMAGE_RIGHT_VERTICAL_POSITION_FIXED_MAX = 32;

export type ImageRightVerticalSurface =
  | { kind: 'unmeasured' }
  | { kind: 'measured'; heightPx: number };

export const imageRightVerticalSlider = {
  min: 0,
  max: 100,
  step: 1,
} as const;

function imageRightVerticalPositionMin(
  classificationAndRarity: string,
): number {
  return classificationAndRarity.trim().length > 0 ? -6 : -4;
}

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
  return (boundsMax - boundsMin) / 4;
}

function imageRightVerticalBoundsMax(
  cardLayout: CardLayoutOption,
  sideLayoutFlow: SideLayoutFlowOption,
  classificationAndRarity: string,
  surface: ImageRightVerticalSurface,
): number {
  const min = imageRightVerticalPositionMin(classificationAndRarity);
  if (cardLayout === 'vertical') {
    return IMAGE_RIGHT_VERTICAL_POSITION_FIXED_MAX;
  }
  if (sideLayoutFlow === 'fixed') {
    return IMAGE_RIGHT_VERTICAL_POSITION_FIXED_MAX;
  }
  if (surface.kind === 'unmeasured') {
    return IMAGE_RIGHT_VERTICAL_POSITION_FIXED_MAX;
  }
  if (surface.heightPx === 0) {
    return min;
  }
  return Math.max(
    Math.floor(
      surface.heightPx / IMAGE_RIGHT_VERTICAL_POSITION_CARD_HEIGHT_PX_PER_STEP,
    ),
    min,
  );
}

function sliderPercentForStored(
  stored: number,
  boundsMin: number,
  boundsMax: number,
): number {
  if (boundsMax <= boundsMin) {
    return 50;
  }
  const raw = Math.round(
    (100 * (stored - boundsMin)) / (boundsMax - boundsMin),
  );
  return Math.min(100, Math.max(0, raw));
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
  const boundsMin = imageRightVerticalPositionMin(
    input.classificationAndRarity,
  );
  const boundsMax = IMAGE_RIGHT_VERTICAL_POSITION_FIXED_MAX;
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

export function defaultImageRightVerticalPosition(
  flow: SideLayoutFlowOption,
  classificationAndRarity: string,
): number {
  if (flow === 'fluid') {
    return 0;
  }
  return classificationAndRarity.trim().length > 0 ? 13 : 14;
}

export function reconcileImageRightVerticalPosition(input: {
  cardLayout: CardLayoutOption;
  sideLayoutFlow: SideLayoutFlowOption;
  classificationAndRarity: string;
  surface: ImageRightVerticalSurface;
  stored: number;
}): {
  bounds: { min: number; max: number };
  stored: number;
  sliderPercent: number;
} {
  const boundsMin = imageRightVerticalPositionMin(
    input.classificationAndRarity,
  );
  const boundsMax = imageRightVerticalBoundsMax(
    input.cardLayout,
    input.sideLayoutFlow,
    input.classificationAndRarity,
    input.surface,
  );
  const bounds = { min: boundsMin, max: boundsMax };

  let stored = input.stored;
  if (input.cardLayout === 'image-right' && input.surface.kind === 'measured') {
    stored = Math.min(boundsMax, Math.max(boundsMin, stored));
  }

  const sliderPercent = sliderPercentForStored(stored, boundsMin, boundsMax);
  return { bounds, stored, sliderPercent };
}

export function storedImageRightVerticalPositionForSlider(
  percent: number,
  bounds: { min: number; max: number },
): number {
  if (bounds.max <= bounds.min) {
    return bounds.min;
  }
  const clampedPercent = Math.min(100, Math.max(0, percent));
  return Math.round(
    bounds.min + (clampedPercent / 100) * (bounds.max - bounds.min),
  );
}

export function measureFixedImageRightSurfaceHeightPx(
  surface: HTMLElement,
): number {
  return surface.offsetHeight;
}
