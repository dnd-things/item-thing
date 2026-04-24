import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_ARTWORK_CUSTOM_COLOR,
  getArtworkColorSourceHue,
  normalizeArtworkCustomColor,
  resolveArtworkColor,
} from './artwork-color-source.ts';

test('triadic source hues are derived from the complementary hue', () => {
  assert.equal(getArtworkColorSourceHue(210, 'auto-complement'), 210);
  assert.equal(getArtworkColorSourceHue(210, 'triad-left'), 330);
  assert.equal(getArtworkColorSourceHue(210, 'triad-right'), 90);
});

test('custom color normalization lowercases and expands shorthand hex values', () => {
  assert.equal(normalizeArtworkCustomColor('#AbC'), '#aabbcc');
  assert.equal(normalizeArtworkCustomColor('FFAA00'), '#ffaa00');
});

test('invalid custom colors fall back to the default value', () => {
  assert.equal(
    normalizeArtworkCustomColor('not-a-color'),
    DEFAULT_ARTWORK_CUSTOM_COLOR,
  );
});

test('resolved artwork color follows the selected source', () => {
  const accentColor = {
    hue: 30,
    saturation: 0.5,
    lightness: 0.4,
  };

  assert.equal(
    resolveArtworkColor(accentColor, 'auto-complement', '#123456'),
    'hsl(210 50% 52%)',
  );
  assert.equal(
    resolveArtworkColor(accentColor, 'triad-left', '#123456'),
    'hsl(330 50% 52%)',
  );
  assert.equal(
    resolveArtworkColor(accentColor, 'triad-right', '#123456'),
    'hsl(90 50% 52%)',
  );
  assert.equal(
    resolveArtworkColor(accentColor, 'custom', '#123456'),
    '#123456',
  );
});
