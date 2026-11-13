'use client';

import {
  AlignVerticalCenterIcon,
  ImageFlipHorizontalIcon,
  ImageFlipVerticalIcon,
} from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Slider } from '@/components/ui/slider';
import { Toggle } from '@/components/ui/toggle';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import type { ArtworkColorSwatch } from '@/features/card-renderer/lib/artwork-color-source';
import {
  cardWidthPxStep,
  clampImageBorderWidthPx,
  getCardWidthPxRange,
  imageBorderRadiusRange,
  imageBorderWidthPxRange,
} from '@/features/card-renderer/lib/card-renderer-options';
import {
  controlsForPlacement,
  type WorkbenchControlId,
} from '@/features/card-renderer/lib/card-style';
import {
  imageRightVerticalSlider,
  reconcileImageRightVerticalPosition,
  storedImageRightVerticalPositionForSlider,
} from '@/features/card-renderer/lib/image-right-artwork-placement';
import type { WorkbenchEditHandler } from '../lib/edit-workbench';
import type { ImageRightVerticalPositionBounds } from '../lib/use-image-right-vertical-position-bounds';
import {
  cardBorderRadiusOptions,
  cardLayoutOptions,
  cardStyleOptions,
  imageAspectRatioOptions,
  imageFlipToggleOptions,
  type MagicItemWorkbenchState,
  sideLayoutFlowOptions,
  type WorkbenchFieldSetter,
} from '../lib/workbench-options';
import {
  IMAGE_ROTATION_DEGREES_STEP,
  normalizeImageRotationDegrees,
} from '../lib/workbench-persistence';
import { ArtworkColorSourceControl } from './artwork-color-source-control';
import { ToggleField, ToolbarSelectField } from './workbench-field-controls';

interface WorkbenchSettingsDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onWorkbenchEdit: WorkbenchEditHandler;
  workbenchState: MagicItemWorkbenchState;
  artworkColorControlDisabled: boolean;
  artworkColorControlDisabledReason?: string | undefined;
  imageRightVerticalPositionBounds?: ImageRightVerticalPositionBounds;
  artworkColorSwatches: ReadonlyArray<ArtworkColorSwatch>;
}

export function WorkbenchSettingsDrawer({
  open,
  onOpenChange,
  onWorkbenchEdit,
  workbenchState,
  artworkColorControlDisabled,
  artworkColorControlDisabledReason,
  imageRightVerticalPositionBounds,
  artworkColorSwatches,
}: WorkbenchSettingsDrawerProps) {
  const isTopImageLayout = workbenchState.cardLayout === 'vertical';
  const isImageRightLayout = workbenchState.cardLayout === 'image-right';
  const cardWidthRange = getCardWidthPxRange(workbenchState.cardLayout);
  const advancedControls = controlsForPlacement(
    workbenchState.cardStyle,
    'advanced',
  );

  const imageRightFirstPaint = reconcileImageRightVerticalPosition({
    cardLayout: workbenchState.cardLayout,
    sideLayoutFlow: workbenchState.sideLayoutFlow,
    classificationAndRarity: workbenchState.classificationAndRarity,
    surface: { kind: 'unmeasured' },
    stored: workbenchState.imageRightVerticalPosition,
  });
  const imageRightBoundsMin =
    imageRightVerticalPositionBounds?.min ?? imageRightFirstPaint.bounds.min;
  const imageRightBoundsMax =
    imageRightVerticalPositionBounds?.max ?? imageRightFirstPaint.bounds.max;
  const imageRightSliderPercent =
    imageRightVerticalPositionBounds?.sliderPercent ??
    imageRightFirstPaint.sliderPercent;
  const imageRightSliderBounds = {
    min: imageRightBoundsMin,
    max: imageRightBoundsMax,
  };

  const setWorkbenchField: WorkbenchFieldSetter = (fieldName, fieldValue) => {
    onWorkbenchEdit({ kind: 'field', key: fieldName, value: fieldValue });
  };

  function renderAdvancedControl(controlId: WorkbenchControlId) {
    switch (controlId) {
      case 'cardBorderRadius':
        return (
          <ToggleField
            fieldLabel="Card corner"
            options={cardBorderRadiusOptions}
            value={workbenchState.cardBorderRadius}
            onValueChange={(value) => {
              setWorkbenchField('cardBorderRadius', value);
            }}
          />
        );
      case 'cardLayout':
        return (
          <ToggleField
            fieldLabel="Image position"
            options={cardLayoutOptions}
            value={workbenchState.cardLayout}
            onValueChange={(value) => {
              onWorkbenchEdit({ kind: 'field', key: 'cardLayout', value });
            }}
          />
        );
      case 'sideLayoutFlow':
        return (
          <ToggleField
            fieldLabel="Layout"
            options={sideLayoutFlowOptions}
            value={workbenchState.sideLayoutFlow}
            disabled={isTopImageLayout}
            onValueChange={(value) => {
              onWorkbenchEdit({ kind: 'field', key: 'sideLayoutFlow', value });
            }}
          />
        );
      case 'imageAspectRatio':
        return (
          <ToolbarSelectField
            fieldLabel="Image aspect ratio"
            options={imageAspectRatioOptions}
            triggerId="drawer-image-aspect-ratio"
            value={workbenchState.imageAspectRatio}
            onValueChange={(value) => {
              setWorkbenchField('imageAspectRatio', value);
            }}
          />
        );
      case 'imageBorderRadius':
        return (
          <Field>
            <FieldLabel htmlFor="drawer-image-border-radius">
              Image roundness
            </FieldLabel>
            <div className="flex h-9 items-center gap-3 rounded-xl border border-primary/8 bg-input/10 px-4">
              <Slider
                id="drawer-image-border-radius"
                value={[workbenchState.imageBorderRadius]}
                min={imageBorderRadiusRange.min}
                max={imageBorderRadiusRange.max}
                step={imageBorderRadiusRange.step}
                onValueChange={(nextValue) => {
                  const nextImageBorderRadius = Array.isArray(nextValue)
                    ? nextValue[0]
                    : nextValue;
                  if (typeof nextImageBorderRadius === 'number') {
                    setWorkbenchField(
                      'imageBorderRadius',
                      nextImageBorderRadius,
                    );
                  }
                }}
              />
              <span className="min-w-11 text-right text-sm font-medium text-muted-foreground">
                {workbenchState.imageBorderRadius}%
              </span>
            </div>
          </Field>
        );
      case 'imageBorderWidthPx':
        return (
          <Field>
            <FieldLabel htmlFor="drawer-image-border-width-px">
              Image border width
            </FieldLabel>
            <div className="flex h-9 items-center gap-2 rounded-xl border border-primary/8 bg-input/10 px-4">
              <Input
                id="drawer-image-border-width-px"
                type="number"
                inputMode="numeric"
                min={imageBorderWidthPxRange.min}
                max={imageBorderWidthPxRange.max}
                step={imageBorderWidthPxRange.step}
                className="h-8 min-w-0 flex-1 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
                value={workbenchState.imageBorderWidthPx}
                onChange={(event) => {
                  const nextValue = Number.parseInt(event.target.value, 10);
                  if (Number.isNaN(nextValue)) {
                    setWorkbenchField('imageBorderWidthPx', 0);
                    return;
                  }
                  setWorkbenchField(
                    'imageBorderWidthPx',
                    clampImageBorderWidthPx(nextValue),
                  );
                }}
              />
              <span className="shrink-0 text-sm text-muted-foreground">px</span>
            </div>
          </Field>
        );
      case 'imageSize':
        return (
          <Field>
            <FieldLabel htmlFor="drawer-image-size">Image size</FieldLabel>
            <div className="flex h-9 items-center gap-3 rounded-xl border border-primary/8 bg-input/10 px-4">
              <Slider
                id="drawer-image-size"
                value={[workbenchState.imageSize]}
                min={30}
                max={100}
                step={1}
                onValueChange={(nextValue) => {
                  const nextImageSize = Array.isArray(nextValue)
                    ? nextValue[0]
                    : nextValue;
                  if (typeof nextImageSize === 'number') {
                    setWorkbenchField('imageSize', nextImageSize);
                  }
                }}
              />
              <span className="min-w-11 text-right text-sm font-medium text-muted-foreground">
                {workbenchState.imageSize}%
              </span>
            </div>
          </Field>
        );
      case 'cardWidth':
        return (
          <Field>
            <FieldLabel htmlFor="drawer-card-width">Card width</FieldLabel>
            <div className="flex items-center gap-3">
              <Toggle
                aria-label="Use automatic card width"
                pressed={workbenchState.cardWidthAuto}
                variant="outline"
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
              <div className="flex min-h-9 flex-1 items-center rounded-xl border border-primary/8 bg-input/10 px-4 py-2">
                <Slider
                  id="drawer-card-width"
                  aria-label="Card width"
                  value={[workbenchState.cardWidthPx]}
                  min={cardWidthRange.min}
                  max={cardWidthRange.max}
                  step={cardWidthPxStep}
                  disabled={workbenchState.cardWidthAuto}
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
          </Field>
        );
      case 'imageRightVerticalPosition':
        if (!isImageRightLayout) {
          return null;
        }
        return (
          <Field>
            <FieldLabel htmlFor="drawer-image-vertical-position">
              Artwork vertical position
            </FieldLabel>
            <div className="flex h-9 items-center gap-3 rounded-xl border border-primary/8 bg-input/10 px-4">
              <HugeiconsIcon
                icon={AlignVerticalCenterIcon}
                strokeWidth={1.5}
                className="size-5 shrink-0 text-muted-foreground"
                aria-hidden
              />
              <Slider
                aria-label="Artwork vertical position"
                id="drawer-image-vertical-position"
                value={[imageRightSliderPercent]}
                min={imageRightVerticalSlider.min}
                max={imageRightVerticalSlider.max}
                step={imageRightVerticalSlider.step}
                onValueChange={(nextValue) => {
                  const nextPercent = Array.isArray(nextValue)
                    ? nextValue[0]
                    : nextValue;
                  if (typeof nextPercent === 'number') {
                    setWorkbenchField(
                      'imageRightVerticalPosition',
                      storedImageRightVerticalPositionForSlider(
                        nextPercent,
                        imageRightSliderBounds,
                      ),
                    );
                  }
                }}
              />
              <span className="min-w-10 text-right text-sm font-medium text-muted-foreground tabular-nums">
                {imageRightSliderPercent}
              </span>
            </div>
          </Field>
        );
      case 'imageRotationDegrees':
        return (
          <Field>
            <FieldLabel htmlFor="drawer-image-rotation">
              Image rotation
            </FieldLabel>
            <div className="flex h-9 items-center gap-3 rounded-xl border border-primary/8 bg-input/10 px-4">
              <Slider
                id="drawer-image-rotation"
                aria-label="Image rotation"
                value={[workbenchState.imageRotationDegrees]}
                min={0}
                max={360}
                step={IMAGE_ROTATION_DEGREES_STEP}
                onValueChange={(nextValue) => {
                  const nextDegrees = Array.isArray(nextValue)
                    ? nextValue[0]
                    : nextValue;
                  if (typeof nextDegrees === 'number') {
                    setWorkbenchField(
                      'imageRotationDegrees',
                      normalizeImageRotationDegrees(nextDegrees),
                    );
                  }
                }}
              />
              <span className="min-w-11 text-right text-sm font-medium text-muted-foreground tabular-nums">
                {workbenchState.imageRotationDegrees}°
              </span>
            </div>
          </Field>
        );
      case 'imageFlipHorizontal':
        return (
          <Field>
            <FieldLabel className="flex items-center gap-2">
              <HugeiconsIcon
                icon={ImageFlipHorizontalIcon}
                strokeWidth={1.5}
                className="size-5 shrink-0 text-muted-foreground"
                aria-hidden
              />
              Flip horizontally
            </FieldLabel>
            <ToggleGroup
              className="w-full flex-wrap"
              variant="outline"
              value={[workbenchState.imageFlipHorizontal ? 'on' : 'off']}
              onValueChange={(nextValue) => {
                const nextSelected = nextValue[nextValue.length - 1];
                if (nextSelected === 'on' || nextSelected === 'off') {
                  setWorkbenchField(
                    'imageFlipHorizontal',
                    nextSelected === 'on',
                  );
                }
              }}
            >
              {imageFlipToggleOptions.map((option) => (
                <ToggleGroupItem
                  key={option.value}
                  value={option.value}
                  aria-label={`Flip horizontally ${option.label}`}
                  className="flex-1"
                >
                  {option.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </Field>
        );
      case 'imageFlipVertical':
        return (
          <Field>
            <FieldLabel className="flex items-center gap-2">
              <HugeiconsIcon
                icon={ImageFlipVerticalIcon}
                strokeWidth={1.5}
                className="size-5 shrink-0 text-muted-foreground"
                aria-hidden
              />
              Flip vertically
            </FieldLabel>
            <ToggleGroup
              className="w-full flex-wrap"
              variant="outline"
              value={[workbenchState.imageFlipVertical ? 'on' : 'off']}
              onValueChange={(nextValue) => {
                const nextSelected = nextValue[nextValue.length - 1];
                if (nextSelected === 'on' || nextSelected === 'off') {
                  setWorkbenchField('imageFlipVertical', nextSelected === 'on');
                }
              }}
            >
              {imageFlipToggleOptions.map((option) => (
                <ToggleGroupItem
                  key={option.value}
                  value={option.value}
                  aria-label={`Flip vertically ${option.label}`}
                  className="flex-1"
                >
                  {option.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </Field>
        );
      case 'artworkColorSource':
        return (
          <ArtworkColorSourceControl
            customColor={workbenchState.artworkCustomColor}
            disabled={artworkColorControlDisabled}
            disabledReason={artworkColorControlDisabledReason}
            showCustomColor
            source={workbenchState.artworkColorSource}
            swatches={artworkColorSwatches}
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
    <div data-print-hide>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="right"
          className="flex w-80 flex-col overflow-y-auto"
        >
          <SheetHeader>
            <SheetTitle className="font-display text-lg font-medium tracking-wide text-foreground/80">
              Card Settings
            </SheetTitle>
          </SheetHeader>
          <div className="mx-6 h-px bg-linear-to-r from-primary/20 via-primary/8 to-transparent" />
          <FieldGroup className="flex flex-col gap-6 px-6 py-5">
            <ToolbarSelectField
              fieldLabel="Style"
              options={cardStyleOptions}
              triggerId="drawer-card-style"
              value={workbenchState.cardStyle}
              onValueChange={(value) => {
                setWorkbenchField('cardStyle', value);
              }}
            />
            {advancedControls.map((controlId) => (
              <div key={controlId}>{renderAdvancedControl(controlId)}</div>
            ))}
          </FieldGroup>
        </SheetContent>
      </Sheet>
    </div>
  );
}
