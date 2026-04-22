'use client';

export type MinimalArtworkThemeSource =
  | 'auto-complement'
  | 'triad-left'
  | 'triad-right'
  | 'custom';

export interface MinimalArtworkTheme {
  base: string;
  highlight: string;
  shadow: string;
  grid: string;
  glow: string;
  accentGlow: string;
  isFallback: boolean;
}

export interface HslColor {
  hue: number;
  saturation: number;
  lightness: number;
}

export interface MinimalArtworkThemeSwatch {
  source: Exclude<MinimalArtworkThemeSource, 'custom'>;
  color: string;
}

const FALLBACK_MINIMAL_ARTWORK_THEME = {
  base: 'hsl(234 30% 23%)',
  highlight: 'hsl(254 29% 43%)',
  shadow: 'hsl(230 49% 10%)',
  grid: 'hsla(251 100% 91% / 0.12)',
  glow: 'hsla(255 62% 77% / 0.18)',
  accentGlow: 'hsla(224 100% 97% / 0.08)',
  isFallback: true,
} satisfies MinimalArtworkTheme;

const FALLBACK_SOURCE_COLOR = {
  hue: 234,
  saturation: 0.5,
  lightness: 0.23,
} satisfies HslColor;

export const DEFAULT_MINIMAL_ARTWORK_THEME_CUSTOM_COLOR = '#292d4c' as const;

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

function normalizeHexChannel(value: string): string | null {
  if (!/^[0-9a-f]{1,2}$/i.test(value)) {
    return null;
  }
  return value.length === 1
    ? `${value}${value}`.toLowerCase()
    : value.toLowerCase();
}

export function normalizeMinimalArtworkThemeCustomColor(
  value: string,
  fallback = DEFAULT_MINIMAL_ARTWORK_THEME_CUSTOM_COLOR,
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
  const normalized = normalizeMinimalArtworkThemeCustomColor(value);
  const red = Number.parseInt(normalized.slice(1, 3), 16);
  const green = Number.parseInt(normalized.slice(3, 5), 16);
  const blue = Number.parseInt(normalized.slice(5, 7), 16);
  return rgbToHsl(red, green, blue);
}

export function getMinimalArtworkThemeFallback(): MinimalArtworkTheme {
  return FALLBACK_MINIMAL_ARTWORK_THEME;
}

export function getMinimalArtworkThemeFallbackSourceColor(): HslColor {
  return FALLBACK_SOURCE_COLOR;
}

export function getMinimalArtworkThemeSourceHue(
  complementaryHue: number,
  source: Exclude<MinimalArtworkThemeSource, 'custom'>,
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

export function buildMinimalArtworkThemeFromSourceColor(
  sourceColor: HslColor,
): MinimalArtworkTheme {
  const sourceHue = wrapHue(sourceColor.hue);
  const baseSaturation = clamp(sourceColor.saturation * 0.6, 0.2, 0.34);
  const highlightSaturation = clamp(baseSaturation + 0.05, 0.24, 0.4);
  const shadowSaturation = clamp(baseSaturation + 0.04, 0.22, 0.38);
  const glowHue = wrapHue(sourceHue - 16);
  const accentGlowHue = wrapHue(sourceHue + 170);

  return {
    base: formatHsl(sourceHue, baseSaturation, 0.24),
    highlight: formatHsl(glowHue, highlightSaturation, 0.42),
    shadow: formatHsl(sourceHue, shadowSaturation, 0.12),
    grid: formatHsla(
      sourceHue,
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
      clamp(sourceColor.saturation, 0.26, 0.52),
      0.9,
      0.08,
    ),
    isFallback: false,
  };
}

export function createMinimalArtworkThemeSourceColor(
  complementaryHue: number,
  accentColor: HslColor,
  source: Exclude<MinimalArtworkThemeSource, 'custom'>,
): HslColor {
  return {
    hue: getMinimalArtworkThemeSourceHue(complementaryHue, source),
    saturation: accentColor.saturation,
    lightness: accentColor.lightness,
  };
}

export function resolveMinimalArtworkTheme(
  accentColor: HslColor | null,
  source: MinimalArtworkThemeSource,
  customColor: string,
): MinimalArtworkTheme {
  if (source === 'custom') {
    return buildMinimalArtworkThemeFromSourceColor(
      parseHexColorToHsl(customColor),
    );
  }

  if (!accentColor) {
    if (source === 'auto-complement') {
      return FALLBACK_MINIMAL_ARTWORK_THEME;
    }

    return buildMinimalArtworkThemeFromSourceColor(
      createMinimalArtworkThemeSourceColor(
        FALLBACK_SOURCE_COLOR.hue,
        FALLBACK_SOURCE_COLOR,
        source,
      ),
    );
  }

  const complementaryHue = getComplementaryHue(accentColor.hue);
  return buildMinimalArtworkThemeFromSourceColor(
    createMinimalArtworkThemeSourceColor(complementaryHue, accentColor, source),
  );
}

export function getMinimalArtworkThemeSwatches(
  accentColor: HslColor | null,
): ReadonlyArray<MinimalArtworkThemeSwatch> {
  const sourceColor = accentColor ?? FALLBACK_SOURCE_COLOR;
  const complementaryHue = accentColor
    ? getComplementaryHue(accentColor.hue)
    : sourceColor.hue;
  const swatchSaturation = clamp(sourceColor.saturation, 0.34, 0.74);

  return (['auto-complement', 'triad-left', 'triad-right'] as const).map(
    (source) => ({
      source,
      color: formatHsl(
        getMinimalArtworkThemeSourceHue(complementaryHue, source),
        swatchSaturation,
        0.52,
      ),
    }),
  );
}
