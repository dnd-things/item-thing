'use client';

import { createContext, type ReactNode, use, useMemo } from 'react';

import { cn } from '@/lib/utils';

import {
  type CardImageDimensions,
  getCardImageDimensions,
  getCardLayoutClassName,
  getCardMediaColumnClassName,
  getCardSurfaceMinHeightClassName,
  getImageBorderBoxShadow,
  getImageBorderStyle,
  type ImageAspectRatioOption,
} from '../lib/card-renderer-options';

interface MagicItemVerticalPrintLayoutContextValue {
  cardImageDimensions: CardImageDimensions;
  imageBorderWidthPx: number;
}

const MagicItemVerticalPrintLayoutContext =
  createContext<MagicItemVerticalPrintLayoutContextValue | null>(null);

function useMagicItemVerticalPrintLayoutContext(): MagicItemVerticalPrintLayoutContextValue {
  const value = use(MagicItemVerticalPrintLayoutContext);
  if (!value) {
    throw new Error(
      'MagicItemVerticalPrintLayout subcomponents must be used within Root',
    );
  }
  return value;
}

interface MagicItemVerticalPrintLayoutRootProps {
  children: ReactNode;
  className?: string;
  imageAspectRatio: ImageAspectRatioOption;
  resolvedImageAspectRatio: number;
  imageBorderRadius: number;
  imageBorderWidthPx: number;
  imageSize: number;
}

function MagicItemVerticalPrintLayoutRoot({
  children,
  className,
  imageAspectRatio,
  resolvedImageAspectRatio,
  imageBorderRadius,
  imageBorderWidthPx,
  imageSize,
}: MagicItemVerticalPrintLayoutRootProps) {
  const cardLayout = 'vertical' as const;
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
    (): MagicItemVerticalPrintLayoutContextValue => ({
      cardImageDimensions,
      imageBorderWidthPx,
    }),
    [cardImageDimensions, imageBorderWidthPx],
  );

  return (
    <MagicItemVerticalPrintLayoutContext.Provider value={contextValue}>
      <div
        className={cn(
          'flex gap-5 p-6',
          getCardSurfaceMinHeightClassName(cardLayout),
          getCardLayoutClassName(cardLayout),
          className,
        )}
      >
        {children}
      </div>
    </MagicItemVerticalPrintLayoutContext.Provider>
  );
}

interface MagicItemVerticalPrintLayoutMediaProps {
  children: ReactNode;
  mediaColumnClassName?: string;
  mediaFrameClassName?: string;
}

function MagicItemVerticalPrintLayoutMedia({
  children,
  mediaColumnClassName,
  mediaFrameClassName,
}: MagicItemVerticalPrintLayoutMediaProps) {
  const { cardImageDimensions, imageBorderWidthPx } =
    useMagicItemVerticalPrintLayoutContext();

  return (
    <div
      className={cn(
        'flex items-center justify-center',
        getCardMediaColumnClassName('vertical'),
        mediaColumnClassName,
      )}
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
          boxShadow: getImageBorderBoxShadow(imageBorderWidthPx),
        }}
      >
        {children}
      </div>
    </div>
  );
}

interface MagicItemVerticalPrintLayoutContentProps {
  children: ReactNode;
  className?: string;
}

function MagicItemVerticalPrintLayoutContent({
  children,
  className,
}: MagicItemVerticalPrintLayoutContentProps) {
  return (
    <div
      className={cn(
        'flex min-w-0 flex-1 flex-col justify-between gap-5',
        className,
      )}
    >
      <div className="flex flex-col gap-4">{children}</div>
    </div>
  );
}

export const MagicItemVerticalPrintLayout = {
  Root: MagicItemVerticalPrintLayoutRoot,
  Media: MagicItemVerticalPrintLayoutMedia,
  Content: MagicItemVerticalPrintLayoutContent,
};
