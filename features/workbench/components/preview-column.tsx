'use client';

import {
  BorderNone01Icon,
  CircleIcon,
  Settings01Icon,
} from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import dynamic from 'next/dynamic';
import type { RefObject } from 'react';
import { Fragment, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Toggle } from '@/components/ui/toggle';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  cardWidthPxStep,
  getCardWidthPxRange,
} from '@/features/card-renderer/lib/card-renderer-options';
import {
  controlsForPlacement,
  type ImageFramePresetValue,
  readBasicChoice,
  type WorkbenchControlId,
} from '@/features/card-renderer/lib/card-style';
import { useMinimalArtworkTheme } from '@/features/card-renderer/lib/use-minimal-artwork-theme';
import type { WorkbenchEditHandler } from '../lib/edit-workbench';
import { useImageRightVerticalPositionBounds } from '../lib/use-image-right-vertical-position-bounds';
import {
  cardBorderRadiusOptions,
  cardStyleOptions,
  type MagicItemWorkbenchState,
  type WorkbenchFieldSetter,
} from '../lib/workbench-options';
import { ArtworkColorSourceControl } from './artwork-color-source-control';
import { ItemPreviewPanel } from './item-preview-panel';
import { ToggleField } from './workbench-field-controls';

const WorkbenchSettingsDrawer = dynamic(
  () =>
    import('./workbench-settings-drawer').then(
      (module) => module.WorkbenchSettingsDrawer,
    ),
  { ssr: false },
);

interface PreviewColumnProps {
  cardRef: RefObject<HTMLDivElement | null>;
  showAdvancedWorkbenchControls: boolean;
  workbenchState: MagicItemWorkbenchState;
  onWorkbenchEdit: WorkbenchEditHandler;
  artworkLogicalWidth?: number;
  artworkLogicalHeight?: number;
}

export function PreviewColumn({
  cardRef,
  showAdvancedWorkbenchControls,
  workbenchState,
  onWorkbenchEdit,
  artworkLogicalWidth,
  artworkLogicalHeight,
}: PreviewColumnProps) {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [hasOpenedSettings, setHasOpenedSettings] = useState(false);
  const setWorkbenchField: WorkbenchFieldSetter = (fieldName, fieldValue) => {
    onWorkbenchEdit({ kind: 'field', key: fieldName, value: fieldValue });
  };
  const imageRightVerticalPositionBounds = useImageRightVerticalPositionBounds(
    cardRef,
    workbenchState,
    setWorkbenchField,
  );
  const basicControls = controlsForPlacement(workbenchState.cardStyle, 'basic');

  const quickLayout = readBasicChoice(workbenchState, 'quickLayout');
  const imageFramePreset = readBasicChoice(workbenchState, 'imageFrame');
  const cardWidthRange = getCardWidthPxRange(workbenchState.cardLayout);
  const minimalArtworkTheme = useMinimalArtworkTheme(
    workbenchState.imagePreviewUrl,
    workbenchState.artworkColorSource,
    workbenchState.artworkCustomColor,
  );
  const isArtworkColorControlDisabled =
    workbenchState.imagePreviewUrl.trim().length === 0 ||
    (workbenchState.cardStyle === 'print' &&
      workbenchState.imageBorderWidthPx <= 0);
  const artworkColorControlDisabledReason =
    workbenchState.imagePreviewUrl.trim().length === 0
      ? 'Add artwork to choose a color source'
      : workbenchState.cardStyle === 'print' &&
          workbenchState.imageBorderWidthPx <= 0
        ? 'Add an artwork border to choose its color'
        : undefined;

  function renderBasicControl(controlId: WorkbenchControlId) {
    switch (controlId) {
      case 'quickLayout':
        return (
          <ToggleGroup
            value={quickLayout ? [quickLayout] : []}
            variant="outline"
            onValueChange={(nextValues) => {
              const nextValue = nextValues[nextValues.length - 1];
              if (nextValue === 'stacked' || nextValue === 'compact') {
                onWorkbenchEdit({ kind: 'quick-layout', value: nextValue });
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
                onWorkbenchEdit({
                  kind: 'image-frame',
                  value: nextValue as ImageFramePresetValue,
                });
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
                onWorkbenchEdit({
                  kind: 'field',
                  key: 'cardBorderRadius',
                  value,
                });
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
                onWorkbenchEdit({
                  kind: 'field',
                  key: 'cardWidthAuto',
                  value: pressed,
                });
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
                    onWorkbenchEdit({
                      kind: 'card-width-px',
                      value: nextCardWidth,
                    });
                  }
                }}
              />
            </div>
          </div>
        );
      case 'artworkColorSource':
        return (
          <ArtworkColorSourceControl
            customColor={workbenchState.artworkCustomColor}
            disabled={isArtworkColorControlDisabled}
            disabledReason={artworkColorControlDisabledReason}
            labelHidden
            showCustomColor={false}
            source={workbenchState.artworkColorSource}
            swatches={minimalArtworkTheme.swatches}
            onCustomColorChange={(value) => {
              onWorkbenchEdit({ kind: 'artwork-custom-color', value });
            }}
            onSourceChange={(value) => {
              onWorkbenchEdit({
                kind: 'field',
                key: 'artworkColorSource',
                value,
              });
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
                onWorkbenchEdit({ kind: 'field', key: 'cardStyle', value });
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
            onClick={() => {
              setHasOpenedSettings(true);
              setIsDrawerOpen(true);
            }}
          >
            <HugeiconsIcon icon={Settings01Icon} strokeWidth={1.5} />
          </Button>
        ) : null}
      </div>

      <ItemPreviewPanel
        cardRef={cardRef}
        workbenchState={workbenchState}
        {...(artworkLogicalWidth !== undefined &&
        artworkLogicalHeight !== undefined
          ? { artworkLogicalWidth, artworkLogicalHeight }
          : {})}
      />

      {showAdvancedWorkbenchControls && (hasOpenedSettings || isDrawerOpen) ? (
        <WorkbenchSettingsDrawer
          artworkColorControlDisabled={isArtworkColorControlDisabled}
          artworkColorControlDisabledReason={artworkColorControlDisabledReason}
          artworkColorSwatches={minimalArtworkTheme.swatches}
          open={isDrawerOpen}
          onOpenChange={setIsDrawerOpen}
          imageRightVerticalPositionBounds={imageRightVerticalPositionBounds}
          onWorkbenchEdit={onWorkbenchEdit}
          workbenchState={workbenchState}
        />
      ) : null}
    </div>
  );
}
