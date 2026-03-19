'use client';

import { cn } from '@/lib/utils';
import {
  getCardImageDimensions,
  getCardSurfaceBorderRadius,
  getCardWidth,
  isSideImageCardLayout,
  type MagicItemCardRendererProps,
  shouldStackVerticalCardMetadata,
} from '../lib/card-renderer-options';
import { CardLayout } from './card-layout';
import {
  buildMagicItemPrintCardSlots,
  printCardClassNames,
} from './magic-item-print-card-slots';

export interface PrintMagicItemCardProps extends MagicItemCardRendererProps {
  className?: string;
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
  imageSize,
  imageFileName,
  imagePreviewUrl,
  itemName,
  classificationAndRarity,
  requiresAttunement,
  flavorDescription,
  mechanicalDescription,
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

  const slots = buildMagicItemPrintCardSlots({
    isSideLayout,
    shouldUseWrappedSideLayout,
    shouldStackMetadata,
    cardImageDimensions,
    imageBorder,
    imagePreviewUrl,
    imageFileName,
    itemName,
    classificationAndRarity,
    requiresAttunement,
    flavorDescription,
    mechanicalDescription,
  });

  return (
    <div
      className={cn(printCardClassNames.surface, className)}
      style={{
        maxWidth: getCardWidth(cardLayout),
        ...(cardLayout === 'vertical' && { minWidth: 300 }),
        borderRadius: surfaceBorderRadius,
      }}
    >
      <CardLayout
        cardLayout={cardLayout}
        imageAspectRatio={imageAspectRatio}
        resolvedImageAspectRatio={resolvedImageAspectRatio}
        imageBorderRadius={imageBorderRadius}
        imageBorder={imageBorder}
        imageSize={imageSize}
        renderSideMediaColumn={!isSideLayout || !shouldUseWrappedSideLayout}
        mediaSlot={slots.mediaSlot}
        classificationSlot={slots.classificationSlot}
        attunementSlot={shouldStackMetadata ? null : slots.attunementBadge}
        titleSlot={slots.titleSlot}
        flavorSlot={
          shouldUseWrappedSideLayout ? null : slots.flavorDescriptionSlot
        }
        bodySlot={slots.bodySlot}
        bottomMetadataSlot={
          shouldStackMetadata && slots.attunementBadge ? (
            <div className="flex justify-center">{slots.attunementBadge}</div>
          ) : null
        }
        mediaColumnClassName={cn(
          printCardClassNames.mediaColumn,
          isSideLayout && printCardClassNames.sideMediaColumn,
        )}
        mediaFrameClassName={
          isSideLayout
            ? printCardClassNames.sideMediaFrame
            : printCardClassNames.mediaFrame
        }
        contentClassName={cn(isSideLayout && printCardClassNames.sideContent)}
        topRowClassName={
          isSideLayout
            ? printCardClassNames.sideClassificationSection
            : 'justify-center'
        }
        titleSectionClassName={
          isSideLayout ? printCardClassNames.sideTitleSection : 'justify-center'
        }
        flavorSectionClassName={
          isSideLayout
            ? printCardClassNames.sideFlavorSection
            : 'justify-center'
        }
        bodySectionClassName={
          isSideLayout ? printCardClassNames.sideBodySection : 'justify-start'
        }
        bottomSectionClassName={
          isSideLayout ? printCardClassNames.sideBottomSection : ''
        }
      />
    </div>
  );
}
