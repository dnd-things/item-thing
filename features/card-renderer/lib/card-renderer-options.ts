import type { DurableCardState } from '@/lib/durable-card-state';

export type CardLayoutOption = DurableCardState['cardLayout'];

export type CardStyleOption = DurableCardState['cardStyle'];

export type CardBorderRadiusOption = DurableCardState['cardBorderRadius'];
export type SideLayoutFlowOption = DurableCardState['sideLayoutFlow'];

export type ImageAspectRatioOption = DurableCardState['imageAspectRatio'];

export interface MagicItemCardRendererProps extends DurableCardState {
  imagePreviewUrl: string;
  artworkDrawPolicy?: 'display' | 'export';
  artworkLogicalWidth?: number;
  artworkLogicalHeight?: number;
  preparedArtworkTransformed?: boolean;
  exportGeneration?: number;
}

export interface CardImageDimensions {
  width: number;
  height: number;
  borderRadius: number;
}

export const imageBorderRadiusRange = {
  min: 0,
  max: 100,
  step: 10,
} as const;

export const imageBorderWidthPxRange = {
  min: 0,
  max: 24,
  step: 1,
} as const;

export const cardWidthPxStep = 16 as const;

export const cardWidthPxRangeByLayout = {
  vertical: {
    min: 400,
    max: 600,
    default: 432,
  },
  'image-right': {
    min: 500,
    max: 700,
    default: 608,
  },
} as const;

export function getCardWidthPxRange(cardLayout: CardLayoutOption) {
  return cardWidthPxRangeByLayout[cardLayout];
}

export function getDefaultCardWidthPx(cardLayout: CardLayoutOption): number {
  return getCardWidthPxRange(cardLayout).default;
}

export function getResolvedCardWidthPx(
  cardLayout: CardLayoutOption,
  cardWidthAuto: boolean,
  cardWidthPx: number,
): number {
  if (cardWidthAuto) {
    return getDefaultCardWidthPx(cardLayout);
  }
  return clampCardWidthPxForLayout(cardLayout, cardWidthPx);
}

export function clampCardWidthPxForLayout(
  cardLayout: CardLayoutOption,
  value: number,
): number {
  const range = getCardWidthPxRange(cardLayout);
  const roundedToStep =
    Math.round((value - range.min) / cardWidthPxStep) * cardWidthPxStep +
    range.min;
  return Math.min(range.max, Math.max(range.min, roundedToStep));
}

export function clampImageBorderWidthPx(value: number): number {
  const rounded = Math.round(value);
  return Math.min(
    imageBorderWidthPxRange.max,
    Math.max(imageBorderWidthPxRange.min, rounded),
  );
}

export const imageRightVerticalPositionRange = {
  /** Static defaults / persistence fallback; live workbench min is from `getImageRightVerticalPositionMin`. */
  min: -4,
  /** Static ceiling for fixed flow, defaults, and persistence fallback; fluid workbench max is height-derived. */
  max: 32,
  step: 1,
  default: 0,
} as const;

/** Workbench slider domain for image-right vertical position (internal bounds mapped linearly). */
export const imageRightVerticalPositionUserRange = {
  min: 0,
  max: 100,
  step: 1,
} as const;

/** Preview card height divisor for the image-right vertical position slider max (1 step per 16px). */
export const IMAGE_RIGHT_VERTICAL_POSITION_CARD_HEIGHT_PX_PER_STEP =
  16 as const;

/**
 * Fixed image-right vertical slider: at this measured preview card height, slider **0** / **100**
 * map to **∓30rem** margin-top (50 → 0). Shorter/taller cards scale linearly.
 */
export const IMAGE_RIGHT_FIXED_VERTICAL_MARGIN_REFERENCE_HEIGHT_PX =
  779 as const;

export const IMAGE_RIGHT_FIXED_VERTICAL_MARGIN_HALF_RANGE_REM_AT_REFERENCE =
  30 as const;

export function computeImageRightVerticalPositionMaxFromCardHeightPx(
  heightPx: number,
): number {
  return Math.floor(
    heightPx / IMAGE_RIGHT_VERTICAL_POSITION_CARD_HEIGHT_PX_PER_STEP,
  );
}

export function getImageRightVerticalPositionMin(
  classificationAndRarity: string | undefined,
): number {
  return (classificationAndRarity?.trim().length ?? 0) > 0 ? -6 : -4;
}

/** Default internal position when entering image-right + fluid (0rem margin-top). */
export const imageRightVerticalPositionDefaultForFluidSideLayout = 0 as const;

export function computeImageRightFixedVerticalMarginHalfRangeRem(
  cardPreviewSurfaceHeightPx: number,
  boundsMin: number,
  boundsMax: number,
): number {
  if (cardPreviewSurfaceHeightPx > 0) {
    return (
      (cardPreviewSurfaceHeightPx /
        IMAGE_RIGHT_FIXED_VERTICAL_MARGIN_REFERENCE_HEIGHT_PX) *
      IMAGE_RIGHT_FIXED_VERTICAL_MARGIN_HALF_RANGE_REM_AT_REFERENCE
    );
  }
  const span = boundsMax - boundsMin;
  return span / 4;
}

/**
 * Image-right artwork `margin-top` in rem. **Fluid**: `position / 2`. **Fixed**: slider 50% → **0**;
 * 0% / 100% → **∓X** with X from `computeImageRightFixedVerticalMarginHalfRangeRem` when
 * `cardPreviewSurfaceHeightPx` is known, else static fallback `(boundsMax - boundsMin) / 4`.
 */
export function getImageRightImageMarginTopRem(
  position: number,
  sideLayoutFlow: SideLayoutFlowOption,
  classificationAndRarity: string,
  cardPreviewSurfaceHeightPx?: number,
): number {
  if (sideLayoutFlow === 'fluid') {
    return position / 2;
  }
  const boundsMin = getImageRightVerticalPositionMin(classificationAndRarity);
  const boundsMax = imageRightVerticalPositionRange.max;
  const span = boundsMax - boundsMin;
  if (span <= 0) {
    return 0;
  }
  const halfRangeRem = computeImageRightFixedVerticalMarginHalfRangeRem(
    cardPreviewSurfaceHeightPx ?? 0,
    boundsMin,
    boundsMax,
  );
  return ((2 * (position - boundsMin)) / span - 1) * halfRangeRem;
}

export function mapImageRightVerticalPositionToUserPercent(
  position: number,
  boundsMin: number,
  boundsMax: number,
): number {
  if (boundsMax <= boundsMin) {
    return 50;
  }
  const userPercent = Math.round(
    (100 * (position - boundsMin)) / (boundsMax - boundsMin),
  );
  return Math.min(100, Math.max(0, userPercent));
}

export function mapUserPercentToImageRightVerticalPosition(
  userPercent: number,
  boundsMin: number,
  boundsMax: number,
): number {
  if (boundsMax <= boundsMin) {
    return boundsMin;
  }
  const clampedPercent = Math.min(100, Math.max(0, userPercent));
  const position = Math.round(
    boundsMin + (clampedPercent / 100) * (boundsMax - boundsMin),
  );
  return Math.min(boundsMax, Math.max(boundsMin, position));
}

export function getImageRightVerticalPositionDefaultForFixedSideLayout(
  classificationAndRarity: string,
): number {
  const boundsMin = getImageRightVerticalPositionMin(classificationAndRarity);
  return mapUserPercentToImageRightVerticalPosition(
    50,
    boundsMin,
    imageRightVerticalPositionRange.max,
  );
}

export function getImageBorderStyle(
  imageBorderWidthPx: number,
  color = 'rgba(0, 0, 0, 0.6)',
): string {
  if (imageBorderWidthPx <= 0) {
    return '';
  }
  return `${imageBorderWidthPx}px solid ${color}`;
}

export function getImageBorderBoxShadow(imageBorderWidthPx: number): string {
  if (imageBorderWidthPx <= 0) {
    return '';
  }
  return '0 2px 8px rgba(15, 23, 42, 0.1), 0 0 0 0.5px rgba(148, 163, 184, 0.3)';
}

export function getCardSurfaceBorderRadius(
  cardBorderRadius: CardBorderRadiusOption,
): number {
  switch (cardBorderRadius) {
    case 'none':
      return 0;
    case 'small':
      return 16;
    default:
      return 30;
  }
}

export const supportedCardStyleOptions = ['print', 'minimal'] as const;

export function isMinimalCardStyle(cardStyle: CardStyleOption): boolean {
  return cardStyle === 'minimal';
}

export function isCardStyleSupported(
  cardStyle: CardStyleOption,
): cardStyle is (typeof supportedCardStyleOptions)[number] {
  return supportedCardStyleOptions.includes(
    cardStyle as (typeof supportedCardStyleOptions)[number],
  );
}

export function shouldStackVerticalCardMetadata(
  cardLayout: CardLayoutOption,
): boolean {
  return cardLayout === 'vertical';
}

export function isSideImageCardLayout(cardLayout: CardLayoutOption): boolean {
  return cardLayout !== 'vertical';
}

/**
 * When the artwork is rotated, layout uses **1:1** so the slot matches the rotated canvas blob
 * under `object-contain` more predictably.
 */
export function getEffectiveImageAspectRatioForLayout(
  imageAspectRatio: ImageAspectRatioOption,
  imageRotationDegrees: number,
): ImageAspectRatioOption {
  const norm = ((imageRotationDegrees % 360) + 360) % 360;
  if (norm !== 0) {
    return 'square';
  }
  return imageAspectRatio;
}

export function getImageAspectRatioValue(
  imageAspectRatio: ImageAspectRatioOption,
  resolvedImageAspectRatio: number = 1,
): number {
  switch (imageAspectRatio) {
    case 'based-on-image':
      return resolvedImageAspectRatio > 0 ? resolvedImageAspectRatio : 1;
    case 'portrait':
      return 4 / 5;
    case 'portrait-3-4':
      return 3 / 4;
    case 'portrait-2-3':
      return 2 / 3;
    case 'portrait-9-16':
      return 9 / 16;
    case 'landscape':
      return 3 / 2;
    case 'widescreen':
      return 16 / 9;
    default:
      return 1;
  }
}

export function getCardImageDimensions(
  imageSize: number,
  imageAspectRatio: ImageAspectRatioOption,
  resolvedImageAspectRatio: number,
  imageBorderRadius: number,
): CardImageDimensions {
  const normalizedScale = imageSize / 100;
  const baseWidth = 96 + normalizedScale * 96;
  const imageAspectRatioValue = getImageAspectRatioValue(
    imageAspectRatio,
    resolvedImageAspectRatio,
  );
  const imageHeight = baseWidth / imageAspectRatioValue;
  const maxPossibleBorderRadius = Math.min(baseWidth / 2, imageHeight / 2);
  const normalizedBorderRadius =
    Math.min(
      Math.max(imageBorderRadius, imageBorderRadiusRange.min),
      imageBorderRadiusRange.max,
    ) / imageBorderRadiusRange.max;
  const resolvedBorderRadius = maxPossibleBorderRadius * normalizedBorderRadius;

  return {
    width: baseWidth,
    height: imageHeight,
    borderRadius: resolvedBorderRadius,
  };
}

export function getCardLayoutClassName(cardLayout: CardLayoutOption): string {
  switch (cardLayout) {
    case 'image-right':
      return 'flex-row-reverse';
    default:
      return 'flex-col';
  }
}

export function getCardMediaColumnClassName(
  cardLayout: CardLayoutOption,
): string {
  switch (cardLayout) {
    case 'image-right':
      return 'shrink-0';
    default:
      return 'w-full';
  }
}

export function getCardSurfaceMinHeightClassName(
  cardLayout: CardLayoutOption,
): string {
  switch (cardLayout) {
    case 'vertical':
      return 'min-h-[430px]';
    default:
      return '';
  }
}
