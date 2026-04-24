import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_ARTWORK_CUSTOM_COLOR } from './artwork-color-source.ts';
import {
  buildMinimalArtworkThemeFromSourceColor,
  getMinimalArtworkThemeFallback,
  resolveMinimalArtworkTheme,
} from './minimal-artwork-theme-source.ts';

test('auto mode keeps the existing fallback theme when no accent color is available', () => {
  const theme = resolveMinimalArtworkTheme(
    null,
    'auto-complement',
    DEFAULT_ARTWORK_CUSTOM_COLOR,
  );

  assert.deepEqual(theme, getMinimalArtworkThemeFallback());
});

test('custom mode uses the custom color hue to build the theme', () => {
  const theme = resolveMinimalArtworkTheme(null, 'custom', '#ff0000');
  const expectedTheme = buildMinimalArtworkThemeFromSourceColor({
    hue: 0,
    saturation: 1,
    lightness: 0.5,
  });

  assert.deepEqual(theme, expectedTheme);
});
