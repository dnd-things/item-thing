'use client';

import { type RefObject, useLayoutEffect, useRef, useState } from 'react';

import {
  computeImageRightVerticalPositionMaxFromCardHeightPx,
  getImageRightVerticalPositionMin,
  imageRightVerticalPositionRange,
} from '@/features/card-renderer/lib/card-renderer-options';

import type {
  MagicItemWorkbenchState,
  WorkbenchFieldSetter,
} from './workbench-options';

export interface ImageRightVerticalPositionBounds {
  min: number;
  max: number;
  /** Preview wrapper `offsetHeight` when image-right (for fixed-layout margin scaling). */
  measuredCardSurfaceHeightPx: number;
}

/**
 * Stable, cheap key for remeasuring card height. Must not include `imagePreviewUrl`
 * (multi‑MB data URLs) — serializing it on every slider tick blocked the main thread.
 */
function buildImageRightVerticalPositionMeasureKey(
  workbenchState: MagicItemWorkbenchState,
): string {
  return JSON.stringify({
    cardLayout: workbenchState.cardLayout,
    sideLayoutFlow: workbenchState.sideLayoutFlow,
    cardStyle: workbenchState.cardStyle,
    cardBorderRadius: workbenchState.cardBorderRadius,
    imageSize: workbenchState.imageSize,
    imageAspectRatio: workbenchState.imageAspectRatio,
    imageRotationDegrees: workbenchState.imageRotationDegrees,
    resolvedImageAspectRatio: workbenchState.resolvedImageAspectRatio,
    imageBorderRadius: workbenchState.imageBorderRadius,
    imageBorderWidthPx: workbenchState.imageBorderWidthPx,
    imageFileName: workbenchState.imageFileName,
    imagePreviewByteLength: workbenchState.imagePreviewUrl.length,
    itemName: workbenchState.itemName,
    classificationAndRarity: workbenchState.classificationAndRarity,
    requiresAttunement: workbenchState.requiresAttunement,
    flavorDescription: workbenchState.flavorDescription,
    mechanicalDescription: workbenchState.mechanicalDescription,
  });
}

export function useImageRightVerticalPositionBounds(
  cardRef: RefObject<HTMLDivElement | null>,
  workbenchState: MagicItemWorkbenchState,
  setWorkbenchField: WorkbenchFieldSetter,
): ImageRightVerticalPositionBounds {
  const verticalPositionMin = getImageRightVerticalPositionMin(
    workbenchState.classificationAndRarity,
  );

  const workbenchStateTriggerKey =
    buildImageRightVerticalPositionMeasureKey(workbenchState);

  const imageRightVerticalPositionRef = useRef(
    workbenchState.imageRightVerticalPosition,
  );
  imageRightVerticalPositionRef.current =
    workbenchState.imageRightVerticalPosition;

  const [verticalPositionMax, setVerticalPositionMax] = useState<number>(
    imageRightVerticalPositionRange.max,
  );

  const [measuredCardSurfaceHeightPx, setMeasuredCardSurfaceHeightPx] =
    useState(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: workbenchStateTriggerKey remeasures when layout-affecting fields change (not vertical position); excludes huge imagePreviewUrl payload.
  useLayoutEffect(() => {
    if (workbenchState.cardLayout !== 'image-right') {
      return;
    }

    const heightPx = cardRef.current?.offsetHeight ?? 0;

    setMeasuredCardSurfaceHeightPx(heightPx);

    const nextMin = getImageRightVerticalPositionMin(
      workbenchState.classificationAndRarity,
    );

    let nextMax: number;
    if (workbenchState.sideLayoutFlow === 'fluid') {
      const computedMax =
        computeImageRightVerticalPositionMaxFromCardHeightPx(heightPx);
      nextMax = Math.max(computedMax, nextMin);
    } else {
      nextMax = Math.max(imageRightVerticalPositionRange.max, nextMin);
    }

    setVerticalPositionMax(nextMax);

    const current = imageRightVerticalPositionRef.current;
    if (current > nextMax) {
      setWorkbenchField('imageRightVerticalPosition', nextMax);
    } else if (current < nextMin) {
      setWorkbenchField('imageRightVerticalPosition', nextMin);
    }
  }, [cardRef, setWorkbenchField, workbenchStateTriggerKey]);

  return {
    min: verticalPositionMin,
    max: verticalPositionMax,
    measuredCardSurfaceHeightPx,
  };
}
