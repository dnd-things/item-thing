'use client';

import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Slider } from '@/components/ui/slider';
import { imageBorderRadiusRange } from '@/features/card-renderer/lib/card-renderer-options';

import {
  cardBorderRadiusOptions,
  cardLayoutOptions,
  cardStyleOptions,
  imageAspectRatioOptions,
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
}

export function WorkbenchSettingsDrawer({
  open,
  onOpenChange,
  setWorkbenchField,
  workbenchState,
}: WorkbenchSettingsDrawerProps) {
  const isTopImageLayout = workbenchState.cardLayout === 'vertical';

  return (
    <div data-print-hide>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="right"
          className="flex w-80 flex-col overflow-y-auto"
        >
          <SheetHeader>
            <SheetTitle className="font-display text-lg tracking-wide text-foreground/80">
              Card Settings
            </SheetTitle>
          </SheetHeader>
          <div className="mx-6 h-px bg-gradient-to-r from-primary/20 via-primary/8 to-transparent" />
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
          </FieldGroup>
        </SheetContent>
      </Sheet>
    </div>
  );
}
