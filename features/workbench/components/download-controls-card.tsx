'use client';

import { Download04Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { toJpeg, toPng } from 'html-to-image';
import { type RefObject, useCallback, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { artworkLimitCopy } from '../lib/artwork-geometry';
import {
  assertMeasuredCardOutput,
  type CapturedCardExport,
  completeCapturedExport,
  createCardExportLock,
  materializeBrowserCanonical,
  type PreparedCardExport,
  prepareCapturedExport,
  renderExportArtworkUrl,
  waitForArtworkState,
} from '../lib/export-card-artwork';
import { type DownloadExtension, getCardDownloadFilename } from '../lib/slug';
import type { WorkbenchSnapshotForExport } from '../lib/workbench-snapshot-for-export';
import { CardExportSurface } from './card-export-surface';

const exportFormatOptions: ReadonlyArray<{
  value: DownloadExtension;
  label: string;
}> = [
  { value: 'png', label: 'PNG' },
  { value: 'jpg', label: 'JPG' },
];

const resolutionOptions: ReadonlyArray<{ value: '1' | '2'; label: string }> = [
  { value: '1', label: '1×' },
  { value: '2', label: '2×' },
];

export interface ItemExportCompletePayload {
  exportDataUrl: string;
  exportFormat: DownloadExtension;
  exportPixelRatio: 1 | 2;
  workbenchSnapshot: WorkbenchSnapshotForExport;
  sourceImagePreviewDataUrl: string;
  reuseEpoch: number;
}

interface DownloadControlsCardProps {
  cardRef: RefObject<HTMLDivElement | null>;
  getItemName: () => string;
  disabled?: boolean;
  onBeforeDownload?: () => Promise<boolean>;
  captureExport: (input: {
    format: DownloadExtension;
    pixelRatio: 1 | 2;
  }) => CapturedCardExport;
  onExportComplete?: (
    payload: ItemExportCompletePayload,
  ) => void | Promise<void>;
}

export function DownloadControlsCard({
  cardRef: _cardRef,
  disabled = false,
  onBeforeDownload,
  captureExport,
  onExportComplete,
}: DownloadControlsCardProps) {
  const [exportFormat, setExportFormat] = useState<DownloadExtension>('png');
  const [resolution, setResolution] = useState<1 | 2>(2);
  const [exportError, setExportError] = useState<string | null>(null);
  const [pending, setPending] = useState<PreparedCardExport | null>(null);
  const [exporting, setExporting] = useState(false);
  const exportLock = useRef(createCardExportLock());
  const exportSurfaceRef = useRef<HTMLDivElement>(null);
  const exportGenerationRef = useRef(0);

  const handleDownload = useCallback(async () => {
    try {
      await exportLock.current.run(async () => {
        const exportId = exportGenerationRef.current + 1;
        exportGenerationRef.current = exportId;
        setExporting(true);
        setExportError(null);
        let prepared: PreparedCardExport | null = null;
        try {
          const captured = captureExport({
            format: exportFormat,
            pixelRatio: resolution,
          });
          const filename = getCardDownloadFilename(
            captured.state.itemName,
            captured.format,
          );
          prepared = await prepareCapturedExport(captured, {
            materialize: materializeBrowserCanonical,
            renderTransformedUrl: renderExportArtworkUrl,
          });
          setPending(prepared);
          await new Promise<void>((resolve) => {
            requestAnimationFrame(() => resolve());
          });
          await new Promise<void>((resolve) => {
            requestAnimationFrame(() => resolve());
          });
          const node = exportSurfaceRef.current;
          if (!node || exportGenerationRef.current !== exportId) {
            throw new Error(artworkLimitCopy.cardUnmeasured);
          }
          await document.fonts.ready;
          await waitForArtworkState(node, { generation: exportId });
          assertMeasuredCardOutput(
            node.offsetWidth,
            node.offsetHeight,
            captured.pixelRatio,
          );
          const dataUrl =
            captured.format === 'png'
              ? await toPng(node, {
                  pixelRatio: captured.pixelRatio,
                  skipAutoScale: true,
                })
              : await toJpeg(node, {
                  pixelRatio: captured.pixelRatio,
                  quality: 0.92,
                  skipAutoScale: true,
                });
          const link = document.createElement('a');
          link.download = filename;
          link.href = dataUrl;
          link.click();
          await onExportComplete?.(completeCapturedExport(prepared, dataUrl));
        } finally {
          if (exportGenerationRef.current === exportId) {
            prepared?.release();
            setPending(null);
            setExporting(false);
          }
        }
      });
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === artworkLimitCopy.exportBusy
      ) {
        return;
      }
      setExportError(
        error instanceof Error ? error.message : artworkLimitCopy.artworkFailed,
      );
    }
  }, [captureExport, exportFormat, onExportComplete, resolution]);

  const handleDownloadClick = useCallback(async () => {
    if (exporting) {
      return;
    }
    if (onBeforeDownload && !(await onBeforeDownload())) return;
    await handleDownload();
  }, [exporting, onBeforeDownload, handleDownload]);

  return (
    <div className="export-dock rounded-2xl border border-primary/10 bg-[oklch(0.14_0.008_65/0.9)] px-5 py-4 shadow-[inset_0_1px_0_0_oklch(1_0_0/0.06),0_4px_24px_oklch(0_0_0/0.2)] ring-1 ring-foreground/4 backdrop-blur-2xl sm:px-6">
      {pending ? (
        <CardExportSurface
          prepared={pending}
          surfaceRef={exportSurfaceRef}
          exportGeneration={exportGenerationRef.current}
        />
      ) : null}
      <div className="relative z-1 flex flex-wrap items-center justify-center gap-4 sm:justify-between sm:gap-6">
        <div className="flex items-center gap-5">
          <div className="flex items-center gap-2.5">
            <span className="text-[11px] font-semibold tracking-[0.16em] uppercase text-muted-foreground/50">
              Format
            </span>
            <ToggleGroup
              className="w-fit flex-nowrap"
              value={[exportFormat]}
              variant="outline"
              onValueChange={(nextValue) => {
                const next = nextValue[0];
                if (next === 'png' || next === 'jpg') {
                  setExportFormat(next);
                }
              }}
            >
              {exportFormatOptions.map((option) => (
                <ToggleGroupItem
                  key={option.value}
                  value={option.value}
                  aria-label={option.label}
                >
                  {option.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>

          <div
            aria-hidden
            className="h-5 w-px rounded-full bg-linear-to-b from-transparent via-muted-foreground/20 to-transparent"
          />

          <div className="flex items-center gap-2.5">
            <span className="text-[11px] font-semibold tracking-[0.16em] uppercase text-muted-foreground/50">
              Scale
            </span>
            <ToggleGroup
              className="w-fit flex-nowrap"
              value={[String(resolution)]}
              variant="outline"
              onValueChange={(nextValue) => {
                const next = nextValue[0];
                if (next === '1' || next === '2') {
                  setResolution(next === '1' ? 1 : 2);
                }
              }}
            >
              {resolutionOptions.map((option) => (
                <ToggleGroupItem
                  key={option.value}
                  value={option.value}
                  aria-label={option.label}
                >
                  {option.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
        </div>

        <Button
          variant="accent"
          size="lg"
          disabled={disabled || exporting}
          onClick={() => void handleDownloadClick()}
          aria-disabled={disabled || exporting}
          className="export-button gap-2 px-6 font-semibold"
        >
          <HugeiconsIcon
            icon={Download04Icon}
            className="size-[18px]"
            strokeWidth={2}
          />
          Export
        </Button>
      </div>
      {exportError ? (
        <p
          role="alert"
          className="relative z-1 mt-3 text-center text-sm text-red-300"
        >
          {exportError}
        </p>
      ) : null}
    </div>
  );
}
