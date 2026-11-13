'use client';

import { useEffect, useRef, useState } from 'react';
import {
  artworkLimitCopy,
  browserCanvasFactory,
  drawArtworkFromPreviewUrlToObjectUrl,
  needsRasterTransform,
  normalizeRotationDegrees,
} from '@/features/artwork/browser';

/**
 * When rotation or flips are enabled, draws the source image to a canvas and returns a `blob:` URL.
 * Use this **same** URL for both `<Image src>` and `shape-outside: url(...)` so text wrap follows the
 * alpha. (Using the original `src` with CSS `transform` while `shape-outside` used a different
 * bitmap breaks alignment: `object-contain` + `rotate()` is not equivalent to scaling a
 * pre-rotated canvas to the same box.)
 * Canvas order: rotate first, then flips.
 */

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
  const ownedArtworkRef = useRef<{ release: () => void } | null>(null);

  useEffect(() => {
    const releaseOwnedArtwork = () => {
      ownedArtworkRef.current?.release();
      ownedArtworkRef.current = null;
    };

    if (!imagePreviewUrl.trim()) {
      releaseOwnedArtwork();
      setRender(idleRender('', false));
      return;
    }

    if (alreadyTransformed || !transformNeeded) {
      releaseOwnedArtwork();
      setRender(idleRender(imagePreviewUrl, alreadyTransformed));
      return;
    }

    let cancelled = false;
    void drawArtworkFromPreviewUrlToObjectUrl(
      {
        previewUrl: imagePreviewUrl,
        logicalWidth,
        logicalHeight,
        rotationDegrees: imageRotationDegrees,
        flipHorizontal: imageFlipHorizontal,
        flipVertical: imageFlipVertical,
        policy,
      },
      browserCanvasFactory(),
    )
      .then((drawn) => {
        if (cancelled) {
          drawn.release();
          return;
        }
        releaseOwnedArtwork();
        ownedArtworkRef.current = drawn;
        setRender({
          effectiveUrl: drawn.url,
          ready: true,
          error: null,
          transformed: true,
        });
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }
        releaseOwnedArtwork();
        setRender({
          effectiveUrl: '',
          ready: false,
          error:
            error instanceof Error
              ? error.message
              : artworkLimitCopy.encodeFailed,
          transformed: false,
        });
      });

    return () => {
      cancelled = true;
      releaseOwnedArtwork();
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
