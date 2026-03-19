'use client';

import type { RefObject } from 'react';
import { Card, CardContent } from '@/components/ui/card';

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
  return (
    <Card className="h-full border border-border/60 bg-card/65 backdrop-blur-sm">
      <CardContent className="h-full">
        <PreviewSurface cardRef={cardRef} workbenchState={workbenchState} />
      </CardContent>
    </Card>
  );
}
