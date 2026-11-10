'use client';

import { useEffect, useRef, useState } from 'react';
import {
  artworkLimitCopy,
  needsRasterTransform,
  normalizeRotationDegrees,
} from '@/features/workbench/lib/artwork-geometry';
import {
  browserCanvasFactory,
  canvasToPngBlob,
  renderTransformedCanvas,
} from '@/features/workbench/lib/artwork-raster';

/**
 * When rotation or flips are enabled, draws the source image to a canvas and returns a `blob:` URL.
 * Use this **same** URL for both `<Image src>` and `shape-outside: url(...)` so text wrap follows the
 * alpha. (Using the original `src` with CSS `transform` while `shape-outside` used a different
 * bitmap breaks alignment: `object-contain` + `rotate()` is not equivalent to scaling a
 * pre-rotated canvas to the same box.)
 * Canvas order: rotate first, then flips.
 */

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

export interface ArtworkRenderResult {
  effectiveUrl: string;
  ready: boolean;
  error: string | null;
  transformed: boolean;
}

export interface ArtworkRenderOptions {
  policy?: 'display' | 'export';
  logicalWidth?: number;
  logicalHeight?: number;
  alreadyTransformed?: boolean;
}

const idleRender = (
  url: string,
  transformed: boolean,
): ArtworkRenderResult => ({
  effectiveUrl: url,
  ready: true,
  error: null,
  transformed,
});

export function artworkDataset(
  render: ArtworkRenderResult,
  themeSettled: boolean,
  exportGeneration?: number,
): {
  'data-artwork-state': 'ready' | 'pending' | 'error';
  'data-artwork-error': string;
  'data-export-generation'?: string;
} {
  const dataset =
    render.error !== null
      ? {
          'data-artwork-state': 'error' as const,
          'data-artwork-error': render.error,
        }
      : render.ready && themeSettled
        ? {
            'data-artwork-state': 'ready' as const,
            'data-artwork-error': '',
          }
        : {
            'data-artwork-state': 'pending' as const,
            'data-artwork-error': '',
          };
  if (exportGeneration === undefined) {
    return dataset;
  }
  return {
    ...dataset,
    'data-export-generation': String(exportGeneration),
  };
}

export function useFlippedImagePreviewUrl(
  imagePreviewUrl: string,
  imageRotationDegrees: number,
  imageFlipHorizontal: boolean,
  imageFlipVertical: boolean,
  options?: ArtworkRenderOptions,
): ArtworkRenderResult {
  const policy = options?.policy ?? 'display';
  const alreadyTransformed = options?.alreadyTransformed === true;
  const logicalWidth = options?.logicalWidth;
  const logicalHeight = options?.logicalHeight;
  const transformNeeded =
    !alreadyTransformed &&
    needsRasterTransform(
      imageRotationDegrees,
      imageFlipHorizontal,
      imageFlipVertical,
    );
  const jobKey = [
    policy,
    imagePreviewUrl,
    normalizeRotationDegrees(imageRotationDegrees),
    imageFlipHorizontal,
    imageFlipVertical,
    alreadyTransformed,
    logicalWidth ?? '',
    logicalHeight ?? '',
  ].join('|');
  const [job, setJob] = useState(jobKey);
  const [render, setRender] = useState<ArtworkRenderResult>(() =>
    transformNeeded
      ? {
          effectiveUrl: '',
          ready: false,
          error: null,
          transformed: false,
        }
      : idleRender(imagePreviewUrl, alreadyTransformed),
  );
  if (job !== jobKey) {
    setJob(jobKey);
    setRender(
      alreadyTransformed || !transformNeeded
        ? idleRender(imagePreviewUrl, alreadyTransformed)
        : {
            effectiveUrl: '',
            ready: false,
            error: null,
            transformed: false,
          },
    );
  }
  const blobUrlRef = useRef<string | null>(null);

  useEffect(() => {
    const revokeBlobUrl = () => {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };

    if (!imagePreviewUrl.trim()) {
      revokeBlobUrl();
      setRender(idleRender('', false));
      return;
    }

    if (alreadyTransformed || !transformNeeded) {
      revokeBlobUrl();
      setRender(idleRender(imagePreviewUrl, alreadyTransformed));
      return;
    }

    let cancelled = false;
    const image = new Image();
    image.onload = () => {
      if (cancelled) {
        image.onload = null;
        image.onerror = null;
        image.src = '';
        return;
      }
      const width =
        logicalWidth && logicalWidth > 0 ? logicalWidth : image.naturalWidth;
      const height =
        logicalHeight && logicalHeight > 0
          ? logicalHeight
          : image.naturalHeight;
      let canvas: ReturnType<
        ReturnType<typeof browserCanvasFactory>['create']
      > | null = null;
      const factory = browserCanvasFactory();
      try {
        canvas = renderTransformedCanvas(
          image,
          {
            logicalWidth: width,
            logicalHeight: height,
            rotationDegrees: imageRotationDegrees,
            flipHorizontal: imageFlipHorizontal,
            flipVertical: imageFlipVertical,
            policy,
          },
          factory,
        );
        void canvasToPngBlob(canvas).then(
          (blob) => {
            factory.release(canvas as NonNullable<typeof canvas>);
            canvas = null;
            if (cancelled || blob.size === 0) {
              return;
            }
            const resolved = resolveTransformedObjectUrl({
              cancelled,
              blob,
              previousUrl: blobUrlRef.current,
              sourceUrl: imagePreviewUrl,
              createObjectURL: URL.createObjectURL.bind(URL),
              revokeObjectURL: URL.revokeObjectURL.bind(URL),
            });
            if (cancelled) {
              if (
                resolved.ownedUrl &&
                resolved.ownedUrl !== blobUrlRef.current
              ) {
                URL.revokeObjectURL(resolved.ownedUrl);
              }
              return;
            }
            blobUrlRef.current = resolved.ownedUrl;
            setRender({
              effectiveUrl: resolved.effectiveUrl,
              ready: true,
              error: null,
              transformed: true,
            });
          },
          () => {
            if (canvas) {
              factory.release(canvas);
            }
            if (cancelled) {
              return;
            }
            revokeBlobUrl();
            setRender({
              effectiveUrl: '',
              ready: false,
              error: artworkLimitCopy.encodeFailed,
              transformed: false,
            });
          },
        );
      } catch (error) {
        if (canvas) {
          factory.release(canvas);
        }
        if (cancelled) {
          return;
        }
        revokeBlobUrl();
        setRender({
          effectiveUrl: '',
          ready: false,
          error:
            error instanceof Error
              ? error.message
              : artworkLimitCopy.encodeFailed,
          transformed: false,
        });
      } finally {
        image.onload = null;
        image.onerror = null;
        image.src = '';
      }
    };
    image.onerror = () => {
      if (cancelled) {
        return;
      }
      revokeBlobUrl();
      setRender({
        effectiveUrl: '',
        ready: false,
        error: artworkLimitCopy.encodeFailed,
        transformed: false,
      });
    };
    image.src = imagePreviewUrl;

    return () => {
      cancelled = true;
      image.onload = null;
      image.onerror = null;
      image.src = '';
      revokeBlobUrl();
    };
  }, [
    alreadyTransformed,
    imageFlipHorizontal,
    imageFlipVertical,
    imagePreviewUrl,
    imageRotationDegrees,
    logicalHeight,
    logicalWidth,
    policy,
    transformNeeded,
  ]);

  return render;
}
