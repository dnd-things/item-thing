'use client';

import { z } from 'zod';
import { normalizeArtworkCustomColor } from '@/features/card-renderer/lib/artwork-color-source';
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

export const WORKBENCH_PERSISTENCE_VERSION = 7 as const;

const LEGACY_PERSISTENCE_VERSIONS = [1, 2, 3, 5, 6] as const;

export type LegacyWorkbenchPersistenceVersion =
  (typeof LEGACY_PERSISTENCE_VERSIONS)[number];

const cardLayoutSchema = z.enum(['vertical', 'image-right']);
const sideLayoutFieldSchema = z.enum(['fixed', 'fluid']);
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
const artworkColorSourceSchema = z.enum([
  'auto-complement',
  'triad-left',
  'triad-right',
  'neutral',
  'custom',
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
    sideLayoutFlow: sideLayoutFieldSchema.optional(),
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
    artworkColorSource: artworkColorSourceSchema.optional(),
    artworkCustomColor: z.string().optional(),
    minimalArtworkThemeSource: artworkColorSourceSchema.optional(),
    minimalArtworkThemeCustomColor: z.string().optional(),
    imageFileName: z.string().optional(),
    imagePreviewUrl: z.string().optional(),
    itemName: z.string().optional(),
    classificationAndRarity: z.string().optional(),
    requiresAttunement: z.boolean().optional(),
    flavorDescription: z.string().optional(),
    mechanicalDescription: z.string().optional(),
  })
  .strip();

type PersistedFieldInput = z.infer<typeof magicItemWorkbenchPartialStateSchema>;

export type PersistedWorkbenchState = Omit<
  MagicItemWorkbenchState,
  'imagePreviewUrl'
>;

export type ParsedWorkbenchStorage =
  | { kind: 'malformed' }
  | {
      kind: 'legacy';
      version: LegacyWorkbenchPersistenceVersion;
      state: MagicItemWorkbenchState;
    }
  | {
      kind: 'v7';
      state: MagicItemWorkbenchState;
      assetKey: string | null;
    }
  | {
      kind: 'degraded';
      reason: 'unsupported-version' | 'invalid-state';
      state: MagicItemWorkbenchState;
    };

export type ImageDataUrlParseResult =
  | { ok: true; mimeType: string; bytes: Uint8Array }
  | { ok: false; reason: 'scheme' | 'mime' | 'base64' | 'empty' };

const PERSISTED_STATE_KEYS = [
  'cardLayout',
  'sideLayoutFlow',
  'cardStyle',
  'cardBorderRadius',
  'cardWidthAuto',
  'cardWidthPx',
  'imageSize',
  'imageAspectRatio',
  'resolvedImageAspectRatio',
  'imageBorderRadius',
  'imageBorderWidthPx',
  'imageRightVerticalPosition',
  'imageRotationDegrees',
  'imageFlipHorizontal',
  'imageFlipVertical',
  'artworkColorSource',
  'artworkCustomColor',
  'imageFileName',
  'itemName',
  'classificationAndRarity',
  'requiresAttunement',
  'flavorDescription',
  'mechanicalDescription',
] as const satisfies ReadonlyArray<keyof PersistedWorkbenchState>;

function isLegacyVersion(
  version: unknown,
): version is LegacyWorkbenchPersistenceVersion {
  return (
    version === 1 ||
    version === 2 ||
    version === 3 ||
    version === 5 ||
    version === 6
  );
}

function readPersistedFields(state: unknown): {
  complete: boolean;
  fields: PersistedFieldInput;
} {
  if (!state || typeof state !== 'object') {
    return { complete: false, fields: {} };
  }

  const direct = magicItemWorkbenchPartialStateSchema.safeParse(state);
  if (direct.success) {
    return { complete: true, fields: direct.data };
  }

  const source = state as Record<string, unknown>;
  const picked: Record<string, unknown> = {};
  for (const key of Object.keys(source)) {
    const attempt = magicItemWorkbenchPartialStateSchema.safeParse({
      [key]: source[key],
    });
    if (attempt.success) {
      Object.assign(picked, attempt.data);
    }
  }

  const cleaned = magicItemWorkbenchPartialStateSchema.safeParse(picked);
  return {
    complete: false,
    fields: cleaned.success ? cleaned.data : {},
  };
}

function normalizeParsedWorkbenchFields(
  fields: PersistedFieldInput,
  version: number,
  keepImage: boolean,
): MagicItemWorkbenchState {
  const artworkColorSource =
    fields.artworkColorSource ?? fields.minimalArtworkThemeSource;
  const artworkCustomColor =
    fields.artworkCustomColor ?? fields.minimalArtworkThemeCustomColor;
  const {
    minimalArtworkThemeSource: _minimalArtworkThemeSource,
    minimalArtworkThemeCustomColor: _minimalArtworkThemeCustomColor,
    imagePreviewUrl: parsedPreviewUrl,
    artworkColorSource: _artworkColorSource,
    artworkCustomColor: _artworkCustomColor,
    ...stateForMerge
  } = fields;

  const mergedState: MagicItemWorkbenchState = {
    ...defaultMagicItemWorkbenchState,
    imagePreviewUrl:
      keepImage && typeof parsedPreviewUrl === 'string' ? parsedPreviewUrl : '',
  };
  for (const [key, value] of Object.entries(stateForMerge)) {
    if (value !== undefined) {
      Object.assign(mergedState, { [key]: value });
    }
  }
  if (artworkColorSource !== undefined) {
    mergedState.artworkColorSource = artworkColorSource;
  }
  if (artworkCustomColor !== undefined) {
    mergedState.artworkCustomColor = artworkCustomColor;
  }

  mergedState.cardWidthAuto = fields.cardWidthAuto ?? true;
  mergedState.cardWidthPx =
    typeof fields.cardWidthPx === 'number'
      ? clampCardWidthPxForLayout(mergedState.cardLayout, fields.cardWidthPx)
      : getDefaultCardWidthPx(mergedState.cardLayout);
  mergedState.imageRotationDegrees = normalizeImageRotationDegrees(
    mergedState.imageRotationDegrees,
  );
  mergedState.imageBorderWidthPx = clampImageBorderWidthPx(
    mergedState.imageBorderWidthPx,
  );
  mergedState.artworkCustomColor = normalizeArtworkCustomColor(
    mergedState.artworkCustomColor,
  );

  if (version === 1 && typeof fields.imageRightVerticalPosition === 'number') {
    return normalizeWorkbenchStateForStyle({
      ...mergedState,
      imageRightVerticalPosition: fields.imageRightVerticalPosition * 2,
    });
  }

  return normalizeWorkbenchStateForStyle(mergedState);
}

export function projectPersistedWorkbenchState(
  state: MagicItemWorkbenchState,
): PersistedWorkbenchState {
  return {
    cardLayout: state.cardLayout,
    sideLayoutFlow: state.sideLayoutFlow,
    cardStyle: state.cardStyle,
    cardBorderRadius: state.cardBorderRadius,
    cardWidthAuto: state.cardWidthAuto,
    cardWidthPx: state.cardWidthPx,
    imageSize: state.imageSize,
    imageAspectRatio: state.imageAspectRatio,
    resolvedImageAspectRatio: state.resolvedImageAspectRatio,
    imageBorderRadius: state.imageBorderRadius,
    imageBorderWidthPx: state.imageBorderWidthPx,
    imageRightVerticalPosition: state.imageRightVerticalPosition,
    imageRotationDegrees: state.imageRotationDegrees,
    imageFlipHorizontal: state.imageFlipHorizontal,
    imageFlipVertical: state.imageFlipVertical,
    artworkColorSource: state.artworkColorSource,
    artworkCustomColor: state.artworkCustomColor,
    imageFileName: state.imageFileName,
    itemName: state.itemName,
    classificationAndRarity: state.classificationAndRarity,
    requiresAttunement: state.requiresAttunement,
    flavorDescription: state.flavorDescription,
    mechanicalDescription: state.mechanicalDescription,
  };
}

export function encodeWorkbenchEnvelopeV7(
  state: MagicItemWorkbenchState,
  assetKey: string | null,
): string {
  return JSON.stringify({
    version: WORKBENCH_PERSISTENCE_VERSION,
    state: projectPersistedWorkbenchState(state),
    assetKey,
  });
}

export function parseWorkbenchStorageJson(raw: string): ParsedWorkbenchStorage {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { kind: 'malformed' };
  }

  if (!parsed || typeof parsed !== 'object') {
    return { kind: 'malformed' };
  }

  const record = parsed as {
    version?: unknown;
    state?: unknown;
    assetKey?: unknown;
  };
  const version = record.version;
  const read = readPersistedFields(record.state);

  if (version === WORKBENCH_PERSISTENCE_VERSION) {
    const assetKey = record.assetKey;
    const normalizedAssetKey =
      assetKey === null
        ? null
        : typeof assetKey === 'string' && assetKey.length > 0
          ? assetKey
          : undefined;
    if (!read.complete || normalizedAssetKey === undefined) {
      return {
        kind: 'degraded',
        reason: 'invalid-state',
        state: normalizeParsedWorkbenchFields(read.fields, version, false),
      };
    }
    return {
      kind: 'v7',
      assetKey: normalizedAssetKey,
      state: normalizeParsedWorkbenchFields(read.fields, version, false),
    };
  }

  if (isLegacyVersion(version)) {
    if (!read.complete) {
      return {
        kind: 'degraded',
        reason: 'invalid-state',
        state: normalizeParsedWorkbenchFields(read.fields, version, false),
      };
    }
    return {
      kind: 'legacy',
      version,
      state: normalizeParsedWorkbenchFields(read.fields, version, true),
    };
  }

  if (typeof version === 'number') {
    return {
      kind: 'degraded',
      reason: 'unsupported-version',
      state: normalizeParsedWorkbenchFields(read.fields, version, false),
    };
  }

  return { kind: 'malformed' };
}

export function peekWorkbenchAssetKey(json: string): string | null | undefined {
  try {
    const parsed: unknown = JSON.parse(json);
    if (!parsed || typeof parsed !== 'object' || !('assetKey' in parsed)) {
      return undefined;
    }
    const assetKey = (parsed as { assetKey: unknown }).assetKey;
    if (assetKey === null) {
      return null;
    }
    if (typeof assetKey === 'string' && assetKey.length > 0) {
      return assetKey;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

function decodeBase64(payload: string): Uint8Array {
  const normalized = payload.replace(/\s/g, '');
  if (normalized.length === 0) {
    return new Uint8Array();
  }
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(normalized)) {
    throw new Error('Invalid base64.');
  }
  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

export function bytesToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return copy;
}

export function parseImageDataUrl(value: string): ImageDataUrlParseResult {
  const trimmed = value.trim();
  if (trimmed.slice(0, 5).toLowerCase() !== 'data:') {
    return { ok: false, reason: 'scheme' };
  }

  const commaIndex = trimmed.indexOf(',');
  if (commaIndex < 0) {
    return { ok: false, reason: 'base64' };
  }

  const meta = trimmed.slice(5, commaIndex);
  const payload = trimmed.slice(commaIndex + 1);
  const parts = meta.split(';').filter((part) => part.length > 0);
  const mimeType = (parts[0] ?? '').toLowerCase();
  if (!mimeType.startsWith('image/')) {
    return { ok: false, reason: 'mime' };
  }
  const isBase64 = parts.some((part) => part.toLowerCase() === 'base64');
  if (!isBase64) {
    return { ok: false, reason: 'base64' };
  }

  let bytes: Uint8Array;
  try {
    bytes = decodeBase64(payload);
  } catch {
    return { ok: false, reason: 'base64' };
  }
  if (bytes.byteLength === 0) {
    return { ok: false, reason: 'empty' };
  }
  return { ok: true, mimeType, bytes };
}

export function previewDataUrlToBlob(dataUrl: string): Blob {
  const parsed = parseImageDataUrl(dataUrl);
  if (!parsed.ok) {
    throw new Error('Preview data URL is not a valid image.');
  }
  return new Blob([bytesToArrayBuffer(parsed.bytes)], {
    type: parsed.mimeType,
  });
}

export function fileFromImageBytes(
  bytes: Uint8Array,
  fileName: string,
  mimeType: string,
): File {
  const safeName = fileName.trim() || 'image.png';
  return new File([bytesToArrayBuffer(bytes)], safeName, { type: mimeType });
}

export async function dataUrlToFile(
  dataUrl: string,
  fileName: string,
): Promise<File> {
  const parsed = parseImageDataUrl(dataUrl);
  if (!parsed.ok) {
    throw new Error('Image data URL is not a valid image.');
  }
  return fileFromImageBytes(parsed.bytes, fileName, parsed.mimeType);
}

export function readBlobAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => {
      reject(reader.error ?? new Error('Could not read artwork.'));
    };
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
        return;
      }
      reject(new Error('Could not read artwork.'));
    };
    reader.readAsDataURL(blob);
  });
}

export function decodeImageDataUrl(dataUrl: string): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof Image === 'undefined') {
      resolve(false);
      return;
    }
    const image = new Image();
    image.onload = () => {
      resolve(image.naturalWidth > 0 && image.naturalHeight > 0);
    };
    image.onerror = () => {
      resolve(false);
    };
    image.src = dataUrl;
  });
}

export interface LegacyWorkbenchStorage {
  read(): string | null;
  removeIfUnchanged(capturedRaw: string): void;
}

export function createBrowserLegacyWorkbenchStorage(): LegacyWorkbenchStorage {
  return {
    read() {
      return localStorage.getItem(MAGIC_ITEM_WORKBENCH_STORAGE_KEY);
    },
    removeIfUnchanged(capturedRaw) {
      const current = localStorage.getItem(MAGIC_ITEM_WORKBENCH_STORAGE_KEY);
      if (current === capturedRaw) {
        localStorage.removeItem(MAGIC_ITEM_WORKBENCH_STORAGE_KEY);
      }
    },
  };
}

export const persistedWorkbenchStateKeys = PERSISTED_STATE_KEYS;
