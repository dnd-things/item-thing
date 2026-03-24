'use client';

import {
  type CardBorderRadiusOption,
  type CardLayoutOption,
  type CardStyleOption,
  type ImageAspectRatioOption,
  imageRightVerticalPositionDefaultForFluidSideLayout,
  type MagicItemCardRendererProps,
  type SideLayoutFlowOption,
} from '@/features/card-renderer/lib/card-renderer-options';
export interface SelectionOption<TValue extends string> {
  label: string;
  value: TValue;
}

export type MagicItemWorkbenchState = MagicItemCardRendererProps;

export type WorkbenchFieldSetter = <TKey extends keyof MagicItemWorkbenchState>(
  fieldName: TKey,
  fieldValue: MagicItemWorkbenchState[TKey],
) => void;

export const cardLayoutOptions: ReadonlyArray<
  SelectionOption<CardLayoutOption>
> = [
  { label: 'Top', value: 'vertical' },
  { label: 'Right', value: 'image-right' },
];

export const sideLayoutFlowOptions: ReadonlyArray<
  SelectionOption<SideLayoutFlowOption>
> = [
  { label: 'Fixed', value: 'fixed' },
  { label: 'Fluid', value: 'fluid' },
];

export const cardStyleOptions: ReadonlyArray<SelectionOption<CardStyleOption>> =
  [
    { label: 'Print', value: 'print' },
    { label: 'Minimal', value: 'minimal' },
    { label: 'Classic', value: 'classic' },
  ];

export const cardBorderRadiusOptions: ReadonlyArray<
  SelectionOption<CardBorderRadiusOption>
> = [
  { label: 'Sharp', value: 'none' },
  { label: 'Round', value: 'small' },
];

export const imageFlipToggleOptions: ReadonlyArray<
  SelectionOption<'off' | 'on'>
> = [
  { label: 'Off', value: 'off' },
  { label: 'On', value: 'on' },
];

export const imageAspectRatioOptions: ReadonlyArray<
  SelectionOption<ImageAspectRatioOption>
> = [
  { label: 'Based on image', value: 'based-on-image' },
  { label: '1:1', value: 'square' },
  { label: '4:5', value: 'portrait' },
  { label: '3:4', value: 'portrait-3-4' },
  { label: '2:3', value: 'portrait-2-3' },
  { label: '9:16', value: 'portrait-9-16' },
  { label: '3:2', value: 'landscape' },
  { label: '16:9', value: 'widescreen' },
];

export const defaultMagicItemWorkbenchState: MagicItemWorkbenchState = {
  cardLayout: 'vertical',
  sideLayoutFlow: 'fixed',
  cardStyle: 'print',
  cardBorderRadius: 'small',
  imageSize: 100,
  imageAspectRatio: 'square',
  resolvedImageAspectRatio: 1,
  imageBorderRadius: 0,
  imageBorderWidthPx: 0,
  imageRightVerticalPosition:
    imageRightVerticalPositionDefaultForFluidSideLayout,
  imageRotationDegrees: 0,
  imageFlipHorizontal: false,
  imageFlipVertical: false,
  imageFileName: '',
  imagePreviewUrl: '',
  itemName: '',
  classificationAndRarity: '',
  requiresAttunement: false,
  flavorDescription: '',
  mechanicalDescription: '',
};

export function getOptionLabel<TValue extends string>(
  options: ReadonlyArray<SelectionOption<TValue>>,
  value: TValue,
): string {
  return options.find((option) => option.value === value)?.label ?? value;
}
