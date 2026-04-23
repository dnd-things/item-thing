import assert from 'node:assert/strict';
import test from 'node:test';
import { getMinimalArtworkThemeControlEntries } from './minimal-artwork-theme-control-entries.ts';

test('hides the custom color entry when custom colors are disabled', () => {
  const entries = getMinimalArtworkThemeControlEntries(
    [
      { source: 'auto-complement', color: 'hsl(200 40% 50%)' },
      { source: 'triad-left', color: 'hsl(320 40% 50%)' },
    ],
    false,
  );

  assert.deepEqual(entries, [
    {
      type: 'swatch',
      source: 'auto-complement',
      color: 'hsl(200 40% 50%)',
    },
    {
      type: 'swatch',
      source: 'triad-left',
      color: 'hsl(320 40% 50%)',
    },
  ]);
});

test('keeps the custom color entry at the end when custom colors are enabled', () => {
  const entries = getMinimalArtworkThemeControlEntries(
    [{ source: 'triad-right', color: 'hsl(80 40% 50%)' }],
    true,
  );

  assert.deepEqual(entries, [
    {
      type: 'swatch',
      source: 'triad-right',
      color: 'hsl(80 40% 50%)',
    },
    {
      type: 'custom',
    },
  ]);
});
