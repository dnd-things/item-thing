'use client';

import type * as React from 'react';

import { cn } from '@/lib/utils';

import {
  type CardLayoutOption,
  getCardImageDimensions,
  getCardLayoutClassName,
  getCardMediaColumnClassName,
  getCardSurfaceMinHeightClassName,
  type ImageAspectRatioOption,
  isSideImageCardLayout,
} from '../lib/card-renderer-options';

interface CardLayoutProps {
  cardLayout: CardLayoutOption;
  imageAspectRatio: ImageAspectRatioOption;
  imageBorderRadius: number;
  imageSize: number;
  renderSideMediaColumn?: boolean;
  mediaSlot?: React.ReactNode;
  classificationSlot?: React.ReactNode;
  attunementSlot?: React.ReactNode;
  titleSlot?: React.ReactNode;
  flavorSlot?: React.ReactNode;
  dividerSlot?: React.ReactNode;
  bodySlot?: React.ReactNode;
  bottomMetadataSlot?: React.ReactNode;
  className?: string;
  mediaColumnClassName?: string;
  mediaFrameClassName?: string;
  contentClassName?: string;
  topRowClassName?: string;
  titleSectionClassName?: string;
  flavorSectionClassName?: string;
  bodySectionClassName?: string;
  bottomSectionClassName?: string;
}

export function CardLayout({
  cardLayout,
  imageAspectRatio,
  imageBorderRadius,
  imageSize,
  renderSideMediaColumn = true,
  mediaSlot,
  classificationSlot,
  attunementSlot,
  titleSlot,
  flavorSlot,
  dividerSlot,
  bodySlot,
  bottomMetadataSlot,
  className,
  mediaColumnClassName,
  mediaFrameClassName,
  contentClassName,
  topRowClassName,
  titleSectionClassName,
  flavorSectionClassName,
  bodySectionClassName,
  bottomSectionClassName,
}: CardLayoutProps) {
  const cardImageDimensions = getCardImageDimensions(
    imageSize,
    imageAspectRatio,
    imageBorderRadius,
  );
  const isSideLayout = isSideImageCardLayout(cardLayout);

  if (isSideLayout) {
    return (
      <div
        className={cn(
          'flex flex-col gap-5 p-6',
          getCardSurfaceMinHeightClassName(cardLayout),
          className,
        )}
      >
        <div
          className={cn(
            'flex flex-1 gap-5',
            getCardLayoutClassName(cardLayout),
          )}
        >
          {renderSideMediaColumn ? (
            <div
              className={cn(
                'flex items-center justify-center',
                getCardMediaColumnClassName(cardLayout),
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
                }}
              >
                {mediaSlot}
              </div>
            </div>
          ) : null}

          <div
            className={cn(
              'flex min-w-0 flex-1 flex-col gap-4',
              !renderSideMediaColumn && 'w-full',
              contentClassName,
            )}
          >
            <div className={cn('flex items-center', topRowClassName)}>
              {classificationSlot}
            </div>

            <div className={cn('flex items-center', titleSectionClassName)}>
              {titleSlot}
            </div>

            {flavorSlot ? (
              <div className={cn('flex', flavorSectionClassName)}>
                {flavorSlot}
              </div>
            ) : null}

            {dividerSlot}

            <div className={cn('flex', bodySectionClassName)}>{bodySlot}</div>
          </div>
        </div>

        {attunementSlot || bottomMetadataSlot ? (
          <div
            className={cn(
              'flex items-center justify-center',
              bottomSectionClassName,
            )}
          >
            {attunementSlot}
            {bottomMetadataSlot}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex gap-5 p-6',
        getCardSurfaceMinHeightClassName(cardLayout),
        getCardLayoutClassName(cardLayout),
        className,
      )}
    >
      <div
        className={cn(
          'flex items-center justify-center',
          getCardMediaColumnClassName(cardLayout),
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
          }}
        >
          {mediaSlot}
        </div>
      </div>

      <div
        className={cn(
          'flex min-w-0 flex-1 flex-col justify-between gap-5',
          contentClassName,
        )}
      >
        <div className="flex flex-col gap-4">
          <div
            className={cn(
              'flex min-h-6 flex-wrap items-center gap-x-3 gap-y-2',
              topRowClassName,
            )}
          >
            {classificationSlot}
            {attunementSlot}
          </div>

          <div className={cn('flex flex-col gap-2', titleSectionClassName)}>
            {titleSlot}
            {flavorSlot}
          </div>

          {dividerSlot}
          {bodySlot}
          {bottomMetadataSlot}
        </div>
      </div>
    </div>
  );
}
