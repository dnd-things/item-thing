'use client';

import { Card, CardContent } from '@/components/ui/card';

import type { MagicItemWorkbenchState } from '../lib/workbench-options';
import { PreviewSurface } from './preview-surface';

interface ItemPreviewPanelProps {
  workbenchState: MagicItemWorkbenchState;
}

export function ItemPreviewPanel({ workbenchState }: ItemPreviewPanelProps) {
  return (
    <Card className="h-full border border-border/60 bg-card/65 backdrop-blur-sm">
      <CardContent className="h-full">
        <PreviewSurface workbenchState={workbenchState} />
      </CardContent>
    </Card>
  );
}
