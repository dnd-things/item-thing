import assert from 'node:assert/strict';
import test from 'node:test';
import { getArtworkColorControlEntries } from './artwork-color-control-entries.ts';

const swatches = [
  { source: 'auto-complement', color: 'hsl(200 40% 50%)' },
  { source: 'triad-left', color: 'hsl(320 40% 50%)' },
  { source: 'triad-right', color: 'hsl(80 40% 50%)' },
  { source: 'neutral', color: '#2f3136' },
] as const;

test('basic entries contain only artwork-derived swatches', () => {
  const entries = getArtworkColorControlEntries(swatches, false);

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
    {
      type: 'swatch',
      source: 'triad-right',
      color: 'hsl(80 40% 50%)',
    },
    {
      type: 'swatch',
      source: 'neutral',
      color: '#2f3136',
    },
  ]);
});

test('advanced entries append custom color after the swatches', () => {
  const entries = getArtworkColorControlEntries(swatches, true);

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
    {
      type: 'swatch',
      source: 'triad-right',
      color: 'hsl(80 40% 50%)',
    },
    {
      type: 'swatch',
      source: 'neutral',
      color: '#2f3136',
    },
    {
      type: 'custom',
    },
  ]);
});
