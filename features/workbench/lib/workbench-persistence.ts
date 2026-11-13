'use client';

import { z } from 'zod';
import { normalizeArtworkCustomColor } from '@/features/card-renderer/lib/artwork-color-source';
import {
  clampCardWidthPxForLayout,
  clampImageBorderWidthPx,
} from '@/features/card-renderer/lib/card-renderer-options';
import {
  type DurableCardState,
  durableCardStateSchema,
  toDurableCardState,
} from '@/lib/durable-card-state';
import { normalizeWorkbenchStateForStyle } from './card-style-capability-registry';
import type { MagicItemWorkbenchState } from './workbench-options';

export const WORKBENCH_PERSISTENCE_VERSION = 8 as const;
export type PersistedWorkbenchState = DurableCardState;
export const projectPersistedWorkbenchState = toDurableCardState;
export const persistedWorkbenchStateKeys = Object.keys(
  durableCardStateSchema.shape,
);

export type ParsedWorkbenchStorage =
  | { kind: 'malformed' }
  | { kind: 'v8'; state: MagicItemWorkbenchState; assetKey: string | null }
  | { kind: 'reset' };

export type ImageDataUrlParseResult =
  | { ok: true; mimeType: string; bytes: Uint8Array }
  | { ok: false; reason: 'scheme' | 'mime' | 'base64' | 'empty' };

/** Workbench slider uses 15° steps; persisted values are rounded on load. */
export const IMAGE_ROTATION_DEGREES_STEP = 15 as const;

export function normalizeImageRotationDegrees(degrees: number): number {
  const clamped = Math.min(360, Math.max(0, degrees));
  const rounded =
    Math.round(clamped / IMAGE_ROTATION_DEGREES_STEP) *
    IMAGE_ROTATION_DEGREES_STEP;
  return Math.min(360, Math.max(0, rounded));
}

const envelopeSchema = z.object({
  version: z.literal(WORKBENCH_PERSISTENCE_VERSION),
  state: durableCardStateSchema,
  assetKey: z.string().min(1).nullable(),
});

export function encodeWorkbenchEnvelopeV8(
  state: MagicItemWorkbenchState,
  assetKey: string | null,
): string {
  return JSON.stringify({
    version: WORKBENCH_PERSISTENCE_VERSION,
    state: toDurableCardState(state),
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
  const result = envelopeSchema.safeParse(parsed);
  if (!result.success) return { kind: 'reset' };
  const { state, assetKey } = result.data;
  return {
    kind: 'v8',
    assetKey,
    state: normalizeWorkbenchStateForStyle({
      ...state,
      imagePreviewUrl: '',
      cardWidthPx: clampCardWidthPxForLayout(
        state.cardLayout,
        state.cardWidthPx,
      ),
      imageBorderWidthPx: clampImageBorderWidthPx(state.imageBorderWidthPx),
      imageRotationDegrees: normalizeImageRotationDegrees(
        state.imageRotationDegrees,
      ),
      artworkCustomColor: normalizeArtworkCustomColor(state.artworkCustomColor),
    }),
  };
}

export function peekWorkbenchAssetKey(json: string): string | null | undefined {
  try {
    const parsed = z
      .object({ assetKey: z.string().min(1).nullable() })
      .safeParse(JSON.parse(json));
    return parsed.success ? parsed.data.assetKey : undefined;
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
