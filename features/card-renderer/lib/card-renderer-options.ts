'use client';

export type CardLayoutOption = 'vertical' | 'image-right';

export type CardStyleOption = 'print' | 'minimal' | 'classic';

export type CardBorderRadiusOption = 'none' | 'small' | 'large';
export type SideLayoutFlowOption = 'fixed' | 'fluid';
export type ImageBorderOption = 'none' | 'thin' | 'thick';

export type ImageAspectRatioOption =
  | 'based-on-image'
  | 'square'
  | 'portrait'
  | 'portrait-3-4'
  | 'portrait-2-3'
  | 'portrait-9-16'
  | 'landscape'
  | 'widescreen';

export interface MagicItemCardRendererProps {
  cardLayout: CardLayoutOption;
  sideLayoutFlow: SideLayoutFlowOption;
  cardStyle: CardStyleOption;
  cardBorderRadius: CardBorderRadiusOption;
  imageSize: number;
  imageAspectRatio: ImageAspectRatioOption;
  resolvedImageAspectRatio: number;
  imageBorderRadius: number;
  imageBorder: ImageBorderOption;
  /**
   * Image-right vertical offset; workbench maps 0–100 linearly across min…max internal integers.
   * **Fluid**: margin-top = `value / 2` rem. **Fixed**: **50 → 0**, **0 / 100 → ∓X rem** where X scales
   * with measured preview card height (see `IMAGE_RIGHT_FIXED_VERTICAL_MARGIN_REFERENCE_HEIGHT_PX`).
   * Bounds: `getImageRightVerticalPositionMin`; fluid max from preview height, fixed max
   * `imageRightVerticalPositionRange.max`.
   */
  imageRightVerticalPosition: number;
  /** When true, artwork is mirrored for display; use flipped bitmap for `shape-outside: url()` alignment. */
  imageFlipHorizontal: boolean;
  imageFlipVertical: boolean;
  imageFileName: string;
  imagePreviewUrl: string;
  itemName: string;
  classificationAndRarity: string;
  requiresAttunement: boolean;
  flavorDescription: string;
  mechanicalDescription: string;
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

export function getImageBorderStyle(imageBorder: ImageBorderOption): string {
  switch (imageBorder) {
    case 'thin':
      return '2px solid #000';
    case 'thick':
      return '5px solid #000';
    default:
      return '';
  }
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

export const supportedCardStyleOptions = ['print'] as const;

export function isCardStyleSupported(
  cardStyle: CardStyleOption,
): cardStyle is (typeof supportedCardStyleOptions)[number] {
  return supportedCardStyleOptions.includes(
    cardStyle as (typeof supportedCardStyleOptions)[number],
  );
}

export function getCardWidth(cardLayout: CardLayoutOption): number {
  switch (cardLayout) {
    case 'vertical':
      return 430;
    case 'image-right':
      return 600;
    default:
      return 560;
  }
}

export function shouldStackVerticalCardMetadata(
  cardLayout: CardLayoutOption,
): boolean {
  return cardLayout === 'vertical';
}

export function isSideImageCardLayout(cardLayout: CardLayoutOption): boolean {
  return cardLayout !== 'vertical';
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
