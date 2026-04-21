'use client';

import { useEffect, useState } from 'react';

const FALLBACK_MINIMAL_ARTWORK_THEME = {
  base: 'hsl(234 30% 23%)',
  highlight: 'hsl(254 29% 43%)',
  shadow: 'hsl(230 49% 10%)',
  grid: 'hsla(251 100% 91% / 0.12)',
  glow: 'hsla(255 62% 77% / 0.18)',
  accentGlow: 'hsla(224 100% 97% / 0.08)',
  isFallback: true,
} satisfies MinimalArtworkTheme;

const SAMPLE_CANVAS_MAX_DIMENSION = 48;
const MIN_ALPHA = 24;
const HUE_BUCKET_COUNT = 24;
const MIN_BUCKET_SCORE = 14;
const MIN_AVERAGE_SATURATION = 0.18;

export interface MinimalArtworkTheme {
  base: string;
  highlight: string;
  shadow: string;
  grid: string;
  glow: string;
  accentGlow: string;
  isFallback: boolean;
}

interface HslColor {
  hue: number;
  saturation: number;
  lightness: number;
}

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

function wrapHue(hue: number): number {
  return ((hue % 360) + 360) % 360;
}

function rgbChannelToUnit(value: number): number {
  return value / 255;
}

function rgbToHsl(red: number, green: number, blue: number): HslColor {
  const r = rgbChannelToUnit(red);
  const g = rgbChannelToUnit(green);
  const b = rgbChannelToUnit(blue);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 2;

  if (max === min) {
    return { hue: 0, saturation: 0, lightness };
  }

  const delta = max - min;
  const saturation =
    lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);

  let hue = 0;
  switch (max) {
    case r:
      hue = (g - b) / delta + (g < b ? 6 : 0);
      break;
    case g:
      hue = (b - r) / delta + 2;
      break;
    default:
      hue = (r - g) / delta + 4;
      break;
  }

  return {
    hue: wrapHue(hue * 60),
    saturation,
    lightness,
  };
}

function formatHsl(hue: number, saturation: number, lightness: number): string {
  return `hsl(${Math.round(wrapHue(hue))} ${Math.round(clamp(saturation, 0, 1) * 100)}% ${Math.round(clamp(lightness, 0, 1) * 100)}%)`;
}

function formatHsla(
  hue: number,
  saturation: number,
  lightness: number,
  alpha: number,
): string {
  return `hsla(${Math.round(wrapHue(hue))} ${Math.round(clamp(saturation, 0, 1) * 100)}% ${Math.round(clamp(lightness, 0, 1) * 100)}% / ${clamp(alpha, 0, 1).toFixed(2)})`;
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

function buildThemeFromAccent(accent: HslColor): MinimalArtworkTheme {
  const complementHue = wrapHue(accent.hue + 180);
  const baseSaturation = clamp(accent.saturation * 0.6, 0.2, 0.34);
  const highlightSaturation = clamp(baseSaturation + 0.05, 0.24, 0.4);
  const shadowSaturation = clamp(baseSaturation + 0.04, 0.22, 0.38);
  const glowHue = wrapHue(complementHue - 16);
  const accentGlowHue = wrapHue(accent.hue - 10);

  return {
    base: formatHsl(complementHue, baseSaturation, 0.24),
    highlight: formatHsl(glowHue, highlightSaturation, 0.42),
    shadow: formatHsl(complementHue, shadowSaturation, 0.12),
    grid: formatHsla(
      complementHue,
      clamp(baseSaturation * 0.55, 0.12, 0.2),
      0.86,
      0.13,
    ),
    glow: formatHsla(
      glowHue,
      clamp(highlightSaturation * 1.1, 0.24, 0.42),
      0.7,
      0.16,
    ),
    accentGlow: formatHsla(
      accentGlowHue,
      clamp(accent.saturation, 0.26, 0.52),
      0.9,
      0.08,
    ),
    isFallback: false,
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
): Promise<MinimalArtworkTheme> {
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
    return FALLBACK_MINIMAL_ARTWORK_THEME;
  }

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  let imageData: ImageData;
  try {
    imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  } catch {
    return FALLBACK_MINIMAL_ARTWORK_THEME;
  }

  const accent = findAccentColorFromImageData(imageData);
  if (!accent) {
    return FALLBACK_MINIMAL_ARTWORK_THEME;
  }

  return buildThemeFromAccent(accent);
}

export function useMinimalArtworkTheme(
  renderImageUrl: string,
): MinimalArtworkTheme {
  const [theme, setTheme] = useState<MinimalArtworkTheme>(
    FALLBACK_MINIMAL_ARTWORK_THEME,
  );

  useEffect(() => {
    if (!renderImageUrl.trim()) {
      setTheme(FALLBACK_MINIMAL_ARTWORK_THEME);
      return;
    }

    let cancelled = false;

    void deriveMinimalArtworkThemeFromUrl(renderImageUrl).then(
      (nextTheme) => {
        if (!cancelled) {
          setTheme(nextTheme);
        }
      },
      () => {
        if (!cancelled) {
          setTheme(FALLBACK_MINIMAL_ARTWORK_THEME);
        }
      },
    );

    return () => {
      cancelled = true;
    };
  }, [renderImageUrl]);

  return theme;
}

export const minimalArtworkThemeFallback = FALLBACK_MINIMAL_ARTWORK_THEME;
