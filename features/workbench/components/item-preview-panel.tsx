'use client';

import type { RefObject } from 'react';

import type { MagicItemWorkbenchState } from '../lib/workbench-options';
import { PreviewSurface } from './preview-surface';

interface ItemPreviewPanelProps {
  cardRef: RefObject<HTMLDivElement | null>;
  workbenchState: MagicItemWorkbenchState;
}

export function ItemPreviewPanel({
  cardRef,
  workbenchState,
}: ItemPreviewPanelProps) {
  return <PreviewSurface cardRef={cardRef} workbenchState={workbenchState} />;
}
