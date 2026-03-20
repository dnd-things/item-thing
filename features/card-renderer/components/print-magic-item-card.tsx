'use client';

import { cn } from '@/lib/utils';
import {
  getCardImageDimensions,
  getCardSurfaceBorderRadius,
  getCardWidth,
  getImageRightImageMarginTopRem,
  isSideImageCardLayout,
  type MagicItemCardRendererProps,
  shouldStackVerticalCardMetadata,
} from '../lib/card-renderer-options';
import {
  buildMagicItemPrintCardSlots,
  printCardClassNames,
} from './magic-item-print-card-slots';
import { MagicItemSidePrintLayout } from './magic-item-side-print-layout';
import { MagicItemVerticalPrintLayout } from './magic-item-vertical-print-layout';

export interface PrintMagicItemCardProps extends MagicItemCardRendererProps {
  className?: string;
  cardPreviewSurfaceHeightPx?: number;
}

export function PrintMagicItemCard({
  className,
  cardLayout,
  sideLayoutFlow,
  cardBorderRadius,
  imageAspectRatio,
  resolvedImageAspectRatio,
  imageBorderRadius,
  imageBorder,
  imageRightVerticalPosition,
  imageSize,
  imageFileName,
  imagePreviewUrl,
  itemName,
  classificationAndRarity,
  requiresAttunement,
  flavorDescription,
  mechanicalDescription,
  cardPreviewSurfaceHeightPx,
}: PrintMagicItemCardProps) {
  const isSideLayout = isSideImageCardLayout(cardLayout);
  const shouldUseWrappedSideLayout = isSideLayout && sideLayoutFlow === 'fluid';
  const shouldStackMetadata = shouldStackVerticalCardMetadata(cardLayout);
  const surfaceBorderRadius = getCardSurfaceBorderRadius(cardBorderRadius);
  const cardImageDimensions = getCardImageDimensions(
    imageSize,
    imageAspectRatio,
    resolvedImageAspectRatio,
    imageBorderRadius,
  );

  const sideImageMarginTopRem = isSideLayout
    ? getImageRightImageMarginTopRem(
        imageRightVerticalPosition,
        sideLayoutFlow,
        classificationAndRarity,
        cardPreviewSurfaceHeightPx,
      )
    : 0;

  const slots = buildMagicItemPrintCardSlots({
    isSideLayout,
    shouldUseWrappedSideLayout,
    shouldStackMetadata,
    cardImageDimensions,
    imageBorder,
    sideImageMarginTopRem,
    imagePreviewUrl,
    imageFileName,
    itemName,
    classificationAndRarity,
    requiresAttunement,
    flavorDescription,
    mechanicalDescription,
  });

  const attunementInlineSlot = shouldStackMetadata
    ? null
    : slots.attunementBadge;
  const bottomMetadataSlot =
    shouldStackMetadata && slots.attunementBadge ? (
      <div className="flex justify-center">{slots.attunementBadge}</div>
    ) : null;

  const surfaceClassName = cn(printCardClassNames.surface, className);
  const surfaceStyle = {
    maxWidth: getCardWidth(cardLayout),
    ...(cardLayout === 'vertical' && { minWidth: 300 }),
    borderRadius: surfaceBorderRadius,
  };

  if (!isSideLayout) {
    return (
      <div className={surfaceClassName} style={surfaceStyle}>
        <MagicItemVerticalPrintLayout.Root
          imageAspectRatio={imageAspectRatio}
          resolvedImageAspectRatio={resolvedImageAspectRatio}
          imageBorderRadius={imageBorderRadius}
          imageBorder={imageBorder}
          imageSize={imageSize}
        >
          <MagicItemVerticalPrintLayout.Media
            mediaColumnClassName={printCardClassNames.mediaColumn}
            mediaFrameClassName={printCardClassNames.mediaFrame}
          >
            {slots.mediaSlot}
          </MagicItemVerticalPrintLayout.Media>
          <MagicItemVerticalPrintLayout.Content>
            <div
              className={cn(
                'flex min-h-6 flex-wrap items-center gap-x-3 gap-y-2',
                'justify-center',
              )}
            >
              {slots.classificationSlot}
              {attunementInlineSlot}
            </div>
            <div className={cn('flex flex-col gap-2', 'justify-center')}>
              {slots.titleSlot}
              {slots.flavorDescriptionSlot}
            </div>
            {slots.bodySlot}
            {bottomMetadataSlot}
          </MagicItemVerticalPrintLayout.Content>
        </MagicItemVerticalPrintLayout.Root>
      </div>
    );
  }

  const showSideMediaColumn = !shouldUseWrappedSideLayout;

  return (
    <div className={surfaceClassName} style={surfaceStyle}>
      <MagicItemSidePrintLayout.Root
        imageAspectRatio={imageAspectRatio}
        resolvedImageAspectRatio={resolvedImageAspectRatio}
        imageBorderRadius={imageBorderRadius}
        imageBorder={imageBorder}
        imageSize={imageSize}
      >
        <MagicItemSidePrintLayout.MainRow>
          {showSideMediaColumn ? (
            <MagicItemSidePrintLayout.Media
              mediaColumnClassName={cn(
                printCardClassNames.mediaColumn,
                printCardClassNames.sideMediaColumn,
              )}
              mediaColumnStyle={{
                marginTop: `${sideImageMarginTopRem}rem`,
              }}
              mediaFrameClassName={printCardClassNames.sideMediaFrame}
            >
              {slots.mediaSlot}
            </MagicItemSidePrintLayout.Media>
          ) : null}
          <MagicItemSidePrintLayout.Content
            className={cn(
              !showSideMediaColumn && 'w-full',
              printCardClassNames.sideContent,
            )}
          >
            <div
              className={cn(
                'flex items-center',
                printCardClassNames.sideClassificationSection,
              )}
            >
              {slots.classificationSlot}
            </div>
            {!shouldUseWrappedSideLayout ? (
              <div
                className={cn(
                  'flex items-center',
                  printCardClassNames.sideTitleSection,
                )}
              >
                {slots.titleSlot}
              </div>
            ) : null}
            {!shouldUseWrappedSideLayout && slots.flavorDescriptionSlot ? (
              <div
                className={cn('flex', printCardClassNames.sideFlavorSection)}
              >
                {slots.flavorDescriptionSlot}
              </div>
            ) : null}
            <div className={cn('flex', printCardClassNames.sideBodySection)}>
              {slots.bodySlot}
            </div>
          </MagicItemSidePrintLayout.Content>
        </MagicItemSidePrintLayout.MainRow>
        {attunementInlineSlot || bottomMetadataSlot ? (
          <MagicItemSidePrintLayout.Bottom
            className={printCardClassNames.sideBottomSection}
          >
            {attunementInlineSlot}
            {bottomMetadataSlot}
          </MagicItemSidePrintLayout.Bottom>
        ) : null}
      </MagicItemSidePrintLayout.Root>
    </div>
  );
}
