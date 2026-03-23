'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * When horizontal or vertical flip is enabled, draws the source image to a canvas and returns a
 * `blob:` URL so `shape-outside: url(...)` uses the same mirrored alpha as the visible bitmap.
 */
export function useFlippedImagePreviewUrl(
  imagePreviewUrl: string,
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

    if (!imageFlipHorizontal && !imageFlipVertical) {
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
      if (imageFlipHorizontal && imageFlipVertical) {
        context.translate(canvas.width, canvas.height);
        context.scale(-1, -1);
      } else if (imageFlipHorizontal) {
        context.translate(canvas.width, 0);
        context.scale(-1, 1);
      } else {
        context.translate(0, canvas.height);
        context.scale(1, -1);
      }
      context.drawImage(image, 0, 0);
      context.restore();

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
  }, [imageFlipHorizontal, imageFlipVertical, imagePreviewUrl]);

  return effectiveUrl;
}
