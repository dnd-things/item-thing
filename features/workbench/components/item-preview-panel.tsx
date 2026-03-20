'use client';

import type { RefObject } from 'react';

import type { MagicItemWorkbenchState } from '../lib/workbench-options';
import { PreviewSurface } from './preview-surface';

interface ItemPreviewPanelProps {
  cardRef: RefObject<HTMLDivElement | null>;
  workbenchState: MagicItemWorkbenchState;
  cardPreviewSurfaceHeightPx?: number;
}

export function ItemPreviewPanel({
  cardRef,
  workbenchState,
  cardPreviewSurfaceHeightPx,
}: ItemPreviewPanelProps) {
  return (
    <PreviewSurface
      cardRef={cardRef}
      workbenchState={workbenchState}
      {...(cardPreviewSurfaceHeightPx !== undefined
        ? { cardPreviewSurfaceHeightPx }
        : {})}
    />
  );
}
