'use client';

import { useEffect, useState } from 'react';
import {
  type ArtworkColorSource,
  type ArtworkColorSwatch,
  getArtworkColorSwatches,
  type HslColor,
  resolveArtworkColor,
  rgbToHsl,
  wrapHue,
} from './artwork-color-source';
import {
  getMinimalArtworkThemeFallback,
  type MinimalArtworkTheme,
  resolveMinimalArtworkTheme,
} from './minimal-artwork-theme-source';

const FALLBACK_MINIMAL_ARTWORK_THEME = getMinimalArtworkThemeFallback();

const SAMPLE_CANVAS_MAX_DIMENSION = 48;
const MIN_ALPHA = 24;
const HUE_BUCKET_COUNT = 24;
const MIN_BUCKET_SCORE = 14;
const MIN_AVERAGE_SATURATION = 0.18;

interface HueBucket {
  score: number;
  saturationTotal: number;
  lightnessTotal: number;
  xTotal: number;
  yTotal: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function createHueBuckets(): HueBucket[] {
  return Array.from({ length: HUE_BUCKET_COUNT }, () => ({
    score: 0,
    saturationTotal: 0,
    lightnessTotal: 0,
    xTotal: 0,
    yTotal: 0,
  }));
}

function scorePixelColor(
  { saturation, lightness }: HslColor,
  alpha: number,
): number {
  if (alpha < MIN_ALPHA) {
    return 0;
  }

  const alphaWeight = alpha / 255;
  const saturationWeight = clamp((saturation - 0.1) / 0.9, 0, 1);
  const midLightnessWeight = 1 - clamp(Math.abs(lightness - 0.56) / 0.44, 0, 1);

  return saturationWeight * (0.5 + midLightnessWeight * 0.5) * alphaWeight;
}

function findAccentColorFromImageData(imageData: ImageData): HslColor | null {
  const buckets = createHueBuckets();
  const { data } = imageData;

  for (let index = 0; index < data.length; index += 4) {
    const alpha = data[index + 3];
    if (alpha === undefined || alpha < MIN_ALPHA) {
      continue;
    }

    const red = data[index];
    const green = data[index + 1];
    const blue = data[index + 2];
    if (red === undefined || green === undefined || blue === undefined) {
      continue;
    }

    const hsl = rgbToHsl(red, green, blue);
    const pixelScore = scorePixelColor(hsl, alpha);
    if (pixelScore <= 0) {
      continue;
    }

    const bucketIndex =
      Math.round((hsl.hue / 360) * HUE_BUCKET_COUNT) % HUE_BUCKET_COUNT;
    const bucket = buckets[bucketIndex];
    if (!bucket) {
      continue;
    }

    const theta = (hsl.hue * Math.PI) / 180;
    bucket.score += pixelScore;
    bucket.saturationTotal += hsl.saturation * pixelScore;
    bucket.lightnessTotal += hsl.lightness * pixelScore;
    bucket.xTotal += Math.cos(theta) * pixelScore;
    bucket.yTotal += Math.sin(theta) * pixelScore;
  }

  let bestBucket: HueBucket | null = null;
  for (const bucket of buckets) {
    if (!bestBucket || bucket.score > bestBucket.score) {
      bestBucket = bucket;
    }
  }

  if (!bestBucket || bestBucket.score < MIN_BUCKET_SCORE) {
    return null;
  }

  const averageSaturation = bestBucket.saturationTotal / bestBucket.score;
  const averageLightness = bestBucket.lightnessTotal / bestBucket.score;
  if (averageSaturation < MIN_AVERAGE_SATURATION) {
    return null;
  }

  const averageHue = wrapHue(
    (Math.atan2(bestBucket.yTotal, bestBucket.xTotal) * 180) / Math.PI,
  );

  return {
    hue: averageHue,
    saturation: averageSaturation,
    lightness: averageLightness,
  };
}

async function loadImage(sourceUrl: string): Promise<HTMLImageElement> {
  const image = new Image();

  return await new Promise((resolve, reject) => {
    image.onload = () => resolve(image);
    image.onerror = () =>
      reject(new Error('Could not load image for palette extraction.'));
    image.src = sourceUrl;
  });
}

function getSampleCanvasDimensions(
  width: number,
  height: number,
): { width: number; height: number } {
  if (width <= 0 || height <= 0) {
    return {
      width: SAMPLE_CANVAS_MAX_DIMENSION,
      height: SAMPLE_CANVAS_MAX_DIMENSION,
    };
  }

  if (width >= height) {
    return {
      width: SAMPLE_CANVAS_MAX_DIMENSION,
      height: Math.max(
        1,
        Math.round((height / width) * SAMPLE_CANVAS_MAX_DIMENSION),
      ),
    };
  }

  return {
    width: Math.max(
      1,
      Math.round((width / height) * SAMPLE_CANVAS_MAX_DIMENSION),
    ),
    height: SAMPLE_CANVAS_MAX_DIMENSION,
  };
}

async function deriveMinimalArtworkThemeFromUrl(
  sourceUrl: string,
): Promise<HslColor | null> {
  const image = await loadImage(sourceUrl);
  const dimensions = getSampleCanvasDimensions(
    image.naturalWidth,
    image.naturalHeight,
  );
  const canvas = document.createElement('canvas');
  canvas.width = dimensions.width;
  canvas.height = dimensions.height;

  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) {
    return null;
  }

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  let imageData: ImageData;
  try {
    imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  } catch {
    return null;
  }

  return findAccentColorFromImageData(imageData);
}

export interface UseMinimalArtworkThemeResult {
  accentColor: HslColor | null;
  artworkColor: string;
  swatches: ReadonlyArray<ArtworkColorSwatch>;
  theme: MinimalArtworkTheme;
}

export function useMinimalArtworkTheme(
  renderImageUrl: string,
  source: ArtworkColorSource,
  customColor: string,
): UseMinimalArtworkThemeResult {
  const [accentColor, setAccentColor] = useState<HslColor | null>(null);

  useEffect(() => {
    if (!renderImageUrl.trim()) {
      setAccentColor(null);
      return;
    }

    let cancelled = false;

    void deriveMinimalArtworkThemeFromUrl(renderImageUrl).then(
      (nextAccentColor) => {
        if (!cancelled) {
          setAccentColor(nextAccentColor);
        }
      },
      () => {
        if (!cancelled) {
          setAccentColor(null);
        }
      },
    );

    return () => {
      cancelled = true;
    };
  }, [renderImageUrl]);

  return {
    accentColor,
    artworkColor: resolveArtworkColor(accentColor, source, customColor),
    swatches: getArtworkColorSwatches(accentColor),
    theme: resolveMinimalArtworkTheme(accentColor, source, customColor),
  };
}

export const minimalArtworkThemeFallback = FALLBACK_MINIMAL_ARTWORK_THEME;
