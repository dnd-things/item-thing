import sharp from 'sharp';
import { getImageFramePresetFieldValues } from '@/features/workbench/lib/image-frame-preset';
import type { MagicItemWorkbenchState } from '@/features/workbench/lib/workbench-options';
import { defaultMagicItemWorkbenchState } from '@/features/workbench/lib/workbench-options';

import type {
  RenderCardItemJson,
  RenderCardMultipartFields,
} from './render-card-form-schema';

export interface MapRenderRequestToWorkbenchStateInput {
  artworkBuffer: Buffer;
  artworkFileName: string;
  fields: RenderCardMultipartFields;
  item: RenderCardItemJson;
}

function getMimeTypeForDataUrl(
  sharpFormat: string | undefined,
  fileName: string,
): string {
  const map: Record<string, string> = {
    jpeg: 'image/jpeg',
    jpg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    gif: 'image/gif',
    svg: 'image/svg+xml',
    tiff: 'image/tiff',
    heif: 'image/heif',
    avif: 'image/avif',
  };
  if (sharpFormat !== undefined && map[sharpFormat] !== undefined) {
    return map[sharpFormat];
  }
  const extension = fileName.split('.').pop()?.toLowerCase();
  if (extension !== undefined && map[extension] !== undefined) {
    return map[extension];
  }
  return 'image/png';
}

export async function mapRenderRequestToMagicItemWorkbenchState(
  input: MapRenderRequestToWorkbenchStateInput,
): Promise<MagicItemWorkbenchState> {
  const metadata = await sharp(input.artworkBuffer).metadata();
  const widthPx = metadata.width ?? 1;
  const heightPx = metadata.height ?? 1;
  const resolvedImageAspectRatio = heightPx > 0 ? widthPx / heightPx : 1;

  const mimeType = getMimeTypeForDataUrl(
    metadata.format,
    input.artworkFileName,
  );
  const base64 = input.artworkBuffer.toString('base64');
  const imagePreviewUrl = `data:${mimeType};base64,${base64}`;

  const frameFields = getImageFramePresetFieldValues(
    input.fields.imageFramePreset,
  );

  const safeFileName =
    input.artworkFileName.trim().length > 0
      ? input.artworkFileName
      : 'artwork.png';

  return {
    ...defaultMagicItemWorkbenchState,
    cardLayout: input.fields.cardLayout,
    sideLayoutFlow: input.fields.sideLayoutFlow,
    cardStyle: input.fields.cardStyle,
    ...frameFields,
    resolvedImageAspectRatio,
    imageFileName: safeFileName,
    imagePreviewUrl,
    itemName: input.item.itemName,
    classificationAndRarity: input.item.classificationAndRarity,
    requiresAttunement: input.item.requiresAttunement,
    flavorDescription: input.item.flavorDescription,
    mechanicalDescription: input.item.mechanicalDescription,
  };
}
