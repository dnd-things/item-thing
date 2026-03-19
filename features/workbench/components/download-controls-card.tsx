'use client';

import { Download04Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { toJpeg, toPng } from 'html-to-image';
import type { RefObject } from 'react';
import { useCallback, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { type DownloadExtension, getCardDownloadFilename } from '../lib/slug';

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

interface DownloadControlsCardProps {
  cardRef: RefObject<HTMLDivElement | null>;
  getItemName: () => string;
  disabled?: boolean;
  onBeforeDownload?: () => Promise<boolean>;
}

export function DownloadControlsCard({
  cardRef,
  getItemName,
  disabled = false,
  onBeforeDownload,
}: DownloadControlsCardProps) {
  const [exportFormat, setExportFormat] = useState<DownloadExtension>('png');
  const [resolution, setResolution] = useState<1 | 2>(2);

  const handleDownload = useCallback(async () => {
    const node = cardRef.current;
    if (!node) return;

    const itemName = getItemName();

    try {
      if (exportFormat === 'png') {
        const dataUrl = await toPng(node, { pixelRatio: resolution });
        const filename = getCardDownloadFilename(itemName, 'png');
        const link = document.createElement('a');
        link.download = filename;
        link.href = dataUrl;
        link.click();
        return;
      }
      if (exportFormat === 'jpg') {
        const dataUrl = await toJpeg(node, {
          pixelRatio: resolution,
          quality: 0.92,
        });
        const filename = getCardDownloadFilename(itemName, 'jpg');
        const link = document.createElement('a');
        link.download = filename;
        link.href = dataUrl;
        link.click();
      }
    } catch {
      // TODO: surface error to user
    }
  }, [cardRef, getItemName, exportFormat, resolution]);

  const handleDownloadClick = useCallback(async () => {
    if (onBeforeDownload && !(await onBeforeDownload())) return;
    await handleDownload();
  }, [onBeforeDownload, handleDownload]);

  return (
    <div className="export-dock relative overflow-hidden rounded-2xl border border-primary/[0.08] bg-[oklch(0.15_0.008_65/0.85)] px-5 py-4 shadow-[inset_0_1px_0_0_oklch(1_0_0/0.05)] ring-1 ring-foreground/[0.04] backdrop-blur-2xl sm:px-6">
      <div className="relative flex flex-wrap items-center justify-center gap-4 sm:justify-between sm:gap-6">
        <div className="flex items-center gap-5">
          <div className="flex items-center gap-2.5">
            <span className="text-[11px] font-semibold tracking-[0.16em] uppercase text-muted-foreground/60">
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
            className="h-5 w-px rounded-full bg-gradient-to-b from-transparent via-muted-foreground/20 to-transparent"
          />

          <div className="flex items-center gap-2.5">
            <span className="text-[11px] font-semibold tracking-[0.16em] uppercase text-muted-foreground/60">
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
          disabled={disabled}
          onClick={() => void handleDownloadClick()}
          aria-disabled={disabled}
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
    </div>
  );
}
