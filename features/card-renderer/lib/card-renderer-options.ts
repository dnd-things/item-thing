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
