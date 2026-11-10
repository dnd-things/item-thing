'use client';

import {
  artworkLimitCopy,
  assertDecodedArtworkDimensions,
  assertEncodedArtworkBytes,
  findVisibleAlphaBounds,
  getInspectionDimensions,
  type IntegerCrop,
  identityCrop,
  isFullSourceCrop,
  mapInspectionCropToSource,
} from './artwork-geometry';
import {
  browserCanvasFactory,
  type CanvasFactory,
  canvasToPngBlob,
  type Drawable,
  type DrawCanvas,
  displayCropSize,
} from './artwork-raster';
import { createArtworkBundle, type PreparedArtwork } from './artwork-source';

export interface ImagePreviewData {
  previewUrl: string;
  aspectRatio: number;
}

function throwIfCancelled(isCancelled?: () => boolean): void {
  if (isCancelled?.()) {
    throw new DOMException('The operation was aborted.', 'AbortError');
  }
}

export async function loadImageElementFromObjectUrl(
  imageFile: Blob,
  signal?: AbortSignal,
): Promise<HTMLImageElement> {
  if (signal?.aborted) {
    throw new DOMException('The operation was aborted.', 'AbortError');
  }
  return await new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(imageFile);
    const image = new Image();
    let settled = false;

    const finish = () => {
      image.onload = null;
      image.onerror = null;
      URL.revokeObjectURL(objectUrl);
    };
    const rejectOnce = (error: unknown) => {
      if (settled) {
        return;
      }
      settled = true;
      finish();
      reject(error);
    };
    const onAbort = () => {
      image.src = '';
      rejectOnce(new DOMException('The operation was aborted.', 'AbortError'));
    };

    if (signal) {
      signal.addEventListener('abort', onAbort, { once: true });
    }

    image.onerror = () => {
      signal?.removeEventListener('abort', onAbort);
      rejectOnce(new Error('Failed to decode image file.'));
    };
    image.onload = () => {
      signal?.removeEventListener('abort', onAbort);
      if (settled) {
        return;
      }
      if (signal?.aborted) {
        onAbort();
        return;
      }
      settled = true;
      finish();
      resolve(image);
    };
    image.src = objectUrl;
  });
}

export async function measureImageBlob(
  blob: Blob,
): Promise<{ width: number; height: number } | null> {
  try {
    const image = await loadImageElementFromObjectUrl(blob);
    const width = image.naturalWidth;
    const height = image.naturalHeight;
    image.src = '';
    if (width <= 0 || height <= 0) {
      return null;
    }
    return { width, height };
  } catch {
    return null;
  }
}

async function inspectCrop(
  image: Drawable,
  sourceWidth: number,
  sourceHeight: number,
  factory: CanvasFactory,
  readPixels: (
    canvas: DrawCanvas,
    width: number,
    height: number,
  ) => Uint8ClampedArray | 'fallback',
  isCancelled?: () => boolean,
): Promise<IntegerCrop> {
  throwIfCancelled(isCancelled);
  const inspection = getInspectionDimensions(sourceWidth, sourceHeight);
  const canvas = factory.create(inspection.width, inspection.height);
  try {
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) {
      throw new Error(artworkLimitCopy.displayEncode);
    }
    context.drawImage(image, 0, 0, inspection.width, inspection.height);
    throwIfCancelled(isCancelled);
    let pixels: Uint8ClampedArray | 'fallback';
    try {
      pixels = readPixels(canvas, inspection.width, inspection.height);
    } catch {
      return identityCrop(sourceWidth, sourceHeight);
    }
    if (pixels === 'fallback') {
      return identityCrop(sourceWidth, sourceHeight);
    }
    const scaled = findVisibleAlphaBounds(
      pixels,
      inspection.width,
      inspection.height,
    );
    if (
      scaled === null ||
      isFullSourceCrop(scaled, inspection.width, inspection.height)
    ) {
      return identityCrop(sourceWidth, sourceHeight);
    }
    const mapped = mapInspectionCropToSource(
      scaled,
      sourceWidth,
      sourceHeight,
      inspection.width,
      inspection.height,
    );
    if (isFullSourceCrop(mapped, sourceWidth, sourceHeight)) {
      return identityCrop(sourceWidth, sourceHeight);
    }
    return mapped;
  } finally {
    factory.release(canvas);
  }
}

async function renderBoundedPreview(
  image: Drawable,
  crop: IntegerCrop,
  factory: CanvasFactory,
  isCancelled?: () => boolean,
): Promise<Blob> {
  throwIfCancelled(isCancelled);
  const size = displayCropSize(crop);
  const canvas = factory.create(size.width, size.height);
  try {
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error(artworkLimitCopy.displayEncode);
    }
    context.drawImage(
      image,
      crop.left,
      crop.top,
      crop.width,
      crop.height,
      0,
      0,
      size.width,
      size.height,
    );
    throwIfCancelled(isCancelled);
    return await canvasToPngBlob(canvas);
  } finally {
    factory.release(canvas);
  }
}

export interface ReadPreparedArtworkDeps {
  isCancelled?: () => boolean;
  signal?: AbortSignal;
  factory?: CanvasFactory;
  decode?: (file: Blob, signal?: AbortSignal) => Promise<HTMLImageElement>;
  readPixels?: (
    canvas: DrawCanvas,
    width: number,
    height: number,
  ) => Uint8ClampedArray | 'fallback';
}

function defaultReadPixels(
  canvas: DrawCanvas,
  width: number,
  height: number,
): Uint8ClampedArray | 'fallback' {
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) {
    throw new Error(artworkLimitCopy.displayEncode);
  }
  try {
    return context.getImageData(0, 0, width, height).data;
  } catch {
    return 'fallback';
  }
}

export async function readPreparedArtwork(
  imageFile: File,
  deps: ReadPreparedArtworkDeps = {},
): Promise<PreparedArtwork> {
  assertEncodedArtworkBytes(imageFile.size);
  throwIfCancelled(deps.isCancelled);
  const decode = deps.decode ?? loadImageElementFromObjectUrl;
  const factory = deps.factory ?? browserCanvasFactory();
  const readPixels = deps.readPixels ?? defaultReadPixels;
  const image = await decode(imageFile, deps.signal);
  try {
    throwIfCancelled(deps.isCancelled);
    const sourceWidth = image.naturalWidth;
    const sourceHeight = image.naturalHeight;
    assertDecodedArtworkDimensions(sourceWidth, sourceHeight);
    const crop = await inspectCrop(
      image,
      sourceWidth,
      sourceHeight,
      factory,
      readPixels,
      deps.isCancelled,
    );
    const previewBlob = await renderBoundedPreview(
      image,
      crop,
      factory,
      deps.isCancelled,
    );
    throwIfCancelled(deps.isCancelled);
    return {
      previewBlob,
      sourceBlob: imageFile,
      sourceWidth,
      sourceHeight,
      crop,
      aspectRatio: crop.width / crop.height,
    };
  } finally {
    image.src = '';
  }
}

export async function createBoundedPreviewBlob(
  blob: Blob,
  width: number,
  height: number,
): Promise<Blob> {
  assertDecodedArtworkDimensions(width, height);
  const image = await loadImageElementFromObjectUrl(blob);
  try {
    const factory = browserCanvasFactory();
    return await renderBoundedPreview(
      image,
      identityCrop(width, height),
      factory,
    );
  } finally {
    image.src = '';
  }
}

export async function rasterizeNativeCrop(bundle: {
  source: Blob;
  sourceWidth: number;
  sourceHeight: number;
  crop: IntegerCrop;
}): Promise<Blob> {
  const image = await loadImageElementFromObjectUrl(bundle.source);
  try {
    if (
      image.naturalWidth !== bundle.sourceWidth ||
      image.naturalHeight !== bundle.sourceHeight
    ) {
      throw new Error(artworkLimitCopy.sourceMismatch);
    }
    const factory = browserCanvasFactory();
    const canvas = factory.create(bundle.crop.width, bundle.crop.height);
    try {
      const context = canvas.getContext('2d');
      if (!context) {
        throw new Error(artworkLimitCopy.displayEncode);
      }
      context.drawImage(
        image,
        bundle.crop.left,
        bundle.crop.top,
        bundle.crop.width,
        bundle.crop.height,
        0,
        0,
        bundle.crop.width,
        bundle.crop.height,
      );
      return await canvasToPngBlob(canvas);
    } finally {
      factory.release(canvas);
    }
  } finally {
    image.src = '';
  }
}

export function preparedArtworkBundle(artwork: PreparedArtwork) {
  return createArtworkBundle({
    preview: artwork.previewBlob,
    source: artwork.sourceBlob,
    sourceWidth: artwork.sourceWidth,
    sourceHeight: artwork.sourceHeight,
    crop: artwork.crop,
  });
}
