'use client';

import type { RefObject } from 'react';
import { CardRenderer } from '@/features/card-renderer/card-renderer';
import {
  getCardSurfaceBorderRadius,
  getCardWidth,
  isCardStyleSupported,
} from '@/features/card-renderer/lib/card-renderer-options';
import {
  cardStyleOptions,
  getOptionLabel,
  type MagicItemWorkbenchState,
} from '../lib/workbench-options';

interface PreviewSurfaceProps {
  cardRef: RefObject<HTMLDivElement | null>;
  workbenchState: MagicItemWorkbenchState;
}

export function PreviewSurface({
  cardRef,
  workbenchState,
}: PreviewSurfaceProps) {
  const selectedCardStyleLabel = getOptionLabel(
    cardStyleOptions,
    workbenchState.cardStyle,
  );
  const selectedCardWidth = getCardWidth(workbenchState.cardLayout);
  const selectedCardBorderRadius = getCardSurfaceBorderRadius(
    workbenchState.cardBorderRadius,
  );

  return (
    <div className="flex h-full min-h-[520px] items-center justify-center rounded-2xl border border-dashed border-primary/[0.06] bg-[oklch(0.12_0.004_65/0.35)] p-5 shadow-[inset_0_2px_4px_0_oklch(0_0_0/0.06)]">
      <div data-print-card ref={cardRef}>
        {isCardStyleSupported(workbenchState.cardStyle) ? (
          <CardRenderer {...workbenchState} />
        ) : (
          <div
            className="flex w-full flex-col items-center gap-4 border border-dashed border-primary/8 bg-card/50 px-8 py-10 text-center backdrop-blur-sm"
            style={{
              maxWidth: selectedCardWidth,
              borderRadius: selectedCardBorderRadius,
            }}
          >
            <span className="rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-[11px] font-medium tracking-[0.16em] uppercase text-primary/70">
              {selectedCardStyleLabel}
            </span>
            <div className="space-y-2">
              <h3 className="text-lg font-semibold text-foreground">
                Renderer not implemented yet
              </h3>
              <p className="text-sm leading-6 text-muted-foreground">
                The {selectedCardStyleLabel.toLowerCase()} style is still
                pending. Switch to Print to preview the card renderer.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
