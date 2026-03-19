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
