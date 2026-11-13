import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  defaultMagicItemWorkbenchState,
  withArtworkChoice,
  withItemDetails,
} from './workbench-options.ts';

describe('withArtworkChoice', () => {
  const base = {
    ...defaultMagicItemWorkbenchState,
    cardLayout: 'image-right' as const,
    itemName: 'Sunblade',
    resolvedImageAspectRatio: 1.5,
    imageFileName: 'old.png',
    imagePreviewUrl: 'data:image/png;base64,old',
  };

  test('select writes file name, preview, and ratio and leaves item name and layout', () => {
    const next = withArtworkChoice(base, {
      imageFileName: 'sword.png',
      imagePreviewUrl: 'data:image/png;base64,new',
      resolvedImageAspectRatio: 2,
    });
    assert.equal(next.imageFileName, 'sword.png');
    assert.equal(next.imagePreviewUrl, 'data:image/png;base64,new');
    assert.equal(next.resolvedImageAspectRatio, 2);
    assert.equal(next.itemName, 'Sunblade');
    assert.equal(next.cardLayout, 'image-right');
  });

  test('clear empties file name and preview and leaves ratio and item name', () => {
    const next = withArtworkChoice(base, null);
    assert.equal(next.imageFileName, '');
    assert.equal(next.imagePreviewUrl, '');
    assert.equal(next.resolvedImageAspectRatio, 1.5);
    assert.equal(next.itemName, 'Sunblade');
    assert.equal(next.cardLayout, 'image-right');
  });
});

describe('withItemDetails', () => {
  const base = {
    ...defaultMagicItemWorkbenchState,
    cardLayout: 'vertical' as const,
    imageFileName: 'kept.png',
    resolvedImageAspectRatio: 1.25,
    imagePreviewUrl: 'data:image/png;base64,kept',
  };

  test('writes the five text fields and leaves file name and ratio', () => {
    const next = withItemDetails(base, {
      itemName: 'Moonbow',
      classificationAndRarity: 'Weapon, very rare',
      requiresAttunement: true,
      flavorDescription: 'Cold light.',
      mechanicalDescription: 'Extra radiant.',
    });
    assert.equal(next.itemName, 'Moonbow');
    assert.equal(next.classificationAndRarity, 'Weapon, very rare');
    assert.equal(next.requiresAttunement, true);
    assert.equal(next.flavorDescription, 'Cold light.');
    assert.equal(next.mechanicalDescription, 'Extra radiant.');
    assert.equal(next.imageFileName, 'kept.png');
    assert.equal(next.imagePreviewUrl, 'data:image/png;base64,kept');
    assert.equal(next.resolvedImageAspectRatio, 1.25);
    assert.equal(next.cardLayout, 'vertical');
  });
});
