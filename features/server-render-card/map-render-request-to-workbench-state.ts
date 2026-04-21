import type { SupportedStyleCapability } from '@/features/workbench/lib/card-style-capability-registry';
import { normalizeWorkbenchStateForStyle } from '@/features/workbench/lib/card-style-capability-registry';
import type { MagicItemWorkbenchState } from '@/features/workbench/lib/workbench-options';
import { defaultMagicItemWorkbenchState } from '@/features/workbench/lib/workbench-options';
import { trimTransparentBounds } from '@/lib/trim-transparent-bounds';

import type {
  RenderCardItemJson,
  RenderCardMultipartFields,
} from './render-card-form-schema';

export interface MapRenderRequestToWorkbenchStateInput<
  TStyle extends SupportedStyleCapability,
> {
  artworkBuffer: Buffer;
  artworkFileName: string;
  fields: RenderCardMultipartFields<TStyle>;
  item: RenderCardItemJson;
  style: TStyle;
}

export interface MapRenderRequestToWorkbenchStateResult {
  sourceMimeType: string;
  workbenchState: MagicItemWorkbenchState;
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

export async function mapRenderRequestToMagicItemWorkbenchState<
  TStyle extends SupportedStyleCapability,
>(
  input: MapRenderRequestToWorkbenchStateInput<TStyle>,
): Promise<MapRenderRequestToWorkbenchStateResult> {
  const trimmedArtwork = await trimTransparentBounds(input.artworkBuffer);
  const widthPx = trimmedArtwork.width;
  const heightPx = trimmedArtwork.height;
  const resolvedImageAspectRatio = heightPx > 0 ? widthPx / heightPx : 1;

  const mimeType =
    trimmedArtwork.mimeType.trim() !== ''
      ? trimmedArtwork.mimeType
      : getMimeTypeForDataUrl(undefined, input.artworkFileName);
  const base64 = trimmedArtwork.buffer.toString('base64');
  const imagePreviewUrl = `data:${mimeType};base64,${base64}`;

  const safeFileName =
    input.artworkFileName.trim().length > 0
      ? input.artworkFileName
      : 'artwork.png';

  const workbenchState = normalizeWorkbenchStateForStyle({
    ...defaultMagicItemWorkbenchState,
    ...input.fields,
    cardStyle: input.style,
    resolvedImageAspectRatio,
    imageFileName: safeFileName,
    imagePreviewUrl,
    itemName: input.item.itemName,
    classificationAndRarity: input.item.classificationAndRarity,
    requiresAttunement: input.item.requiresAttunement,
    flavorDescription: input.item.flavorDescription,
    mechanicalDescription: input.item.mechanicalDescription,
  });

  return {
    sourceMimeType: mimeType,
    workbenchState,
  };
}
