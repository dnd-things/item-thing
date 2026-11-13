'use client';

import { type RefObject, useLayoutEffect, useRef, useState } from 'react';

import {
  type ImageRightVerticalSurface,
  reconcileImageRightVerticalPosition,
} from '@/features/card-renderer/lib/image-right-artwork-placement';

import type {
  MagicItemWorkbenchState,
  WorkbenchFieldSetter,
} from './workbench-options';

export interface ImageRightVerticalPositionBounds {
  min: number;
  max: number;
  sliderPercent: number;
}

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
  const workbenchStateTriggerKey =
    buildImageRightVerticalPositionMeasureKey(workbenchState);

  const imageRightVerticalPositionRef = useRef(
    workbenchState.imageRightVerticalPosition,
  );
  imageRightVerticalPositionRef.current =
    workbenchState.imageRightVerticalPosition;

  const [measuredSurfaceHeightPx, setMeasuredSurfaceHeightPx] = useState<
    number | null
  >(null);

  const renderSurface: ImageRightVerticalSurface =
    measuredSurfaceHeightPx === null
      ? { kind: 'unmeasured' }
      : { kind: 'measured', heightPx: measuredSurfaceHeightPx };

  const reconciled = reconcileImageRightVerticalPosition({
    cardLayout: workbenchState.cardLayout,
    sideLayoutFlow: workbenchState.sideLayoutFlow,
    classificationAndRarity: workbenchState.classificationAndRarity,
    surface: renderSurface,
    stored: workbenchState.imageRightVerticalPosition,
  });

  // biome-ignore lint/correctness/useExhaustiveDependencies: workbenchStateTriggerKey remeasures when layout-affecting fields change (not vertical position); excludes huge imagePreviewUrl payload.
  useLayoutEffect(() => {
    if (workbenchState.cardLayout !== 'image-right') {
      return;
    }

    const heightPx = cardRef.current?.offsetHeight ?? 0;
    setMeasuredSurfaceHeightPx(heightPx);

    const measureReconciled = reconcileImageRightVerticalPosition({
      cardLayout: workbenchState.cardLayout,
      sideLayoutFlow: workbenchState.sideLayoutFlow,
      classificationAndRarity: workbenchState.classificationAndRarity,
      surface: { kind: 'measured', heightPx },
      stored: imageRightVerticalPositionRef.current,
    });

    if (measureReconciled.stored !== imageRightVerticalPositionRef.current) {
      setWorkbenchField('imageRightVerticalPosition', measureReconciled.stored);
    }
  }, [cardRef, setWorkbenchField, workbenchStateTriggerKey]);

  return {
    min: reconciled.bounds.min,
    max: reconciled.bounds.max,
    sliderPercent: reconciled.sliderPercent,
  };
}
