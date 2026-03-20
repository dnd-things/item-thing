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
}

export function useImageRightVerticalPositionBounds(
  cardRef: RefObject<HTMLDivElement | null>,
  workbenchState: MagicItemWorkbenchState,
  setWorkbenchField: WorkbenchFieldSetter,
): ImageRightVerticalPositionBounds {
  const verticalPositionMin = getImageRightVerticalPositionMin(
    workbenchState.classificationAndRarity,
  );

  const {
    imageRightVerticalPosition: _omitImageRightVerticalPosition,
    ...workbenchStateSansVerticalPosition
  } = workbenchState;
  const workbenchStateTriggerKey = JSON.stringify(
    workbenchStateSansVerticalPosition,
  );
  void _omitImageRightVerticalPosition;

  const imageRightVerticalPositionRef = useRef(
    workbenchState.imageRightVerticalPosition,
  );
  imageRightVerticalPositionRef.current =
    workbenchState.imageRightVerticalPosition;

  const [verticalPositionMax, setVerticalPositionMax] = useState<number>(
    imageRightVerticalPositionRange.max,
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: workbenchStateTriggerKey remeasures when any preview field except vertical changes; cardLayout alone misses form/image updates.
  useLayoutEffect(() => {
    if (workbenchState.cardLayout !== 'image-right') {
      return;
    }

    const heightPx = cardRef.current?.offsetHeight ?? 0;
    if (heightPx === 0) {
      return;
    }

    const nextMin = getImageRightVerticalPositionMin(
      workbenchState.classificationAndRarity,
    );
    const computedMax =
      computeImageRightVerticalPositionMaxFromCardHeightPx(heightPx);
    const nextMax = Math.max(computedMax, nextMin);

    setVerticalPositionMax(nextMax);

    const current = imageRightVerticalPositionRef.current;
    if (current > nextMax) {
      setWorkbenchField('imageRightVerticalPosition', nextMax);
    } else if (current < nextMin) {
      setWorkbenchField('imageRightVerticalPosition', nextMin);
    }
  }, [cardRef, setWorkbenchField, workbenchStateTriggerKey]);

  return { min: verticalPositionMin, max: verticalPositionMax };
}
