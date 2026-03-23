'use client';

import {
  AlignVerticalCenterIcon,
  ImageFlipHorizontalIcon,
  ImageFlipVerticalIcon,
} from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Slider } from '@/components/ui/slider';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  imageBorderRadiusRange,
  imageRightVerticalPositionRange,
  imageRightVerticalPositionUserRange,
  mapImageRightVerticalPositionToUserPercent,
  mapUserPercentToImageRightVerticalPosition,
} from '@/features/card-renderer/lib/card-renderer-options';

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
import { ToggleField, ToolbarSelectField } from './workbench-field-controls';

interface WorkbenchSettingsDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  setWorkbenchField: WorkbenchFieldSetter;
  workbenchState: MagicItemWorkbenchState;
  imageRightVerticalPositionBounds?: ImageRightVerticalPositionBounds;
}

export function WorkbenchSettingsDrawer({
  open,
  onOpenChange,
  setWorkbenchField,
  workbenchState,
  imageRightVerticalPositionBounds,
}: WorkbenchSettingsDrawerProps) {
  const isTopImageLayout = workbenchState.cardLayout === 'vertical';
  const isImageRightLayout = workbenchState.cardLayout === 'image-right';

  const imageRightBoundsMin =
    imageRightVerticalPositionBounds?.min ??
    imageRightVerticalPositionRange.min;
  const imageRightBoundsMax =
    imageRightVerticalPositionBounds?.max ??
    imageRightVerticalPositionRange.max;

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
            <ToggleField
              fieldLabel="Card corner"
              options={cardBorderRadiusOptions}
              value={workbenchState.cardBorderRadius}
              onValueChange={(value) => {
                setWorkbenchField('cardBorderRadius', value);
              }}
            />
            <ToggleField
              fieldLabel="Image position"
              options={cardLayoutOptions}
              value={workbenchState.cardLayout}
              onValueChange={(value) => {
                setWorkbenchField('cardLayout', value);
                if (value === 'vertical') {
                  setWorkbenchField('sideLayoutFlow', 'fixed');
                }
              }}
            />
            <ToggleField
              fieldLabel="Layout"
              options={sideLayoutFlowOptions}
              value={workbenchState.sideLayoutFlow}
              disabled={isTopImageLayout}
              onValueChange={(value) => {
                setWorkbenchField('sideLayoutFlow', value);
              }}
            />
            {isImageRightLayout ? (
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
                    value={[
                      mapImageRightVerticalPositionToUserPercent(
                        workbenchState.imageRightVerticalPosition,
                        imageRightBoundsMin,
                        imageRightBoundsMax,
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
                            imageRightBoundsMin,
                            imageRightBoundsMax,
                          ),
                        );
                      }
                    }}
                  />
                  <span className="min-w-10 text-right text-sm font-medium text-muted-foreground tabular-nums">
                    {mapImageRightVerticalPositionToUserPercent(
                      workbenchState.imageRightVerticalPosition,
                      imageRightBoundsMin,
                      imageRightBoundsMax,
                    )}
                  </span>
                </div>
              </Field>
            ) : null}
            <ToolbarSelectField
              fieldLabel="Image aspect ratio"
              options={imageAspectRatioOptions}
              triggerId="drawer-image-aspect-ratio"
              value={workbenchState.imageAspectRatio}
              onValueChange={(value) => {
                setWorkbenchField('imageAspectRatio', value);
              }}
            />
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
                    setWorkbenchField(
                      'imageFlipVertical',
                      nextSelected === 'on',
                    );
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
          </FieldGroup>
        </SheetContent>
      </Sheet>
    </div>
  );
}
