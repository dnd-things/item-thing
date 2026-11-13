'use client';

import type { RefObject } from 'react';

import type { MagicItemWorkbenchState } from '../lib/workbench-options';
import { PreviewSurface } from './preview-surface';

interface ItemPreviewPanelProps {
  cardRef: RefObject<HTMLDivElement | null>;
  workbenchState: MagicItemWorkbenchState;
  artworkLogicalWidth?: number;
  artworkLogicalHeight?: number;
}

export function ItemPreviewPanel({
  cardRef,
  workbenchState,
  artworkLogicalWidth,
  artworkLogicalHeight,
}: ItemPreviewPanelProps) {
  return (
    <PreviewSurface
      cardRef={cardRef}
      workbenchState={workbenchState}
      {...(artworkLogicalWidth !== undefined &&
      artworkLogicalHeight !== undefined
        ? { artworkLogicalWidth, artworkLogicalHeight }
        : {})}
    />
  );
}
