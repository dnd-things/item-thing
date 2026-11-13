'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import {
  getCardImageDimensions,
  getCardSurfaceBorderRadius,
  getEffectiveImageAspectRatioForLayout,
  getResolvedCardWidthPx,
  isSideImageCardLayout,
  type MagicItemCardRendererProps,
  shouldStackVerticalCardMetadata,
} from '../lib/card-renderer-options';
import {
  imageRightArtworkMarginTopRem,
  measureFixedImageRightSurfaceHeightPx,
} from '../lib/image-right-artwork-placement';
import {
  artworkDataset,
  useFlippedImagePreviewUrl,
} from '../lib/use-flipped-image-preview-url';
import { useMinimalArtworkTheme } from '../lib/use-minimal-artwork-theme';
import {
  buildMagicItemPrintCardSlots,
  printCardClassNames,
} from './magic-item-print-card-slots';
import { MagicItemSidePrintLayout } from './magic-item-side-print-layout';
import { MagicItemVerticalPrintLayout } from './magic-item-vertical-print-layout';

export interface PrintMagicItemCardProps extends MagicItemCardRendererProps {
  className?: string;
}

export function PrintMagicItemCard({
  className,
  cardLayout,
  sideLayoutFlow,
  cardBorderRadius,
  cardWidthAuto,
  cardWidthPx,
  imageAspectRatio,
  resolvedImageAspectRatio,
  imageBorderRadius,
  imageBorderWidthPx,
  artworkColorSource,
  artworkCustomColor,
  imageRightVerticalPosition,
  imageSize,
  imageFileName,
  imagePreviewUrl,
  imageRotationDegrees,
  imageFlipHorizontal,
  imageFlipVertical,
  artworkDrawPolicy,
  artworkLogicalWidth,
  artworkLogicalHeight,
  preparedArtworkTransformed,
  exportGeneration,
  itemName,
  classificationAndRarity,
  requiresAttunement,
  flavorDescription,
  mechanicalDescription,
}: PrintMagicItemCardProps) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const latchedWidthPxRef = useRef<number | null>(null);
  const latchedHeightRef = useRef(0);
  const [latchedFixedSurface, setLatchedFixedSurface] = useState<{
    widthPx: number;
    heightPx: number;
  } | null>(null);

  const artwork = useFlippedImagePreviewUrl(
    imagePreviewUrl,
    imageRotationDegrees,
    imageFlipHorizontal,
    imageFlipVertical,
    {
      ...(artworkDrawPolicy ? { policy: artworkDrawPolicy } : {}),
      ...(artworkLogicalWidth !== undefined
        ? { logicalWidth: artworkLogicalWidth }
        : {}),
      ...(artworkLogicalHeight !== undefined
        ? { logicalHeight: artworkLogicalHeight }
        : {}),
      ...(preparedArtworkTransformed ? { alreadyTransformed: true } : {}),
    },
  );
  const renderImageUrl = artwork.effectiveUrl;
  const { artworkColor, settled: themeSettled } = useMinimalArtworkTheme(
    renderImageUrl,
    artworkColorSource,
    artworkCustomColor,
  );
  const readiness = artworkDataset(artwork, themeSettled, exportGeneration);

  const layoutImageAspectRatio = getEffectiveImageAspectRatioForLayout(
    imageAspectRatio,
    imageRotationDegrees,
  );

  const isSideLayout = isSideImageCardLayout(cardLayout);
  const shouldUseWrappedSideLayout = isSideLayout && sideLayoutFlow === 'fluid';
  const shouldStackMetadata = shouldStackVerticalCardMetadata(cardLayout);
  const surfaceBorderRadius = getCardSurfaceBorderRadius(cardBorderRadius);
  const cardImageDimensions = getCardImageDimensions(
    imageSize,
    layoutImageAspectRatio,
    resolvedImageAspectRatio,
    imageBorderRadius,
  );

  const resolvedWidthPx = getResolvedCardWidthPx(
    cardLayout,
    cardWidthAuto,
    cardWidthPx,
  );
  const needsFixedArtworkLatch = isSideLayout && sideLayoutFlow === 'fixed';
  const fixedLatchReady =
    latchedFixedSurface !== null &&
    latchedFixedSurface.widthPx === resolvedWidthPx &&
    latchedFixedSurface.heightPx > 0;

  useLayoutEffect(() => {
    if (!needsFixedArtworkLatch) {
      return;
    }
    const surface = surfaceRef.current;
    if (!surface) {
      return;
    }
    if (
      latchedWidthPxRef.current === resolvedWidthPx &&
      latchedHeightRef.current > 0
    ) {
      return;
    }
    const heightPx = measureFixedImageRightSurfaceHeightPx(surface);
    latchedWidthPxRef.current = resolvedWidthPx;
    latchedHeightRef.current = heightPx;
    setLatchedFixedSurface({
      widthPx: resolvedWidthPx,
      heightPx,
    });
  }, [needsFixedArtworkLatch, resolvedWidthPx]);

  const sideImageMarginTopRem = isSideLayout
    ? imageRightArtworkMarginTopRem({
        imageRightVerticalPosition,
        sideLayoutFlow,
        classificationAndRarity,
        surfaceHeightPx:
          needsFixedArtworkLatch && fixedLatchReady
            ? latchedFixedSurface.heightPx
            : 0,
      })
    : 0;

  const appliedSideImageMarginTopRem =
    needsFixedArtworkLatch && !fixedLatchReady ? 0 : sideImageMarginTopRem;

  const slots = buildMagicItemPrintCardSlots({
    isSideLayout,
    shouldUseWrappedSideLayout,
    shouldStackMetadata,
    cardImageDimensions,
    imageBorderWidthPx,
    imageBorderColor: artworkColor,
    sideImageMarginTopRem: appliedSideImageMarginTopRem,
    renderImageUrl,
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
    maxWidth: resolvedWidthPx,
    ...(cardLayout === 'vertical' && { minWidth: 300 }),
    borderRadius: surfaceBorderRadius,
  };

  if (!isSideLayout) {
    return (
      <div className={surfaceClassName} style={surfaceStyle} {...readiness}>
        <MagicItemVerticalPrintLayout.Root
          imageAspectRatio={layoutImageAspectRatio}
          resolvedImageAspectRatio={resolvedImageAspectRatio}
          imageBorderRadius={imageBorderRadius}
          imageBorderWidthPx={imageBorderWidthPx}
          imageBorderColor={artworkColor}
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
    <div
      ref={surfaceRef}
      className={surfaceClassName}
      style={surfaceStyle}
      {...readiness}
    >
      <MagicItemSidePrintLayout.Root
        imageAspectRatio={layoutImageAspectRatio}
        resolvedImageAspectRatio={resolvedImageAspectRatio}
        imageBorderRadius={imageBorderRadius}
        imageBorderWidthPx={imageBorderWidthPx}
        imageBorderColor={artworkColor}
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
                marginTop: `${appliedSideImageMarginTopRem}rem`,
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
