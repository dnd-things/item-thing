'use client';

import Image from 'next/image';
import { cn } from '@/lib/utils';

import { CardLayout } from './components/card-layout';
import {
  getCardSurfaceBorderRadius,
  getCardWidth,
  isCardStyleSupported,
  isSideImageCardLayout,
  type MagicItemCardRendererProps,
  shouldStackVerticalCardMetadata,
} from './lib/card-renderer-options';

const printCardClassNames = {
  surface:
    'w-full overflow-hidden border border-slate-200 bg-white text-slate-950 shadow-[0_18px_48px_rgba(15,23,42,0.08)]',
  mediaColumn: 'p-4',
  sideMediaColumn: 'self-center',
  mediaFrame: 'relative bg-white text-center',
  sideMediaFrame: 'relative text-center',
  mediaImage: 'object-contain',
  mediaPlaceholder:
    'flex h-full w-full items-center justify-center rounded-[inherit] bg-slate-50/80',
  mediaText:
    'max-w-full px-4 text-sm font-medium leading-6 text-slate-500 break-words',
  classification:
    'min-w-0 flex-1 text-[11px] font-semibold tracking-[0.18em] uppercase text-slate-500',
  sideClassification:
    'min-w-0 w-full overflow-hidden text-left text-ellipsis text-[11px] font-semibold tracking-[0.18em] uppercase text-slate-500 whitespace-nowrap',
  attunementBadge:
    'inline-flex shrink-0 items-center rounded-full border border-slate-300 px-3 py-1 text-[11px] font-semibold tracking-[0.12em] uppercase text-slate-700',
  title:
    'min-h-[2.75rem] text-[1.75rem] leading-tight font-semibold tracking-tight [font-family:var(--font-cormorant-garamond)]',
  sideTitle:
    'w-full text-left text-[1.375rem] leading-tight font-semibold tracking-tight text-balance [font-family:var(--font-cormorant-garamond)]',
  centeredText: 'w-full text-center',
  flavor:
    'text-sm leading-6 text-slate-600 whitespace-pre-wrap italic [font-family:var(--font-cormorant-garamond)]',
  body: 'text-sm leading-6 text-slate-700 whitespace-pre-wrap',
  sideContent: 'gap-3',
  sideClassificationSection: 'justify-start px-2 py-1 text-left',
  sideTitleSection: 'justify-start px-2 py-1 text-left',
  sideFlavorSection: 'px-2 py-2 text-left',
  sideBodySection: 'px-2 py-2 text-left',
  sideBottomSection: 'px-5 py-3 text-center',
} as const;

export interface CardRendererProps extends MagicItemCardRendererProps {
  className?: string;
}

export function CardRenderer({
  className,
  cardLayout,
  cardStyle,
  cardBorderRadius,
  imageAspectRatio,
  imageBorderRadius,
  imageSize,
  imageFileName,
  imagePreviewUrl,
  itemName,
  classificationAndRarity,
  requiresAttunement,
  flavorDescription,
  mechanicalDescription,
}: CardRendererProps) {
  if (!isCardStyleSupported(cardStyle)) {
    return null;
  }

  const isSideLayout = isSideImageCardLayout(cardLayout);
  const shouldStackMetadata = shouldStackVerticalCardMetadata(cardLayout);
  const surfaceBorderRadius = getCardSurfaceBorderRadius(cardBorderRadius);
  const hasFlavorDescription = flavorDescription.trim().length > 0;
  const attunementBadge = requiresAttunement ? (
    <span className={printCardClassNames.attunementBadge}>
      Requires attunement
    </span>
  ) : null;

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
        imageBorderRadius={imageBorderRadius}
        imageSize={imageSize}
        mediaSlot={
          imagePreviewUrl ? (
            <Image
              alt={itemName || imageFileName || 'Magic item artwork'}
              className={printCardClassNames.mediaImage}
              fill
              sizes="(max-width: 768px) 50vw, 220px"
              src={imagePreviewUrl}
              unoptimized
            />
          ) : imageFileName ? (
            <span className={printCardClassNames.mediaText}>
              {imageFileName}
            </span>
          ) : (
            <span className={printCardClassNames.mediaPlaceholder}>
              <span className={printCardClassNames.mediaText}>Add artwork</span>
            </span>
          )
        }
        classificationSlot={
          <span
            className={cn(
              isSideLayout
                ? printCardClassNames.sideClassification
                : printCardClassNames.classification,
              shouldStackMetadata && 'flex-none text-center',
            )}
          >
            {classificationAndRarity}
          </span>
        }
        attunementSlot={shouldStackMetadata ? null : attunementBadge}
        titleSlot={
          <h3
            className={cn(
              isSideLayout
                ? printCardClassNames.sideTitle
                : printCardClassNames.title,
              !isSideLayout && printCardClassNames.centeredText,
            )}
          >
            {itemName}
          </h3>
        }
        flavorSlot={
          hasFlavorDescription ? (
            <p
              className={cn(
                printCardClassNames.flavor,
                !isSideLayout && printCardClassNames.centeredText,
              )}
            >
              {flavorDescription}
            </p>
          ) : null
        }
        bodySlot={
          <p
            className={cn(
              printCardClassNames.body,
              !isSideLayout && printCardClassNames.centeredText,
            )}
          >
            {mechanicalDescription}
          </p>
        }
        bottomMetadataSlot={
          shouldStackMetadata && attunementBadge ? (
            <div className="flex justify-center">{attunementBadge}</div>
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
          isSideLayout ? printCardClassNames.sideBodySection : 'justify-center'
        }
        bottomSectionClassName={
          isSideLayout ? printCardClassNames.sideBottomSection : ''
        }
      />
    </div>
  );
}
