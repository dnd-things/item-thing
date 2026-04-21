'use client';

import { z } from 'zod';

import {
  clampCardWidthPxForLayout,
  clampImageBorderWidthPx,
  getDefaultCardWidthPx,
  imageBorderWidthPxRange,
} from '@/features/card-renderer/lib/card-renderer-options';
import { normalizeWorkbenchStateForStyle } from './card-style-capability-registry';
import {
  defaultMagicItemWorkbenchState,
  type MagicItemWorkbenchState,
} from './workbench-options';

export const MAGIC_ITEM_WORKBENCH_STORAGE_KEY =
  'item-card-workbench:v1' as const;

const PERSISTENCE_VERSION = 3 as const;
const CURRENT_PERSISTENCE_VERSION = 5 as const;

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

/** Workbench slider uses 15° steps; persisted values are rounded on load. */
export const IMAGE_ROTATION_DEGREES_STEP = 15 as const;

export function normalizeImageRotationDegrees(degrees: number): number {
  const clamped = Math.min(360, Math.max(0, degrees));
  const rounded =
    Math.round(clamped / IMAGE_ROTATION_DEGREES_STEP) *
    IMAGE_ROTATION_DEGREES_STEP;
  return Math.min(360, Math.max(0, rounded));
}

const magicItemWorkbenchPartialStateSchema = z
  .object({
    cardLayout: cardLayoutSchema.optional(),
    sideLayoutFlow: sideLayoutFlowSchema.optional(),
    cardStyle: cardStyleSchema.optional(),
    cardBorderRadius: cardBorderRadiusSchema.optional(),
    cardWidthAuto: z.boolean().optional(),
    cardWidthPx: z.number().optional(),
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
    z.literal(CURRENT_PERSISTENCE_VERSION),
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
    const envelope = { version: CURRENT_PERSISTENCE_VERSION, state };
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

  mergedState.cardWidthAuto = stateResult.data.cardWidthAuto ?? true;
  mergedState.cardWidthPx =
    typeof stateResult.data.cardWidthPx === 'number'
      ? clampCardWidthPxForLayout(
          mergedState.cardLayout,
          stateResult.data.cardWidthPx,
        )
      : getDefaultCardWidthPx(mergedState.cardLayout);

  mergedState.imageRotationDegrees = normalizeImageRotationDegrees(
    mergedState.imageRotationDegrees,
  );

  mergedState.imageBorderWidthPx = clampImageBorderWidthPx(
    mergedState.imageBorderWidthPx,
  );

  if (
    envelopeResult.data.version === 1 &&
    typeof stateResult.data.imageRightVerticalPosition === 'number'
  ) {
    return normalizeWorkbenchStateForStyle({
      ...mergedState,
      imageRightVerticalPosition:
        stateResult.data.imageRightVerticalPosition * 2,
    });
  }

  return normalizeWorkbenchStateForStyle(mergedState);
}
