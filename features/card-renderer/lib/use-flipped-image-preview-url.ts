'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * When rotation or flips are enabled, draws the source image to a canvas and returns a `blob:` URL.
 * Use this **same** URL for both `<Image src>` and `shape-outside: url(...)` so text wrap follows the
 * alpha. (Using the original `src` with CSS `transform` while `shape-outside` used a different
 * bitmap breaks alignment: `object-contain` + `rotate()` is not equivalent to scaling a
 * pre-rotated canvas to the same box.)
 * Canvas order: rotate first, then flips.
 */

function normalizeRotationForCanvas(degrees: number): number {
  return ((degrees % 360) + 360) % 360;
}

function applyFlipToContext(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  imageFlipHorizontal: boolean,
  imageFlipVertical: boolean,
): void {
  if (imageFlipHorizontal && imageFlipVertical) {
    context.translate(width, height);
    context.scale(-1, -1);
  } else if (imageFlipHorizontal) {
    context.translate(width, 0);
    context.scale(-1, 1);
  } else if (imageFlipVertical) {
    context.translate(0, height);
    context.scale(1, -1);
  }
}

function createRotatedImageCanvas(
  image: HTMLImageElement,
  rotationDegrees: number,
): HTMLCanvasElement | null {
  const w = image.naturalWidth;
  const h = image.naturalHeight;
  const theta = (rotationDegrees * Math.PI) / 180;
  const cos = Math.abs(Math.cos(theta));
  const sin = Math.abs(Math.sin(theta));
  const wR = Math.ceil(w * cos + h * sin);
  const hR = Math.ceil(w * sin + h * cos);
  const canvas = document.createElement('canvas');
  canvas.width = wR;
  canvas.height = hR;
  const context = canvas.getContext('2d');
  if (!context) {
    return null;
  }
  context.translate(wR / 2, hR / 2);
  context.rotate(theta);
  context.drawImage(image, -w / 2, -h / 2);
  return canvas;
}

function createFlippedCopyOfCanvas(
  source: HTMLCanvasElement,
  imageFlipHorizontal: boolean,
  imageFlipVertical: boolean,
): HTMLCanvasElement {
  const wR = source.width;
  const hR = source.height;
  const out = document.createElement('canvas');
  out.width = wR;
  out.height = hR;
  const context = out.getContext('2d');
  if (!context) {
    return source;
  }
  context.save();
  applyFlipToContext(context, wR, hR, imageFlipHorizontal, imageFlipVertical);
  context.drawImage(source, 0, 0);
  context.restore();
  return out;
}

export function useFlippedImagePreviewUrl(
  imagePreviewUrl: string,
  imageRotationDegrees: number,
  imageFlipHorizontal: boolean,
  imageFlipVertical: boolean,
): string {
  const [effectiveUrl, setEffectiveUrl] = useState(imagePreviewUrl);
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
      setEffectiveUrl('');
      return;
    }

    const normRot = normalizeRotationForCanvas(imageRotationDegrees);
    const needsBlob = normRot !== 0 || imageFlipHorizontal || imageFlipVertical;

    if (!needsBlob) {
      revokeBlobUrl();
      setEffectiveUrl(imagePreviewUrl);
      return;
    }

    let cancelled = false;
    const image = new Image();

    image.onload = () => {
      if (cancelled) {
        return;
      }

      const emitBlob = (canvas: HTMLCanvasElement) => {
        canvas.toBlob(
          (blob) => {
            if (cancelled) {
              return;
            }
            if (!blob) {
              revokeBlobUrl();
              setEffectiveUrl(imagePreviewUrl);
              return;
            }
            revokeBlobUrl();
            const nextUrl = URL.createObjectURL(blob);
            blobUrlRef.current = nextUrl;
            setEffectiveUrl(nextUrl);
          },
          'image/png',
          1,
        );
      };

      if (normRot === 0) {
        const canvas = document.createElement('canvas');
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;

        const context = canvas.getContext('2d');
        if (!context) {
          revokeBlobUrl();
          setEffectiveUrl(imagePreviewUrl);
          return;
        }

        context.save();
        applyFlipToContext(
          context,
          canvas.width,
          canvas.height,
          imageFlipHorizontal,
          imageFlipVertical,
        );
        context.drawImage(image, 0, 0);
        context.restore();

        emitBlob(canvas);
        return;
      }

      const rotatedCanvas = createRotatedImageCanvas(image, normRot);
      if (!rotatedCanvas) {
        revokeBlobUrl();
        setEffectiveUrl(imagePreviewUrl);
        return;
      }

      if (!imageFlipHorizontal && !imageFlipVertical) {
        emitBlob(rotatedCanvas);
        return;
      }

      const flippedCanvas = createFlippedCopyOfCanvas(
        rotatedCanvas,
        imageFlipHorizontal,
        imageFlipVertical,
      );
      emitBlob(flippedCanvas);
    };

    image.onerror = () => {
      if (!cancelled) {
        revokeBlobUrl();
        setEffectiveUrl(imagePreviewUrl);
      }
    };

    image.src = imagePreviewUrl;

    return () => {
      cancelled = true;
      revokeBlobUrl();
    };
  }, [
    imageFlipHorizontal,
    imageFlipVertical,
    imagePreviewUrl,
    imageRotationDegrees,
  ]);

  return effectiveUrl;
}
