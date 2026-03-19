'use client';

import Image from 'next/image';
import Markdown from 'react-markdown';
import { cn } from '@/lib/utils';

import { CardLayout } from './components/card-layout';
import {
  getCardImageDimensions,
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
  body: 'text-sm leading-6 text-slate-700',
  bodyMarkdown:
    '[&_p]:mb-2 [&_p:last-child]:mb-0 [&_ul]:mb-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:mb-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-0.5 [&_strong]:font-semibold [&_code]:rounded [&_code]:bg-slate-100 [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-xs',
  bodyHeading:
    'mt-3 mb-1 text-base font-semibold leading-6 text-slate-700 first:mt-0',
  sideContent: 'gap-3',
  sideClassificationSection: 'justify-start px-2 py-1 text-left',
  sideTitleSection: 'justify-start px-2 py-1 text-left',
  sideFlavorSection: 'px-2 py-2 text-left',
  sideBodySection: 'px-2 py-2 text-left',
  sideBottomSection: 'px-5 py-3 text-center',
} as const;

function BodyHeading({
  node: _node,
  children,
  ...rest
}: React.ComponentPropsWithoutRef<'div'> & { node?: unknown }) {
  return (
    <div className={printCardClassNames.bodyHeading} {...rest}>
      {children}
    </div>
  );
}

export interface CardRendererProps extends MagicItemCardRendererProps {
  className?: string;
}

export function CardRenderer({
  className,
  cardLayout,
  sideLayoutFlow,
  cardStyle,
  cardBorderRadius,
  imageAspectRatio,
  resolvedImageAspectRatio,
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
  const shouldUseWrappedSideLayout = isSideLayout && sideLayoutFlow === 'fluid';
  const shouldStackMetadata = shouldStackVerticalCardMetadata(cardLayout);
  const surfaceBorderRadius = getCardSurfaceBorderRadius(cardBorderRadius);
  const cardImageDimensions = getCardImageDimensions(
    imageSize,
    imageAspectRatio,
    resolvedImageAspectRatio,
    imageBorderRadius,
  );
  const hasFlavorDescription = flavorDescription.trim().length > 0;
  const mediaAltText = itemName || imageFileName || 'Magic item artwork';
  const attunementBadge = requiresAttunement ? (
    <span className={printCardClassNames.attunementBadge}>
      Requires attunement
    </span>
  ) : null;
  const mediaSlot = imagePreviewUrl ? (
    <Image
      alt={mediaAltText}
      className={printCardClassNames.mediaImage}
      fill
      sizes="(max-width: 768px) 50vw, 220px"
      src={imagePreviewUrl}
      unoptimized
    />
  ) : imageFileName ? (
    <span className={printCardClassNames.mediaText}>{imageFileName}</span>
  ) : (
    <span className={printCardClassNames.mediaPlaceholder}>
      <span className={printCardClassNames.mediaText}>Add artwork</span>
    </span>
  );
  const flavorDescriptionSlot = hasFlavorDescription ? (
    <p
      className={cn(
        printCardClassNames.flavor,
        !isSideLayout && printCardClassNames.centeredText,
      )}
    >
      {flavorDescription}
    </p>
  ) : null;
  const fluidSideImageClassName = 'float-right ml-4';
  const fluidSideImageShapeClassName =
    '[shape-image-threshold:0.6] [shape-margin:1rem]';
  const sideWrappedMediaSlot = shouldUseWrappedSideLayout ? (
    imagePreviewUrl ? (
      <Image
        alt={mediaAltText}
        className={cn(
          'mb-2 block object-contain',
          fluidSideImageClassName,
          fluidSideImageShapeClassName,
        )}
        src={imagePreviewUrl}
        unoptimized
        width={Math.round(cardImageDimensions.width)}
        height={Math.round(cardImageDimensions.height)}
        sizes="(max-width: 768px) 50vw, 220px"
        style={{
          width: cardImageDimensions.width,
          height: cardImageDimensions.height,
          borderRadius: cardImageDimensions.borderRadius,
          shapeOutside: `url("${imagePreviewUrl}")`,
        }}
      />
    ) : (
      <div
        className={cn('relative mb-2 overflow-hidden', fluidSideImageClassName)}
        style={{
          width: cardImageDimensions.width,
          height: cardImageDimensions.height,
          borderRadius: cardImageDimensions.borderRadius,
        }}
      >
        {mediaSlot}
      </div>
    )
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
        resolvedImageAspectRatio={resolvedImageAspectRatio}
        imageBorderRadius={imageBorderRadius}
        imageSize={imageSize}
        renderSideMediaColumn={!isSideLayout || !shouldUseWrappedSideLayout}
        mediaSlot={mediaSlot}
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
        flavorSlot={shouldUseWrappedSideLayout ? null : flavorDescriptionSlot}
        bodySlot={
          <div
            className={cn(
              printCardClassNames.body,
              printCardClassNames.bodyMarkdown,
              'w-full text-left',
              shouldUseWrappedSideLayout &&
                "after:block after:clear-both after:content-['']",
            )}
          >
            {shouldUseWrappedSideLayout ? sideWrappedMediaSlot : null}
            {shouldUseWrappedSideLayout ? flavorDescriptionSlot : null}
            <Markdown
              components={{
                h1: BodyHeading,
                h2: BodyHeading,
                h3: BodyHeading,
                h4: BodyHeading,
                h5: BodyHeading,
                h6: BodyHeading,
              }}
            >
              {mechanicalDescription}
            </Markdown>
          </div>
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
          isSideLayout ? printCardClassNames.sideBodySection : 'justify-start'
        }
        bottomSectionClassName={
          isSideLayout ? printCardClassNames.sideBottomSection : ''
        }
      />
    </div>
  );
}
