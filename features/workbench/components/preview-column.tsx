'use client';

import {
  AlignVerticalCenterIcon,
  BorderAll02Icon,
  BorderNone01Icon,
  CircleIcon,
  Settings01Icon,
  SquareIcon,
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
import { Slider } from '@/components/ui/slider';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

import {
  imageBorderRadiusRange,
  imageRightVerticalPositionUserRange,
  mapImageRightVerticalPositionToUserPercent,
  mapUserPercentToImageRightVerticalPosition,
} from '@/features/card-renderer/lib/card-renderer-options';
import { useImageRightVerticalPositionBounds } from '../lib/use-image-right-vertical-position-bounds';
import {
  cardStyleOptions,
  type MagicItemWorkbenchState,
  type WorkbenchFieldSetter,
} from '../lib/workbench-options';
import { ItemPreviewPanel } from './item-preview-panel';
import { WorkbenchSettingsDrawer } from './workbench-settings-drawer';

type QuickLayoutValue = 'stacked' | 'compact';
type QuickImageShapeValue = 'rect' | 'circle';

function deriveQuickImageShape(
  workbenchState: MagicItemWorkbenchState,
): QuickImageShapeValue | '' {
  if (workbenchState.imageBorderRadius === 0) return 'rect';
  if (workbenchState.imageBorderRadius === imageBorderRadiusRange.max)
    return 'circle';
  return '';
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
  workbenchState: MagicItemWorkbenchState;
  setWorkbenchField: WorkbenchFieldSetter;
}

export function PreviewColumn({
  cardRef,
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
  const quickImageShape = deriveQuickImageShape(workbenchState);

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
            value={quickImageShape ? [quickImageShape] : []}
            variant="outline"
            onValueChange={(nextValues) => {
              const nextValue = nextValues[nextValues.length - 1];
              if (nextValue === 'rect') {
                setWorkbenchField('imageBorderRadius', 0);
              } else if (nextValue === 'circle') {
                setWorkbenchField(
                  'imageBorderRadius',
                  imageBorderRadiusRange.max,
                );
                setWorkbenchField('imageAspectRatio', 'square');
              }
            }}
          >
            <ToggleGroupItem value="rect" aria-label="Rectangle image">
              <HugeiconsIcon icon={SquareIcon} strokeWidth={1.5} />
            </ToggleGroupItem>
            <ToggleGroupItem value="circle" aria-label="Circle image">
              <HugeiconsIcon icon={CircleIcon} strokeWidth={1.5} />
            </ToggleGroupItem>
          </ToggleGroup>

          <ToggleGroup
            value={[workbenchState.imageBorder]}
            variant="outline"
            onValueChange={(nextValues) => {
              const nextValue = nextValues[nextValues.length - 1];
              if (nextValue) {
                setWorkbenchField(
                  'imageBorder',
                  nextValue as MagicItemWorkbenchState['imageBorder'],
                );
              }
            }}
          >
            <ToggleGroupItem value="none" aria-label="No image border">
              <HugeiconsIcon icon={BorderNone01Icon} strokeWidth={1.5} />
            </ToggleGroupItem>
            <ToggleGroupItem value="thin" aria-label="Thin image border">
              <HugeiconsIcon icon={BorderAll02Icon} strokeWidth={1.5} />
            </ToggleGroupItem>
            <ToggleGroupItem value="thick" aria-label="Thick image border">
              <HugeiconsIcon icon={BorderAll02Icon} strokeWidth={3} />
            </ToggleGroupItem>
          </ToggleGroup>
        </div>

        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Open card settings"
          className="shrink-0 text-muted-foreground hover:text-foreground"
          onClick={() => setIsDrawerOpen(true)}
        >
          <HugeiconsIcon icon={Settings01Icon} strokeWidth={1.5} />
        </Button>
      </div>

      {workbenchState.cardLayout === 'image-right' ? (
        <div
          data-print-hide
          className="flex h-9 items-center gap-3 rounded-xl border border-primary/8 bg-input/10 px-4"
        >
          <HugeiconsIcon
            icon={AlignVerticalCenterIcon}
            strokeWidth={1.5}
            className="size-5 shrink-0 text-muted-foreground"
            aria-hidden
          />
          <Slider
            aria-label="Artwork vertical position"
            id="preview-image-vertical-position"
            value={[
              mapImageRightVerticalPositionToUserPercent(
                workbenchState.imageRightVerticalPosition,
                imageRightVerticalPositionBounds.min,
                imageRightVerticalPositionBounds.max,
              ),
            ]}
            min={imageRightVerticalPositionUserRange.min}
            max={imageRightVerticalPositionUserRange.max}
            step={imageRightVerticalPositionUserRange.step}
            onValueChange={(nextValue) => {
              const nextPercent = Array.isArray(nextValue)
                ? nextValue[0]
                : nextValue;
              if (typeof nextPercent === 'number') {
                setWorkbenchField(
                  'imageRightVerticalPosition',
                  mapUserPercentToImageRightVerticalPosition(
                    nextPercent,
                    imageRightVerticalPositionBounds.min,
                    imageRightVerticalPositionBounds.max,
                  ),
                );
              }
            }}
          />
          <span className="min-w-10 text-right text-sm font-medium text-muted-foreground tabular-nums">
            {mapImageRightVerticalPositionToUserPercent(
              workbenchState.imageRightVerticalPosition,
              imageRightVerticalPositionBounds.min,
              imageRightVerticalPositionBounds.max,
            )}
          </span>
        </div>
      ) : null}

      <ItemPreviewPanel cardRef={cardRef} workbenchState={workbenchState} />

      <WorkbenchSettingsDrawer
        open={isDrawerOpen}
        onOpenChange={setIsDrawerOpen}
        setWorkbenchField={setWorkbenchField}
        workbenchState={workbenchState}
      />
    </div>
  );
}
