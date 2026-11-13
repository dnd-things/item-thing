'use client';

import {
  artworkLimitCopy,
  assertDecodedArtworkDimensions,
  type IntegerCrop,
  identityCrop,
} from '@/features/artwork/geometry';
import {
  type CanvasPrepareDeps,
  loadImageElementFromObjectUrl,
  measureImageBlob,
  prepareArtworkFromFile,
} from '@/features/artwork/prepare-canvas';
import {
  browserCanvasFactory,
  canvasToPngBlob,
  displayCropSize,
} from '@/features/artwork/raster';

import { createArtworkBundle, type PreparedArtwork } from './artwork-source';

export interface ImagePreviewData {
  previewUrl: string;
  aspectRatio: number;
}

export type ReadPreparedArtworkDeps = CanvasPrepareDeps;

export { loadImageElementFromObjectUrl, measureImageBlob };

export async function readPreparedArtwork(
  imageFile: File,
  deps: ReadPreparedArtworkDeps = {},
): Promise<PreparedArtwork> {
  const prepared = await prepareArtworkFromFile(imageFile, deps);
  return {
    previewBlob: prepared.previewBlob,
    sourceBlob: prepared.sourceBlob,
    sourceWidth: prepared.sourceWidth,
    sourceHeight: prepared.sourceHeight,
    crop: prepared.crop,
    aspectRatio: prepared.aspectRatio,
  };
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
    const size = displayCropSize(identityCrop(width, height));
    const canvas = factory.create(size.width, size.height);
    try {
      const context = canvas.getContext('2d');
      if (!context) {
        throw new Error(artworkLimitCopy.displayEncode);
      }
      context.drawImage(image, 0, 0, size.width, size.height);
      return await canvasToPngBlob(canvas);
    } finally {
      factory.release(canvas);
    }
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
