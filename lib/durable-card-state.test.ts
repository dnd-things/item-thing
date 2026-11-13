import assert from 'node:assert/strict';
import { test } from 'node:test';
import sharp from 'sharp';
import { workbenchSnapshotValidator } from '../convex/lib/workbenchSnapshotValidators.ts';
import { mapRenderRequestToMagicItemWorkbenchState } from '../features/server-render-card/map-render-request-to-workbench-state.ts';
import { parseRenderCardMultipartFormData } from '../features/server-render-card/render-card-form-schema.ts';
import { defaultMagicItemWorkbenchState } from '../features/workbench/lib/workbench-options.ts';
import {
  encodeWorkbenchEnvelopeV8,
  parseWorkbenchStorageJson,
} from '../features/workbench/lib/workbench-persistence.ts';
import { toWorkbenchSnapshotForExport } from '../features/workbench/lib/workbench-snapshot-for-export.ts';
import {
  durableCardStateSchema,
  toDurableCardState,
} from './durable-card-state.ts';

async function requestForm() {
  const png = await sharp({
    create: { width: 2, height: 2, channels: 4, background: '#ff0000' },
  })
    .png()
    .toBuffer();
  const form = new FormData();
  form.set(
    'artwork',
    new File([new Uint8Array(png)], 'sword.png', { type: 'image/png' }),
  );
  form.set(
    'item',
    JSON.stringify({
      itemName: 'Sunblade',
      classificationAndRarity: 'Weapon, rare',
      requiresAttunement: true,
      flavorDescription: 'Warm.',
      mechanicalDescription: 'Deals radiant damage.',
    }),
  );
  form.set('format', 'png');
  form.set('pixelRatio', '2');
  return form;
}

test('real render request produces only durable fields for both storage adapters', async () => {
  for (const style of ['print', 'minimal'] as const) {
    const parsed = await parseRenderCardMultipartFormData(
      await requestForm(),
      style,
    );
    assert.equal(parsed.ok, true);

    const mapped = await mapRenderRequestToMagicItemWorkbenchState({
      artworkBuffer: parsed.artworkBuffer,
      artworkFileName: parsed.artwork.name,
      fields: parsed.fields,
      item: parsed.item,
      style,
    });
    assert.equal('format' in mapped.workbenchState, false);
    assert.equal('pixelRatio' in mapped.workbenchState, false);
    const rendered = {
      ...mapped.workbenchState,
      artworkDrawPolicy: 'export',
      artworkLogicalWidth: 2,
      artworkLogicalHeight: 2,
      preparedArtworkTransformed: true,
      exportGeneration: 7,
      format: 'png',
      pixelRatio: 2,
    };
    const snapshot = toWorkbenchSnapshotForExport(rendered);
    assert.equal(snapshot.itemName, 'Sunblade');
    assert.equal(snapshot.cardStyle, style);
    assert.equal(snapshot.requiresAttunement, true);
    assert.equal(snapshot.imageFileName, 'sword.png');
    assert.equal(snapshot.mechanicalDescription, 'Deals radiant damage.');
    assert.deepEqual(
      Object.keys(snapshot).sort(),
      Object.keys(workbenchSnapshotValidator.fields).sort(),
    );
    for (const key of [
      'imagePreviewUrl',
      'format',
      'pixelRatio',
      'exportGeneration',
      'artworkDrawPolicy',
      'artworkLogicalWidth',
      'artworkLogicalHeight',
      'preparedArtworkTransformed',
    ])
      assert.equal(key in snapshot, false, key);
    const envelope = encodeWorkbenchEnvelopeV8(rendered, null);
    assert.deepEqual(JSON.parse(envelope).state, snapshot);
    const restored = parseWorkbenchStorageJson(envelope);
    assert.equal(restored.kind, 'v8');
  }
});

test('legacy color request fields are rejected rather than silently migrated', async () => {
  const form = await requestForm();
  form.set('minimalArtworkThemeSource', 'neutral');
  const result = await parseRenderCardMultipartFormData(form, 'minimal');
  assert.equal(result.ok, false);
});

test('incompatible local saves reset, current state round-trips without transient fields', () => {
  const snapshot = toDurableCardState(defaultMagicItemWorkbenchState);
  for (const version of [1, 2, 3, 4, 5, 6, 7, 9])
    assert.deepEqual(
      parseWorkbenchStorageJson(
        JSON.stringify({ version, state: snapshot, assetKey: null }),
      ),
      { kind: 'reset' },
    );
  const {
    artworkColorSource: _source,
    artworkCustomColor: _color,
    ...old
  } = snapshot;
  assert.deepEqual(
    parseWorkbenchStorageJson(
      JSON.stringify({
        version: 8,
        state: {
          ...old,
          minimalArtworkThemeSource: 'neutral',
          minimalArtworkThemeCustomColor: '#123456',
        },
        assetKey: null,
      }),
    ),
    { kind: 'reset' },
  );
  assert.equal(
    durableCardStateSchema.strict().safeParse(snapshot).success,
    true,
  );
  assert.equal(
    parseWorkbenchStorageJson(
      encodeWorkbenchEnvelopeV8(defaultMagicItemWorkbenchState, null),
    ).kind,
    'v8',
  );
});

test('invalid persisted vertical positions reset rather than restoring invalid placement', () => {
  const state = toDurableCardState(defaultMagicItemWorkbenchState);
  for (const imageRightVerticalPosition of [-10000, 0.5]) {
    assert.deepEqual(
      parseWorkbenchStorageJson(
        JSON.stringify({
          version: 8,
          state: { ...state, imageRightVerticalPosition },
          assetKey: null,
        }),
      ),
      { kind: 'reset' },
    );
  }
});
