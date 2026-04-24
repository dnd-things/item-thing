'use client';

export type ArtworkColorSource =
  | 'auto-complement'
  | 'triad-left'
  | 'triad-right'
  | 'custom';

export type DerivedArtworkColorSource = Exclude<ArtworkColorSource, 'custom'>;

export interface HslColor {
  hue: number;
  saturation: number;
  lightness: number;
}

export interface ArtworkColorSwatch {
  source: DerivedArtworkColorSource;
  color: string;
}

const FALLBACK_SOURCE_COLOR = {
  hue: 234,
  saturation: 0.5,
  lightness: 0.23,
} satisfies HslColor;

export const DEFAULT_ARTWORK_CUSTOM_COLOR = '#292d4c' as const;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function wrapHue(hue: number): number {
  return ((hue % 360) + 360) % 360;
}

function rgbChannelToUnit(value: number): number {
  return value / 255;
}

export function rgbToHsl(red: number, green: number, blue: number): HslColor {
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

export function formatHsl(
  hue: number,
  saturation: number,
  lightness: number,
): string {
  return `hsl(${Math.round(wrapHue(hue))} ${Math.round(clamp(saturation, 0, 1) * 100)}% ${Math.round(clamp(lightness, 0, 1) * 100)}%)`;
}

export function formatHsla(
  hue: number,
  saturation: number,
  lightness: number,
  alpha: number,
): string {
  return `hsla(${Math.round(wrapHue(hue))} ${Math.round(clamp(saturation, 0, 1) * 100)}% ${Math.round(clamp(lightness, 0, 1) * 100)}% / ${clamp(alpha, 0, 1).toFixed(2)})`;
}

function normalizeHexChannel(value: string): string | null {
  if (!/^[0-9a-f]{1,2}$/i.test(value)) {
    return null;
  }
  return value.length === 1
    ? `${value}${value}`.toLowerCase()
    : value.toLowerCase();
}

export function normalizeArtworkCustomColor(
  value: string,
  fallback = DEFAULT_ARTWORK_CUSTOM_COLOR,
): string {
  const trimmed = value.trim();
  const withoutHash = trimmed.startsWith('#') ? trimmed.slice(1) : trimmed;

  if (withoutHash.length === 3) {
    const red = normalizeHexChannel(withoutHash[0] ?? '');
    const green = normalizeHexChannel(withoutHash[1] ?? '');
    const blue = normalizeHexChannel(withoutHash[2] ?? '');
    if (!red || !green || !blue) {
      return fallback;
    }
    return `#${red}${green}${blue}`;
  }

  if (withoutHash.length === 6) {
    const red = normalizeHexChannel(withoutHash.slice(0, 2));
    const green = normalizeHexChannel(withoutHash.slice(2, 4));
    const blue = normalizeHexChannel(withoutHash.slice(4, 6));
    if (!red || !green || !blue) {
      return fallback;
    }
    return `#${red}${green}${blue}`;
  }

  return fallback;
}

export function parseHexColorToHsl(value: string): HslColor {
  const normalized = normalizeArtworkCustomColor(value);
  const red = Number.parseInt(normalized.slice(1, 3), 16);
  const green = Number.parseInt(normalized.slice(3, 5), 16);
  const blue = Number.parseInt(normalized.slice(5, 7), 16);
  return rgbToHsl(red, green, blue);
}

export function getArtworkColorFallbackSourceColor(): HslColor {
  return FALLBACK_SOURCE_COLOR;
}

export function getArtworkColorSourceHue(
  complementaryHue: number,
  source: DerivedArtworkColorSource,
): number {
  switch (source) {
    case 'triad-left':
      return wrapHue(complementaryHue + 120);
    case 'triad-right':
      return wrapHue(complementaryHue + 240);
    default:
      return wrapHue(complementaryHue);
  }
}

export function getComplementaryHue(accentHue: number): number {
  return wrapHue(accentHue + 180);
}

export function createArtworkSourceColor(
  complementaryHue: number,
  accentColor: HslColor,
  source: DerivedArtworkColorSource,
): HslColor {
  return {
    hue: getArtworkColorSourceHue(complementaryHue, source),
    saturation: accentColor.saturation,
    lightness: accentColor.lightness,
  };
}

export function getArtworkColorSwatches(
  accentColor: HslColor | null,
): ReadonlyArray<ArtworkColorSwatch> {
  const sourceColor = accentColor ?? FALLBACK_SOURCE_COLOR;
  const complementaryHue = accentColor
    ? getComplementaryHue(accentColor.hue)
    : sourceColor.hue;
  const swatchSaturation = clamp(sourceColor.saturation, 0.34, 0.74);

  return (['auto-complement', 'triad-left', 'triad-right'] as const).map(
    (source) => ({
      source,
      color: formatHsl(
        getArtworkColorSourceHue(complementaryHue, source),
        swatchSaturation,
        0.52,
      ),
    }),
  );
}

export function resolveArtworkColor(
  accentColor: HslColor | null,
  source: ArtworkColorSource,
  customColor: string,
): string {
  if (source === 'custom') {
    return normalizeArtworkCustomColor(customColor);
  }

  const swatch = getArtworkColorSwatches(accentColor).find(
    (entry) => entry.source === source,
  );
  return swatch?.color ?? getArtworkColorSwatches(null)[0]?.color ?? '';
}
