'use client';

import type { RefObject } from 'react';
import { CardRenderer } from '@/features/card-renderer/card-renderer';
import { getResolvedCardWidthPx } from '@/features/card-renderer/lib/card-renderer-options';
import type { PreparedCardExport } from '../lib/export-card-artwork';

interface CardExportSurfaceProps {
  prepared: PreparedCardExport;
  surfaceRef: RefObject<HTMLDivElement | null>;
  exportGeneration?: number;
}

export function CardExportSurface({
  prepared,
  surfaceRef,
  exportGeneration,
}: CardExportSurfaceProps) {
  const { state } = prepared.captured;
  const width = getResolvedCardWidthPx(
    state.cardLayout,
    state.cardWidthAuto,
    state.cardWidthPx,
  );
  const bundle = prepared.captured.bundle;

  return (
    <div
      aria-hidden
      style={{
        position: 'fixed',
        left: 0,
        top: 0,
        width,
        opacity: 0,
        pointerEvents: 'none',
        zIndex: -1,
      }}
    >
      <div ref={surfaceRef} data-print-card style={{ width }}>
        <CardRenderer
          {...state}
          imagePreviewUrl={prepared.preparedUrl}
          artworkDrawPolicy="export"
          preparedArtworkTransformed={prepared.alreadyTransformed}
          {...(exportGeneration !== undefined ? { exportGeneration } : {})}
          cardWidthAuto={false}
          cardWidthPx={width}
          cardPreviewSurfaceHeightPx={
            prepared.captured.cardPreviewSurfaceHeightPx
          }
          {...(bundle
            ? {
                artworkLogicalWidth: bundle.crop.width,
                artworkLogicalHeight: bundle.crop.height,
              }
            : {})}
        />
      </div>
    </div>
  );
}
