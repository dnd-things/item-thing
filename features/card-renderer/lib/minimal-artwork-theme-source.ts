'use client';

import {
  type ArtworkColorSource,
  createArtworkSourceColor,
  DEFAULT_NEUTRAL_ARTWORK_COLOR,
  formatHsl,
  formatHsla,
  getArtworkColorFallbackSourceColor,
  getComplementaryHue,
  type HslColor,
  type HueArtworkColorSource,
  parseHexColorToHsl,
  wrapHue,
} from './artwork-color-source.ts';

export interface MinimalArtworkTheme {
  base: string;
  highlight: string;
  shadow: string;
  grid: string;
  glow: string;
  accentGlow: string;
  isFallback: boolean;
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

const FALLBACK_SOURCE_COLOR = getArtworkColorFallbackSourceColor();

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function getMinimalArtworkThemeFallback(): MinimalArtworkTheme {
  return FALLBACK_MINIMAL_ARTWORK_THEME;
}

export function getMinimalArtworkThemeFallbackSourceColor(): HslColor {
  return FALLBACK_SOURCE_COLOR;
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

function createMinimalArtworkThemeSeedColor(
  complementaryHue: number,
  accentColor: HslColor,
  source: HueArtworkColorSource,
): HslColor {
  return createArtworkSourceColor(complementaryHue, accentColor, source);
}

export function resolveMinimalArtworkTheme(
  accentColor: HslColor | null,
  source: ArtworkColorSource,
  customColor: string,
): MinimalArtworkTheme {
  if (source === 'custom') {
    return buildMinimalArtworkThemeFromSourceColor(
      parseHexColorToHsl(customColor),
    );
  }
  if (source === 'neutral') {
    return buildMinimalArtworkThemeFromSourceColor(
      parseHexColorToHsl(DEFAULT_NEUTRAL_ARTWORK_COLOR),
    );
  }

  if (!accentColor) {
    if (source === 'auto-complement') {
      return FALLBACK_MINIMAL_ARTWORK_THEME;
    }

    return buildMinimalArtworkThemeFromSourceColor(
      createMinimalArtworkThemeSeedColor(
        FALLBACK_SOURCE_COLOR.hue,
        FALLBACK_SOURCE_COLOR,
        source,
      ),
    );
  }

  const complementaryHue = getComplementaryHue(accentColor.hue);
  return buildMinimalArtworkThemeFromSourceColor(
    createMinimalArtworkThemeSeedColor(complementaryHue, accentColor, source),
  );
}
