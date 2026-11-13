import { findVisibleAlphaBounds } from './alpha-bounds.ts';
import {
  artworkLimitCopy,
  assertEncodedArtworkBytes,
  getInspectionDimensions,
  type IntegerCrop,
  identityCrop,
  isFullSourceCrop,
  mapInspectionCropToSource,
} from './geometry.ts';
import type {
  ArtworkDisplayPreviewEncoder,
  ArtworkPixelReader,
} from './pixel-reader.ts';
import { type PreparedArtwork, prepareArtwork } from './prepare.ts';
import {
  browserCanvasFactory,
  type CanvasFactory,
  canvasToPngBlob,
  type Drawable,
  type DrawCanvas,
  displayCropSize,
} from './raster.ts';

export interface CanvasPrepareDeps {
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

function throwIfCancelled(isCancelled?: () => boolean): void {
  if (isCancelled?.()) {
    throw new DOMException('The operation was aborted.', 'AbortError');
  }
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

export async function prepareArtworkFromFile(
  imageFile: File,
  deps: CanvasPrepareDeps = {},
): Promise<
  PreparedArtwork & { previewBlob: Blob; sourceBlob: Blob; crop: IntegerCrop }
> {
  assertEncodedArtworkBytes(imageFile.size);
  throwIfCancelled(deps.isCancelled);
  const decode = deps.decode ?? loadImageElementFromObjectUrl;
  const factory = deps.factory ?? browserCanvasFactory();
  const readPixels = deps.readPixels ?? defaultReadPixels;
  const bytes = new Uint8Array(await imageFile.arrayBuffer());
  const image = await decode(imageFile, deps.signal);
  try {
    const pixelReader: ArtworkPixelReader = {
      async contentRectangle(_sourceBytes, sourceWidth, sourceHeight) {
        return inspectCrop(
          image,
          sourceWidth,
          sourceHeight,
          factory,
          readPixels,
          deps.isCancelled,
        );
      },
    };
    const previewEncoder: ArtworkDisplayPreviewEncoder = {
      async displayPreview(_sourceBytes, _w, _h, contentRectangle) {
        const size = displayCropSize(contentRectangle);
        const blob = await renderBoundedPreview(
          image,
          contentRectangle,
          factory,
          deps.isCancelled,
        );
        return {
          bytes: blob,
          mimeType: 'image/png',
          width: size.width,
          height: size.height,
        };
      },
    };
    const prepared = await prepareArtwork(bytes, {
      decodeDimensions: async () => ({
        width: image.naturalWidth,
        height: image.naturalHeight,
      }),
      pixelReader,
      previewEncoder,
      ...(deps.isCancelled !== undefined
        ? { isCancelled: deps.isCancelled }
        : {}),
    });
    const previewBlob =
      prepared.displayPreview instanceof Blob
        ? prepared.displayPreview
        : new Blob([Uint8Array.from(prepared.displayPreview)], {
            type: prepared.displayPreviewMimeType,
          });
    return {
      ...prepared,
      previewBlob,
      sourceBlob: imageFile,
      crop: prepared.contentRectangle,
    };
  } finally {
    image.src = '';
  }
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
