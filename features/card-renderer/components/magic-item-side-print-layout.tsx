'use client';

import {
  type CSSProperties,
  createContext,
  type ReactNode,
  use,
  useMemo,
} from 'react';

import { cn } from '@/lib/utils';

import {
  type CardImageDimensions,
  getCardImageDimensions,
  getCardLayoutClassName,
  getCardMediaColumnClassName,
  getCardSurfaceMinHeightClassName,
  getImageBorderStyle,
  type ImageAspectRatioOption,
} from '../lib/card-renderer-options';

const SIDE_CARD_LAYOUT = 'image-right' as const;

interface MagicItemSidePrintLayoutContextValue {
  cardImageDimensions: CardImageDimensions;
  imageBorderWidthPx: number;
}

const MagicItemSidePrintLayoutContext =
  createContext<MagicItemSidePrintLayoutContextValue | null>(null);

function useMagicItemSidePrintLayoutContext(): MagicItemSidePrintLayoutContextValue {
  const value = use(MagicItemSidePrintLayoutContext);
  if (!value) {
    throw new Error(
      'MagicItemSidePrintLayout subcomponents must be used within Root',
    );
  }
  return value;
}

interface MagicItemSidePrintLayoutRootProps {
  children: ReactNode;
  className?: string;
  imageAspectRatio: ImageAspectRatioOption;
  resolvedImageAspectRatio: number;
  imageBorderRadius: number;
  imageBorderWidthPx: number;
  imageSize: number;
}

function MagicItemSidePrintLayoutRoot({
  children,
  className,
  imageAspectRatio,
  resolvedImageAspectRatio,
  imageBorderRadius,
  imageBorderWidthPx,
  imageSize,
}: MagicItemSidePrintLayoutRootProps) {
  const cardImageDimensions = useMemo(
    () =>
      getCardImageDimensions(
        imageSize,
        imageAspectRatio,
        resolvedImageAspectRatio,
        imageBorderRadius,
      ),
    [imageSize, imageAspectRatio, resolvedImageAspectRatio, imageBorderRadius],
  );
  const contextValue = useMemo(
    (): MagicItemSidePrintLayoutContextValue => ({
      cardImageDimensions,
      imageBorderWidthPx,
    }),
    [cardImageDimensions, imageBorderWidthPx],
  );

  return (
    <MagicItemSidePrintLayoutContext.Provider value={contextValue}>
      <div
        className={cn(
          'flex flex-col gap-5 p-6',
          getCardSurfaceMinHeightClassName(SIDE_CARD_LAYOUT),
          className,
        )}
      >
        {children}
      </div>
    </MagicItemSidePrintLayoutContext.Provider>
  );
}

interface MagicItemSidePrintLayoutMainRowProps {
  children: ReactNode;
}

function MagicItemSidePrintLayoutMainRow({
  children,
}: MagicItemSidePrintLayoutMainRowProps) {
  return (
    <div
      className={cn(
        'flex flex-1 gap-5',
        getCardLayoutClassName(SIDE_CARD_LAYOUT),
      )}
    >
      {children}
    </div>
  );
}

interface MagicItemSidePrintLayoutMediaProps {
  children: ReactNode;
  mediaColumnClassName?: string;
  mediaFrameClassName?: string;
  mediaColumnStyle?: CSSProperties;
}

function MagicItemSidePrintLayoutMedia({
  children,
  mediaColumnClassName,
  mediaFrameClassName,
  mediaColumnStyle,
}: MagicItemSidePrintLayoutMediaProps) {
  const { cardImageDimensions, imageBorderWidthPx } =
    useMagicItemSidePrintLayoutContext();

  return (
    <div
      className={cn(
        'flex items-center justify-center',
        getCardMediaColumnClassName(SIDE_CARD_LAYOUT),
        mediaColumnClassName,
      )}
      style={mediaColumnStyle}
    >
      <div
        className={cn(
          'flex items-center justify-center overflow-hidden',
          mediaFrameClassName,
        )}
        style={{
          width: cardImageDimensions.width,
          height: cardImageDimensions.height,
          borderRadius: cardImageDimensions.borderRadius,
          border: getImageBorderStyle(imageBorderWidthPx),
        }}
      >
        {children}
      </div>
    </div>
  );
}

interface MagicItemSidePrintLayoutContentProps {
  children: ReactNode;
  className?: string;
}

function MagicItemSidePrintLayoutContent({
  children,
  className,
}: MagicItemSidePrintLayoutContentProps) {
  return (
    <div className={cn('flex min-w-0 flex-1 flex-col gap-4', className)}>
      {children}
    </div>
  );
}

interface MagicItemSidePrintLayoutBottomProps {
  children: ReactNode;
  className?: string;
}

function MagicItemSidePrintLayoutBottom({
  children,
  className,
}: MagicItemSidePrintLayoutBottomProps) {
  return (
    <div className={cn('flex items-center justify-center', className)}>
      {children}
    </div>
  );
}

export const MagicItemSidePrintLayout = {
  Root: MagicItemSidePrintLayoutRoot,
  MainRow: MagicItemSidePrintLayoutMainRow,
  Media: MagicItemSidePrintLayoutMedia,
  Content: MagicItemSidePrintLayoutContent,
  Bottom: MagicItemSidePrintLayoutBottom,
};
