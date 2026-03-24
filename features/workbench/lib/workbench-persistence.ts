'use client';

import { z } from 'zod';

import {
  clampImageBorderWidthPx,
  imageBorderWidthPxRange,
} from '@/features/card-renderer/lib/card-renderer-options';

import {
  defaultMagicItemWorkbenchState,
  type MagicItemWorkbenchState,
} from './workbench-options';

export const MAGIC_ITEM_WORKBENCH_STORAGE_KEY =
  'item-card-workbench:v1' as const;

const PERSISTENCE_VERSION = 3 as const;

const cardLayoutSchema = z.enum(['vertical', 'image-right']);
const sideLayoutFlowSchema = z.enum(['fixed', 'fluid']);
const cardStyleSchema = z.enum(['print', 'minimal', 'classic']);
const cardBorderRadiusSchema = z.enum(['none', 'small', 'large']);
const imageAspectRatioSchema = z.enum([
  'based-on-image',
  'square',
  'portrait',
  'portrait-3-4',
  'portrait-2-3',
  'portrait-9-16',
  'landscape',
  'widescreen',
]);
/** Legacy v1–v2 only; migrated to `imageBorderWidthPx` on load. */
const legacyImageBorderSchema = z.enum(['none', 'thin', 'thick']);

/** Workbench slider uses 15° steps; persisted values are rounded on load. */
export const IMAGE_ROTATION_DEGREES_STEP = 15 as const;

export function normalizeImageRotationDegrees(degrees: number): number {
  const clamped = Math.min(360, Math.max(0, degrees));
  const rounded =
    Math.round(clamped / IMAGE_ROTATION_DEGREES_STEP) *
    IMAGE_ROTATION_DEGREES_STEP;
  return Math.min(360, Math.max(0, rounded));
}

function legacyImageBorderToWidthPx(
  legacy: z.infer<typeof legacyImageBorderSchema> | undefined,
): number {
  switch (legacy) {
    case 'thin':
      return 2;
    case 'thick':
      return 5;
    default:
      return 0;
  }
}

const magicItemWorkbenchPartialStateSchema = z
  .object({
    cardLayout: cardLayoutSchema.optional(),
    sideLayoutFlow: sideLayoutFlowSchema.optional(),
    cardStyle: cardStyleSchema.optional(),
    cardBorderRadius: cardBorderRadiusSchema.optional(),
    imageSize: z.number().optional(),
    imageAspectRatio: imageAspectRatioSchema.optional(),
    resolvedImageAspectRatio: z.number().optional(),
    imageBorderRadius: z.number().optional(),
    imageBorderWidthPx: z
      .number()
      .int()
      .min(imageBorderWidthPxRange.min)
      .max(imageBorderWidthPxRange.max)
      .optional(),
    imageBorder: legacyImageBorderSchema.optional(),
    imageRightVerticalPosition: z.number().int().min(-8).optional(),
    imageFlipHorizontal: z.boolean().optional(),
    imageFlipVertical: z.boolean().optional(),
    imageRotationDegrees: z.number().min(0).max(360).optional(),
    imageFileName: z.string().optional(),
    imagePreviewUrl: z.string().optional(),
    itemName: z.string().optional(),
    classificationAndRarity: z.string().optional(),
    requiresAttunement: z.boolean().optional(),
    flavorDescription: z.string().optional(),
    mechanicalDescription: z.string().optional(),
  })
  .strip();

const workbenchPersistenceEnvelopeSchema = z.object({
  version: z.union([
    z.literal(1),
    z.literal(2),
    z.literal(PERSISTENCE_VERSION),
  ]),
  state: z.unknown(),
});

export type SaveMagicItemWorkbenchResult =
  | { success: true }
  | { success: false; reason: 'quota' | 'unknown' };

export async function dataUrlToFile(
  dataUrl: string,
  fileName: string,
): Promise<File> {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  const mimeType = blob.type || 'image/png';
  const safeName = fileName.trim() || 'image.png';
  return new File([blob], safeName, { type: mimeType });
}

export function saveMagicItemWorkbenchStateToLocalStorage(
  state: MagicItemWorkbenchState,
): SaveMagicItemWorkbenchResult {
  try {
    const envelope = { version: PERSISTENCE_VERSION, state };
    localStorage.setItem(
      MAGIC_ITEM_WORKBENCH_STORAGE_KEY,
      JSON.stringify(envelope),
    );
    return { success: true };
  } catch (error) {
    if (error instanceof DOMException && error.name === 'QuotaExceededError') {
      return { success: false, reason: 'quota' };
    }
    return { success: false, reason: 'unknown' };
  }
}

export function loadMagicItemWorkbenchStateFromLocalStorage(): MagicItemWorkbenchState | null {
  const raw = localStorage.getItem(MAGIC_ITEM_WORKBENCH_STORAGE_KEY);
  if (!raw) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  const envelopeResult = workbenchPersistenceEnvelopeSchema.safeParse(parsed);
  if (!envelopeResult.success) {
    return null;
  }

  const stateResult = magicItemWorkbenchPartialStateSchema.safeParse(
    envelopeResult.data.state,
  );
  if (!stateResult.success) {
    return null;
  }

  const mergedState = {
    ...defaultMagicItemWorkbenchState,
    ...stateResult.data,
  } as MagicItemWorkbenchState;

  mergedState.imageRotationDegrees = normalizeImageRotationDegrees(
    mergedState.imageRotationDegrees,
  );

  if (stateResult.data.imageBorderWidthPx === undefined) {
    mergedState.imageBorderWidthPx = legacyImageBorderToWidthPx(
      stateResult.data.imageBorder,
    );
  }
  mergedState.imageBorderWidthPx = clampImageBorderWidthPx(
    mergedState.imageBorderWidthPx,
  );

  const mergedWithoutLegacyImageBorder =
    mergedState as MagicItemWorkbenchState & {
      imageBorder?: z.infer<typeof legacyImageBorderSchema>;
    };
  delete mergedWithoutLegacyImageBorder.imageBorder;

  if (
    envelopeResult.data.version === 1 &&
    typeof stateResult.data.imageRightVerticalPosition === 'number'
  ) {
    return {
      ...mergedState,
      imageRightVerticalPosition:
        stateResult.data.imageRightVerticalPosition * 2,
    };
  }

  return mergedState;
}
