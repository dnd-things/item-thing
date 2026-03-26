import type { ImageAspectRatioOption } from '@/features/card-renderer/lib/card-renderer-options';

export type ImageFramePresetValue = 'borderless' | 'bordered';

export interface ImageFramePresetFieldValues {
  imageBorderWidthPx: number;
  imageBorderRadius: number;
  imageAspectRatio: ImageAspectRatioOption;
}

export function getImageFramePresetFieldValues(
  preset: ImageFramePresetValue,
): ImageFramePresetFieldValues {
  if (preset === 'borderless') {
    return {
      imageBorderWidthPx: 0,
      imageBorderRadius: 0,
      imageAspectRatio: 'based-on-image',
    };
  }
  return {
    imageBorderWidthPx: 5,
    imageBorderRadius: 100,
    imageAspectRatio: 'square',
  };
}
