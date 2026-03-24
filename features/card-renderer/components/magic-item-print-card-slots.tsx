'use client';

import Image from 'next/image';
import { cloneElement } from 'react';
import Markdown from 'react-markdown';
import { cn } from '@/lib/utils';

import {
  type CardImageDimensions,
  getImageBorderBoxShadow,
  getImageBorderStyle,
} from '../lib/card-renderer-options';

export const printCardClassNames = {
  surface:
    'w-full overflow-hidden border-2 border-slate-200 bg-white text-slate-950 shadow-[0_18px_48px_rgba(15,23,42,0.08)]',
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
    'min-h-[2.75rem] text-[2rem] leading-tight font-semibold tracking-tight [font-family:var(--font-cormorant-garamond)]',
  sideTitle:
    'w-full text-left text-[2rem] leading-tight font-semibold tracking-tight text-balance [font-family:var(--font-cormorant-garamond)]',
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

export interface MagicItemPrintCardSlotsParams {
  isSideLayout: boolean;
  shouldUseWrappedSideLayout: boolean;
  shouldStackMetadata: boolean;
  cardImageDimensions: CardImageDimensions;
  imageBorderWidthPx: number;
  sideImageMarginTopRem: number;
  /**
   * Image URL for `<Image src>` and `shape-outside: url()` — same canvas blob when rotated/flipped
   * so wrap matches pixels.
   */
  renderImageUrl: string;
  imageFileName: string;
  itemName: string;
  classificationAndRarity: string;
  requiresAttunement: boolean;
  flavorDescription: string;
  mechanicalDescription: string;
}

export interface MagicItemPrintCardSlots {
  mediaSlot: React.ReactNode;
  flavorDescriptionSlot: React.ReactNode | null;
  sideWrappedMediaSlot: React.ReactNode | null;
  classificationSlot: React.ReactNode;
  attunementBadge: React.ReactNode | null;
  titleSlot: React.ReactNode;
  bodySlot: React.ReactNode;
}

const fluidSideImageClassName = 'float-right ml-4';

export function buildMagicItemPrintCardSlots(
  params: MagicItemPrintCardSlotsParams,
): MagicItemPrintCardSlots {
  const {
    isSideLayout,
    shouldUseWrappedSideLayout,
    shouldStackMetadata,
    cardImageDimensions,
    imageBorderWidthPx,
    sideImageMarginTopRem,
    renderImageUrl,
    imageFileName,
    itemName,
    classificationAndRarity,
    requiresAttunement,
    flavorDescription,
    mechanicalDescription,
  } = params;

  const hasFlavorDescription = flavorDescription.trim().length > 0;
  const mediaAltText = itemName || imageFileName || 'Magic item artwork';
  const hasBorder = imageBorderWidthPx > 0;

  const attunementBadge = requiresAttunement ? (
    <span className={printCardClassNames.attunementBadge}>
      Requires attunement
    </span>
  ) : null;

  const mediaSlot = renderImageUrl ? (
    <Image
      alt={mediaAltText}
      className={printCardClassNames.mediaImage}
      fill
      sizes="(max-width: 768px) 50vw, 220px"
      src={renderImageUrl}
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

  const sideWrappedMediaSlot = shouldUseWrappedSideLayout ? (
    renderImageUrl ? (
      hasBorder ? (
        <div
          className={cn('relative mb-2', fluidSideImageClassName)}
          style={{
            marginTop: `${sideImageMarginTopRem}rem`,
            width: cardImageDimensions.width,
            height: cardImageDimensions.height,
            borderRadius: cardImageDimensions.borderRadius,
            border: getImageBorderStyle(imageBorderWidthPx),
            boxShadow: getImageBorderBoxShadow(imageBorderWidthPx),
            overflow: 'hidden' as const,
            shapeOutside: 'border-box' as const,
            shapeMargin: '1rem',
          }}
        >
          <Image
            alt={mediaAltText}
            className="object-contain"
            src={renderImageUrl}
            unoptimized
            fill
            sizes="(max-width: 768px) 50vw, 220px"
          />
        </div>
      ) : (
        <Image
          alt={mediaAltText}
          className={cn('mb-2 block object-contain', fluidSideImageClassName)}
          src={renderImageUrl}
          unoptimized
          width={Math.round(cardImageDimensions.width)}
          height={Math.round(cardImageDimensions.height)}
          sizes="(max-width: 768px) 50vw, 220px"
          style={{
            marginTop: `${sideImageMarginTopRem}rem`,
            width: cardImageDimensions.width,
            height: cardImageDimensions.height,
            borderRadius: cardImageDimensions.borderRadius,
            shapeOutside: `url("${renderImageUrl}")`,
            shapeImageThreshold: 0.6,
            shapeMargin: '1rem',
          }}
        />
      )
    ) : (
      <div
        className={cn('relative mb-2', fluidSideImageClassName)}
        style={{
          marginTop: `${sideImageMarginTopRem}rem`,
          width: cardImageDimensions.width,
          height: cardImageDimensions.height,
          borderRadius: cardImageDimensions.borderRadius,
          border: getImageBorderStyle(imageBorderWidthPx) || undefined,
          boxShadow: getImageBorderBoxShadow(imageBorderWidthPx) || undefined,
          overflow: 'hidden' as const,
          shapeOutside: 'border-box' as const,
          shapeMargin: '1rem',
        }}
      >
        {mediaSlot}
      </div>
    )
  ) : null;

  const classificationSlot = (
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
  );

  const titleSlot = (
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
  );

  const bodySlot = (
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
      {shouldUseWrappedSideLayout
        ? cloneElement(titleSlot, {
            className: cn(
              isSideLayout
                ? printCardClassNames.sideTitle
                : printCardClassNames.title,
              !isSideLayout && printCardClassNames.centeredText,
              'mb-2',
            ),
          })
        : null}
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
  );

  return {
    mediaSlot,
    flavorDescriptionSlot,
    sideWrappedMediaSlot,
    classificationSlot,
    attunementBadge,
    titleSlot,
    bodySlot,
  };
}
