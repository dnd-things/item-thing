import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildMinimalArtworkThemeFromSourceColor,
  DEFAULT_MINIMAL_ARTWORK_THEME_CUSTOM_COLOR,
  getMinimalArtworkThemeFallback,
  getMinimalArtworkThemeSourceHue,
  normalizeMinimalArtworkThemeCustomColor,
  resolveMinimalArtworkTheme,
} from './minimal-artwork-theme-source.ts';

test('auto mode keeps the existing fallback theme when no accent color is available', () => {
  const theme = resolveMinimalArtworkTheme(
    null,
    'auto-complement',
    DEFAULT_MINIMAL_ARTWORK_THEME_CUSTOM_COLOR,
  );

  assert.deepEqual(theme, getMinimalArtworkThemeFallback());
});

test('triadic source hues are derived from the complementary hue', () => {
  assert.equal(getMinimalArtworkThemeSourceHue(210, 'auto-complement'), 210);
  assert.equal(getMinimalArtworkThemeSourceHue(210, 'triad-left'), 330);
  assert.equal(getMinimalArtworkThemeSourceHue(210, 'triad-right'), 90);
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

test('custom color normalization lowercases and expands shorthand hex values', () => {
  assert.equal(normalizeMinimalArtworkThemeCustomColor('#AbC'), '#aabbcc');
  assert.equal(normalizeMinimalArtworkThemeCustomColor('FFAA00'), '#ffaa00');
});

test('invalid custom colors fall back to the default value', () => {
  assert.equal(
    normalizeMinimalArtworkThemeCustomColor('not-a-color'),
    DEFAULT_MINIMAL_ARTWORK_THEME_CUSTOM_COLOR,
  );
});
