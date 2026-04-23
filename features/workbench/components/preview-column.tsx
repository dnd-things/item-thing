'use client';

import {
  BorderNone01Icon,
  CircleIcon,
  Settings01Icon,
} from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import type { RefObject } from 'react';
import { Fragment, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Toggle } from '@/components/ui/toggle';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  cardWidthPxStep,
  getCardWidthPxRange,
  getDefaultCardWidthPx,
} from '@/features/card-renderer/lib/card-renderer-options';
import { useMinimalArtworkTheme } from '@/features/card-renderer/lib/use-minimal-artwork-theme';

import {
  getWorkbenchControlsForPlacement,
  type WorkbenchControlId,
} from '../lib/card-style-capability-registry';
import {
  getImageFramePresetFieldValues,
  type ImageFramePresetValue,
} from '../lib/image-frame-preset';
import { useImageRightVerticalPositionBounds } from '../lib/use-image-right-vertical-position-bounds';
import {
  cardBorderRadiusOptions,
  cardStyleOptions,
  type MagicItemWorkbenchState,
  type WorkbenchFieldSetter,
} from '../lib/workbench-options';
import { ItemPreviewPanel } from './item-preview-panel';
import { MinimalArtworkThemeSourceControl } from './minimal-artwork-theme-source-control';
import { ToggleField } from './workbench-field-controls';
import { WorkbenchSettingsDrawer } from './workbench-settings-drawer';

type QuickLayoutValue = 'stacked' | 'compact';

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
  if (workbenchState.cardLayout === 'vertical') {
    return 'stacked';
  }
  if (
    workbenchState.cardLayout === 'image-right' &&
    workbenchState.sideLayoutFlow === 'fluid'
  ) {
    return 'compact';
  }
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
  const basicControls = getWorkbenchControlsForPlacement(
    workbenchState.cardStyle,
    'basic',
  );

  const quickLayout = deriveQuickLayout(workbenchState);
  const imageFramePreset = deriveImageFramePreset(workbenchState);
  const cardWidthRange = getCardWidthPxRange(workbenchState.cardLayout);
  const minimalArtworkTheme = useMinimalArtworkTheme(
    workbenchState.imagePreviewUrl,
    workbenchState.minimalArtworkThemeSource,
    workbenchState.minimalArtworkThemeCustomColor,
  );

  function handleQuickLayoutChange(value: string) {
    if (value === 'stacked') {
      setWorkbenchField('cardLayout', 'vertical');
      setWorkbenchField('sideLayoutFlow', 'fixed');
      setWorkbenchField('cardWidthPx', getDefaultCardWidthPx('vertical'));
    } else if (value === 'compact') {
      setWorkbenchField('cardLayout', 'image-right');
      setWorkbenchField('sideLayoutFlow', 'fluid');
      setWorkbenchField('cardWidthPx', getDefaultCardWidthPx('image-right'));
    }
  }

  function renderBasicControl(controlId: WorkbenchControlId) {
    switch (controlId) {
      case 'quickLayout':
        return (
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
        );
      case 'imageFramePreset':
        return (
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
        );
      case 'cardBorderRadius':
        return (
          <div className="min-w-36">
            <ToggleField
              fieldLabel="Card corner"
              labelHidden
              options={cardBorderRadiusOptions}
              value={workbenchState.cardBorderRadius}
              onValueChange={(value) => {
                setWorkbenchField('cardBorderRadius', value);
              }}
            />
          </div>
        );
      case 'cardWidth':
        return (
          <div className="flex shrink-0 items-center gap-2">
            <Toggle
              aria-label="Use automatic card width"
              pressed={workbenchState.cardWidthAuto}
              variant="outline"
              className="rounded-full"
              onPressedChange={(pressed) => {
                setWorkbenchField('cardWidthAuto', pressed);
                if (pressed) {
                  setWorkbenchField(
                    'cardWidthPx',
                    getDefaultCardWidthPx(workbenchState.cardLayout),
                  );
                }
              }}
            >
              Auto
            </Toggle>
            <div className="flex w-28 shrink-0 items-center rounded-full border border-border/70 bg-input/15 px-3 py-1.5 lg:w-36">
              <Slider
                id="quick-card-width"
                aria-label="Card width"
                value={[workbenchState.cardWidthPx]}
                min={cardWidthRange.min}
                max={cardWidthRange.max}
                step={cardWidthPxStep}
                disabled={workbenchState.cardWidthAuto}
                className="w-full"
                onValueChange={(nextValue) => {
                  const nextCardWidth = Array.isArray(nextValue)
                    ? nextValue[0]
                    : nextValue;

                  if (typeof nextCardWidth === 'number') {
                    setWorkbenchField('cardWidthAuto', false);
                    setWorkbenchField('cardWidthPx', nextCardWidth);
                  }
                }}
              />
            </div>
          </div>
        );
      case 'minimalArtworkThemeSource':
        return (
          <MinimalArtworkThemeSourceControl
            customColor={workbenchState.minimalArtworkThemeCustomColor}
            labelHidden
            showCustomColor={false}
            source={workbenchState.minimalArtworkThemeSource}
            swatches={minimalArtworkTheme.swatches}
            onCustomColorChange={(value) => {
              setWorkbenchField('minimalArtworkThemeCustomColor', value);
              setWorkbenchField('minimalArtworkThemeSource', 'custom');
            }}
            onSourceChange={(value) => {
              setWorkbenchField('minimalArtworkThemeSource', value);
            }}
          />
        );
      default:
        return null;
    }
  }

  return (
    <div className="flex h-full flex-col gap-3">
      <div
        data-print-hide
        className="flex items-center gap-2 rounded-xl border border-primary/6 bg-card/40 px-3 py-2 backdrop-blur-lg"
      >
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <div className="min-w-32 shrink-0">
            <ToggleField
              fieldLabel="Style"
              labelHidden
              options={cardStyleOptions}
              value={workbenchState.cardStyle}
              onValueChange={(value) => {
                setWorkbenchField('cardStyle', value);
              }}
            />
          </div>

          {basicControls.map((controlId, index) => (
            <Fragment key={controlId}>
              {index > 0 ? (
                <div
                  aria-hidden
                  className="hidden h-5 w-px bg-linear-to-b from-transparent via-muted-foreground/15 to-transparent sm:block"
                />
              ) : null}
              {renderBasicControl(controlId)}
            </Fragment>
          ))}
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
          minimalArtworkThemeSwatches={minimalArtworkTheme.swatches}
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
