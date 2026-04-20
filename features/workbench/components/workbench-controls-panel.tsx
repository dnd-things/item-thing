'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Slider } from '@/components/ui/slider';
import {
  cardWidthPxStep,
  getCardWidthPxRange,
  getDefaultCardWidthPx,
  imageBorderRadiusRange,
} from '@/features/card-renderer/lib/card-renderer-options';

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

interface WorkbenchControlsPanelProps {
  setWorkbenchField: WorkbenchFieldSetter;
  workbenchState: MagicItemWorkbenchState;
}

export function WorkbenchControlsPanel({
  setWorkbenchField,
  workbenchState,
}: WorkbenchControlsPanelProps) {
  const isTopImageLayout = workbenchState.cardLayout === 'vertical';
  const cardWidthRange = getCardWidthPxRange(workbenchState.cardLayout);

  return (
    <Card className="border border-border/60 bg-card/65 backdrop-blur-sm">
      <CardContent>
        <FieldGroup className="grid gap-5 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-7">
          <ToolbarSelectField
            fieldLabel="Style"
            options={cardStyleOptions}
            triggerId="card-style"
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
              setWorkbenchField('cardWidthPx', getDefaultCardWidthPx(value));
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
            triggerId="image-aspect-ratio"
            value={workbenchState.imageAspectRatio}
            onValueChange={(value) => {
              setWorkbenchField('imageAspectRatio', value);
            }}
          />
          <Field>
            <FieldLabel htmlFor="card-width">Card width</FieldLabel>
            <div className="flex h-9 items-center rounded-[24px] border border-border/70 bg-input/15 px-4">
              <Slider
                id="card-width"
                value={[workbenchState.cardWidthPx]}
                min={cardWidthRange.min}
                max={cardWidthRange.max}
                step={cardWidthPxStep}
                onValueChange={(nextValue) => {
                  const nextCardWidth = Array.isArray(nextValue)
                    ? nextValue[0]
                    : nextValue;

                  if (typeof nextCardWidth === 'number') {
                    setWorkbenchField('cardWidthPx', nextCardWidth);
                  }
                }}
              />
            </div>
          </Field>
          <Field>
            <FieldLabel htmlFor="image-size">Image size</FieldLabel>
            <div className="flex h-9 items-center gap-3 rounded-[24px] border border-border/70 bg-input/15 px-4">
              <Slider
                id="image-size"
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
            <FieldLabel htmlFor="image-border-radius">
              Image roundness
            </FieldLabel>
            <div className="flex h-9 items-center gap-3 rounded-[24px] border border-border/70 bg-input/15 px-4">
              <Slider
                id="image-border-radius"
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
      </CardContent>
    </Card>
  );
}
