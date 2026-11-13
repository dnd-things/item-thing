import type { ArtworkDrawPolicy } from './geometry.ts';
import { loadImageElementFromObjectUrl } from './prepare-canvas.ts';
import {
  browserCanvasFactory,
  type CanvasFactory,
  canvasToPngBlob,
  type Drawable,
  renderTransformedCanvas,
} from './raster.ts';

export type DrawArtworkInput = {
  source: Drawable;
  logicalWidth: number;
  logicalHeight: number;
  rotationDegrees: number;
  flipHorizontal: boolean;
  flipVertical: boolean;
  policy: ArtworkDrawPolicy;
};

export type DrawArtworkWithoutSource = Omit<DrawArtworkInput, 'source'>;

function ownedObjectUrlFromBlob(blob: Blob): {
  url: string;
  release: () => void;
} {
  const url = URL.createObjectURL(blob);
  let released = false;
  return {
    url,
    release() {
      if (released) {
        return;
      }
      released = true;
      URL.revokeObjectURL(url);
    },
  };
}

async function decodeImageFromPreviewUrl(
  previewUrl: string,
): Promise<HTMLImageElement> {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const element = new Image();
    element.onload = () => resolve(element);
    element.onerror = () => reject(new Error('Failed to decode image.'));
    element.src = previewUrl;
  });
}

export async function drawArtworkToBlob(
  input: DrawArtworkInput,
  factory: CanvasFactory = browserCanvasFactory(),
): Promise<Blob> {
  const canvas = renderTransformedCanvas(input.source, input, factory);
  try {
    return await canvasToPngBlob(canvas);
  } finally {
    factory.release(canvas);
  }
}

export async function drawArtworkToObjectUrl(
  input: DrawArtworkWithoutSource & {
    decodeSource: () => Promise<Drawable>;
  },
  factory: CanvasFactory = browserCanvasFactory(),
): Promise<{ url: string; release: () => void }> {
  const drawable = await input.decodeSource();
  const blob = await drawArtworkToBlob({ ...input, source: drawable }, factory);
  return ownedObjectUrlFromBlob(blob);
}

export async function drawArtworkFromBlobToObjectUrl(
  input: DrawArtworkWithoutSource & { blob: Blob },
  factory: CanvasFactory = browserCanvasFactory(),
): Promise<{ url: string; release: () => void }> {
  return drawArtworkToObjectUrl(
    {
      ...input,
      decodeSource: () => loadImageElementFromObjectUrl(input.blob),
    },
    factory,
  );
}

export async function drawArtworkFromPreviewUrlToObjectUrl(
  input: {
    previewUrl: string;
    logicalWidth?: number | undefined;
    logicalHeight?: number | undefined;
    rotationDegrees: number;
    flipHorizontal: boolean;
    flipVertical: boolean;
    policy: ArtworkDrawPolicy;
  },
  factory: CanvasFactory = browserCanvasFactory(),
): Promise<{ url: string; release: () => void }> {
  const image = await decodeImageFromPreviewUrl(input.previewUrl);
  try {
    const width =
      input.logicalWidth && input.logicalWidth > 0
        ? input.logicalWidth
        : image.naturalWidth;
    const height =
      input.logicalHeight && input.logicalHeight > 0
        ? input.logicalHeight
        : image.naturalHeight;
    const blob = await drawArtworkToBlob(
      {
        source: image,
        logicalWidth: width,
        logicalHeight: height,
        rotationDegrees: input.rotationDegrees,
        flipHorizontal: input.flipHorizontal,
        flipVertical: input.flipVertical,
        policy: input.policy,
      },
      factory,
    );
    if (blob.size === 0) {
      throw new Error('Failed to decode image.');
    }
    return ownedObjectUrlFromBlob(blob);
  } finally {
    image.src = '';
  }
}

export function resolveTransformedObjectUrl(input: {
  cancelled: boolean;
  blob: Blob | null;
  previousUrl: string | null;
  sourceUrl: string;
  createObjectURL: (blob: Blob) => string;
  revokeObjectURL: (url: string) => void;
}): { effectiveUrl: string; ownedUrl: string | null } {
  if (input.cancelled) {
    return { effectiveUrl: input.sourceUrl, ownedUrl: input.previousUrl };
  }
  if (!input.blob) {
    if (input.previousUrl) {
      input.revokeObjectURL(input.previousUrl);
    }
    return { effectiveUrl: input.sourceUrl, ownedUrl: null };
  }
  if (input.previousUrl) {
    input.revokeObjectURL(input.previousUrl);
  }
  const ownedUrl = input.createObjectURL(input.blob);
  return { effectiveUrl: ownedUrl, ownedUrl };
}

export async function drawArtworkFromPreviewUrl(
  input: {
    previewUrl: string;
    logicalWidth?: number | undefined;
    logicalHeight?: number | undefined;
    rotationDegrees: number;
    flipHorizontal: boolean;
    flipVertical: boolean;
    policy: ArtworkDrawPolicy;
  },
  factory: CanvasFactory = browserCanvasFactory(),
): Promise<Blob> {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const element = new Image();
    element.onload = () => resolve(element);
    element.onerror = () => reject(new Error('Failed to decode image.'));
    element.src = input.previewUrl;
  });
  try {
    const width =
      input.logicalWidth && input.logicalWidth > 0
        ? input.logicalWidth
        : image.naturalWidth;
    const height =
      input.logicalHeight && input.logicalHeight > 0
        ? input.logicalHeight
        : image.naturalHeight;
    return await drawArtworkToBlob(
      {
        source: image,
        logicalWidth: width,
        logicalHeight: height,
        rotationDegrees: input.rotationDegrees,
        flipHorizontal: input.flipHorizontal,
        flipVertical: input.flipVertical,
        policy: input.policy,
      },
      factory,
    );
  } finally {
    image.src = '';
  }
}
