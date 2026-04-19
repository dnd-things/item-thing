'use client';

import {
  BorderNone01Icon,
  CircleIcon,
  Settings01Icon,
} from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import type { RefObject } from 'react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

import { getImageFramePresetFieldValues } from '../lib/image-frame-preset';
import { useImageRightVerticalPositionBounds } from '../lib/use-image-right-vertical-position-bounds';
import {
  cardStyleOptions,
  type MagicItemWorkbenchState,
  type WorkbenchFieldSetter,
} from '../lib/workbench-options';
import { ItemPreviewPanel } from './item-preview-panel';
import { WorkbenchSettingsDrawer } from './workbench-settings-drawer';

type QuickLayoutValue = 'stacked' | 'compact';

type ImageFramePresetValue = 'borderless' | 'bordered';

function deriveImageFramePreset(
  workbenchState: MagicItemWorkbenchState,
): ImageFramePresetValue | '' {
  const { imageBorderWidthPx, imageBorderRadius, imageAspectRatio } =
    workbenchState;
  if (
    imageBorderWidthPx === 0 &&
    imageBorderRadius === 0 &&
    imageAspectRatio === 'based-on-image'
  ) {
    return 'borderless';
  }
  if (
    imageBorderWidthPx === 5 &&
    imageBorderRadius === 100 &&
    imageAspectRatio === 'square'
  ) {
    return 'bordered';
  }
  return '';
}

function applyImageFramePreset(
  setWorkbenchField: WorkbenchFieldSetter,
  preset: ImageFramePresetValue,
): void {
  const values = getImageFramePresetFieldValues(preset);
  setWorkbenchField('imageBorderWidthPx', values.imageBorderWidthPx);
  setWorkbenchField('imageBorderRadius', values.imageBorderRadius);
  setWorkbenchField('imageAspectRatio', values.imageAspectRatio);
}

function deriveQuickLayout(
  workbenchState: MagicItemWorkbenchState,
): QuickLayoutValue | '' {
  if (workbenchState.cardLayout === 'vertical') return 'stacked';
  if (
    workbenchState.cardLayout === 'image-right' &&
    workbenchState.sideLayoutFlow === 'fluid'
  )
    return 'compact';
  return '';
}

interface PreviewColumnProps {
  cardRef: RefObject<HTMLDivElement | null>;
  showAdvancedWorkbenchControls: boolean;
  workbenchState: MagicItemWorkbenchState;
  setWorkbenchField: WorkbenchFieldSetter;
}

export function PreviewColumn({
  cardRef,
  showAdvancedWorkbenchControls,
  workbenchState,
  setWorkbenchField,
}: PreviewColumnProps) {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const imageRightVerticalPositionBounds = useImageRightVerticalPositionBounds(
    cardRef,
    workbenchState,
    setWorkbenchField,
  );

  const quickLayout = deriveQuickLayout(workbenchState);
  const imageFramePreset = deriveImageFramePreset(workbenchState);

  function handleQuickLayoutChange(value: string) {
    if (value === 'stacked') {
      setWorkbenchField('cardLayout', 'vertical');
      setWorkbenchField('sideLayoutFlow', 'fixed');
    } else if (value === 'compact') {
      setWorkbenchField('cardLayout', 'image-right');
      setWorkbenchField('sideLayoutFlow', 'fluid');
    }
  }

  return (
    <div className="flex h-full flex-col gap-3">
      <div
        data-print-hide
        className="flex items-center gap-2 rounded-xl border border-primary/6 bg-card/40 px-3 py-2 backdrop-blur-lg"
      >
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <div className="flex w-32 shrink-0 items-center">
            <Select
              items={cardStyleOptions}
              value={workbenchState.cardStyle}
              onValueChange={(nextValue) => {
                if (nextValue) {
                  setWorkbenchField(
                    'cardStyle',
                    nextValue as MagicItemWorkbenchState['cardStyle'],
                  );
                }
              }}
            >
              <SelectTrigger id="quick-card-style" className="w-full min-w-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {cardStyleOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>

          <div
            aria-hidden
            className="hidden h-5 w-px bg-linear-to-b from-transparent via-muted-foreground/15 to-transparent sm:block"
          />

          <ToggleGroup
            value={quickLayout ? [quickLayout] : []}
            variant="outline"
            onValueChange={(nextValues) => {
              const nextValue = nextValues[nextValues.length - 1];
              if (nextValue) {
                handleQuickLayoutChange(nextValue);
              }
            }}
          >
            <ToggleGroupItem value="stacked" aria-label="Stacked layout">
              Stacked
            </ToggleGroupItem>
            <ToggleGroupItem value="compact" aria-label="Compact layout">
              Compact
            </ToggleGroupItem>
          </ToggleGroup>

          <div
            aria-hidden
            className="hidden h-5 w-px bg-linear-to-b from-transparent via-muted-foreground/15 to-transparent sm:block"
          />

          <ToggleGroup
            value={imageFramePreset ? [imageFramePreset] : []}
            variant="outline"
            onValueChange={(nextValues) => {
              const nextValue = nextValues[nextValues.length - 1];
              if (nextValue) {
                applyImageFramePreset(
                  setWorkbenchField,
                  nextValue as ImageFramePresetValue,
                );
              }
            }}
          >
            <ToggleGroupItem
              value="borderless"
              aria-label="Borderless image frame"
            >
              <HugeiconsIcon icon={BorderNone01Icon} strokeWidth={1.5} />
            </ToggleGroupItem>
            <ToggleGroupItem value="bordered" aria-label="Bordered image frame">
              <HugeiconsIcon icon={CircleIcon} strokeWidth={1.5} />
            </ToggleGroupItem>
          </ToggleGroup>
        </div>

        {showAdvancedWorkbenchControls ? (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Open card settings"
            className="shrink-0 text-muted-foreground hover:text-foreground"
            onClick={() => setIsDrawerOpen(true)}
          >
            <HugeiconsIcon icon={Settings01Icon} strokeWidth={1.5} />
          </Button>
        ) : null}
      </div>

      <ItemPreviewPanel
        cardRef={cardRef}
        workbenchState={workbenchState}
        {...(workbenchState.cardLayout === 'image-right' &&
        workbenchState.sideLayoutFlow === 'fixed'
          ? {
              cardPreviewSurfaceHeightPx:
                imageRightVerticalPositionBounds.measuredCardSurfaceHeightPx,
            }
          : {})}
      />

      {showAdvancedWorkbenchControls ? (
        <WorkbenchSettingsDrawer
          open={isDrawerOpen}
          onOpenChange={setIsDrawerOpen}
          imageRightVerticalPositionBounds={imageRightVerticalPositionBounds}
          setWorkbenchField={setWorkbenchField}
          workbenchState={workbenchState}
        />
      ) : null}
    </div>
  );
}
