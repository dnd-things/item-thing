'use client';

import { toJpeg, toPng, toSvg } from 'html-to-image';
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
  { value: 'svg', label: 'SVG' },
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
        return;
      }
      if (exportFormat === 'svg') {
        const svgString = await toSvg(node);
        const blob = new Blob([svgString], { type: 'image/svg+xml' });
        const url = URL.createObjectURL(blob);
        const filename = getCardDownloadFilename(itemName, 'svg');
        const link = document.createElement('a');
        link.download = filename;
        link.href = url;
        link.click();
        URL.revokeObjectURL(url);
      }
    } catch {
      // TODO: surface error to user
    }
  }, [cardRef, getItemName, exportFormat, resolution]);

  const handleDownloadClick = useCallback(async () => {
    if (onBeforeDownload && !(await onBeforeDownload())) return;
    await handleDownload();
  }, [onBeforeDownload, handleDownload]);

  const isResolutionDisabled = exportFormat === 'svg';

  return (
    <Card className="mx-auto w-fit border border-border/60 bg-card/65 backdrop-blur-sm">
      <CardContent className="flex flex-nowrap items-center gap-10 py-4">
        <div className="flex flex-nowrap items-center gap-4">
          <Field className="flex items-center gap-2 border-0 p-0">
            <FieldLabel className="mb-0 shrink-0 text-sm">Export as</FieldLabel>
            <ToggleGroup
              className="w-fit flex-nowrap"
              value={[exportFormat]}
              variant="outline"
              onValueChange={(nextValue) => {
                const next = nextValue[0];
                if (next === 'png' || next === 'jpg' || next === 'svg') {
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
              {isResolutionDisabled ? (
                <span className="ml-1 font-normal text-muted-foreground">
                  (N/A for vector)
                </span>
              ) : null}
            </FieldLabel>
            <ToggleGroup
              className="w-fit flex-nowrap"
              value={[String(resolution)]}
              variant="outline"
              disabled={isResolutionDisabled}
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
          size="lg"
          disabled={disabled}
          onClick={() => void handleDownloadClick()}
          aria-disabled={disabled}
          className="shrink-0"
        >
          Download
        </Button>
      </CardContent>
    </Card>
  );
}
