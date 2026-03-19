'use client';

import { toJpeg, toPng } from 'html-to-image';
import type { RefObject } from 'react';
import { useCallback, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Field, FieldLabel } from '@/components/ui/field';
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
  { value: '1', label: '1x' },
  { value: '2', label: '2x' },
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
    <Card className="mx-auto w-fit border border-border/60 bg-card/65 backdrop-blur-sm">
      <CardContent className="flex flex-nowrap items-center gap-10 py-0">
        <div className="flex flex-nowrap items-center gap-4">
          <Field className="flex items-center gap-2 border-0 p-0">
            <FieldLabel className="mb-0 shrink-0 text-sm">Export as</FieldLabel>
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
          </Field>
          <Field className="flex items-center gap-2 border-0 p-0">
            <FieldLabel className="mb-0 shrink-0 text-sm">
              Resolution
            </FieldLabel>
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
          </Field>
        </div>
        <Button
          size="xxl"
          disabled={disabled}
          onClick={() => void handleDownloadClick()}
          aria-disabled={disabled}
          className="shrink-0 min-w-60"
        >
          Download
        </Button>
      </CardContent>
    </Card>
  );
}
