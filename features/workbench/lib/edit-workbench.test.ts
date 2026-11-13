import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { toDurableCardState } from '@/lib/durable-card-state';
import { editWorkbench } from './edit-workbench.ts';
import { defaultMagicItemWorkbenchState } from './workbench-options.ts';
import {
  encodeWorkbenchEnvelopeV8,
  parseWorkbenchStorageJson,
  projectPersistedWorkbenchState,
} from './workbench-persistence.ts';

function withRenderedClassification(
  classificationAndRarity: string,
): MagicItemWorkbenchState {
  return {
    ...defaultMagicItemWorkbenchState,
    classificationAndRarity,
  };
}

function assertReloadMatchesDurable(
  state: MagicItemWorkbenchState,
  expected: ReturnType<typeof toDurableCardState>,
) {
  const parsed = parseWorkbenchStorageJson(
    encodeWorkbenchEnvelopeV8(state, null),
  );
  assert.equal(parsed.kind, 'v8');
  if (parsed.kind !== 'v8') {
    return;
  }
  assert.deepEqual(projectPersistedWorkbenchState(parsed.state), expected);
}

type MagicItemWorkbenchState =
  import('./workbench-options.ts').MagicItemWorkbenchState;

function durableExpectation(
  state: MagicItemWorkbenchState,
): ReturnType<typeof toDurableCardState> {
  return toDurableCardState(state);
}

describe('editWorkbench', () => {
  test('advanced image-right after typed classification uses rendered form fields', () => {
    const previous = { ...defaultMagicItemWorkbenchState };
    const rendered = withRenderedClassification('Weapon, rare');
    const next = editWorkbench(previous, rendered, {
      kind: 'field',
      key: 'cardLayout',
      value: 'image-right',
    });
    assert.equal(next.cardLayout, 'image-right');
    assert.equal(next.sideLayoutFlow, 'fixed');
    assert.equal(next.imageRightVerticalPosition, 13);
    assert.equal(next.cardWidthAuto, true);
    assert.equal(next.cardWidthPx, 608);
    assert.equal(next.classificationAndRarity, 'Weapon, rare');
    assertReloadMatchesDurable(next, durableExpectation(next));
  });

  test('advanced image-right with empty rendered classification positions at 14', () => {
    const previous = { ...defaultMagicItemWorkbenchState };
    const rendered = withRenderedClassification('');
    const next = editWorkbench(previous, rendered, {
      kind: 'field',
      key: 'cardLayout',
      value: 'image-right',
    });
    assert.equal(next.imageRightVerticalPosition, 14);
    assertReloadMatchesDurable(next, durableExpectation(next));
  });

  test('basic compact layout', () => {
    const previous = {
      ...defaultMagicItemWorkbenchState,
      classificationAndRarity: 'Weapon, rare',
    };
    const rendered = withRenderedClassification('Weapon, rare');
    const next = editWorkbench(previous, rendered, {
      kind: 'quick-layout',
      value: 'compact',
    });
    assert.equal(next.cardLayout, 'image-right');
    assert.equal(next.sideLayoutFlow, 'fluid');
    assert.equal(next.imageRightVerticalPosition, 0);
    assert.equal(next.cardWidthPx, 608);
    assert.equal(next.classificationAndRarity, 'Weapon, rare');
    assertReloadMatchesDurable(next, durableExpectation(next));
  });

  test('basic stacked after advanced image-right keeps vertical position', () => {
    const previous = editWorkbench(
      { ...defaultMagicItemWorkbenchState },
      withRenderedClassification('Weapon, rare'),
      { kind: 'field', key: 'cardLayout', value: 'image-right' },
    );
    const rendered = withRenderedClassification('Weapon, rare');
    const next = editWorkbench(previous, rendered, {
      kind: 'quick-layout',
      value: 'stacked',
    });
    assert.equal(next.cardLayout, 'vertical');
    assert.equal(next.sideLayoutFlow, 'fixed');
    assert.equal(next.cardWidthPx, 432);
    assert.equal(next.imageRightVerticalPosition, 13);
    assertReloadMatchesDurable(next, durableExpectation(next));
  });

  test('image-right fluid then fixed side layout with typed classification', () => {
    const previous = editWorkbench(
      { ...defaultMagicItemWorkbenchState },
      withRenderedClassification('Weapon, rare'),
      { kind: 'field', key: 'cardLayout', value: 'image-right' },
    );
    const fluid = editWorkbench(
      previous,
      withRenderedClassification('Weapon, rare'),
      { kind: 'field', key: 'sideLayoutFlow', value: 'fluid' },
    );
    const next = editWorkbench(
      fluid,
      withRenderedClassification('Weapon, rare'),
      { kind: 'field', key: 'sideLayoutFlow', value: 'fixed' },
    );
    assert.equal(next.imageRightVerticalPosition, 13);
  });

  test('manual width preserved when switching to image-right with auto false', () => {
    const previous = editWorkbench(
      { ...defaultMagicItemWorkbenchState },
      withRenderedClassification(''),
      { kind: 'card-width-px', value: 640 },
    );
    const next = editWorkbench(previous, withRenderedClassification(''), {
      kind: 'field',
      key: 'cardLayout',
      value: 'image-right',
    });
    assert.equal(next.cardWidthAuto, false);
    assert.equal(next.cardWidthPx, 612);
  });

  test('cardWidthAuto true on image-right sets default width', () => {
    const previous = editWorkbench(
      { ...defaultMagicItemWorkbenchState },
      withRenderedClassification(''),
      {
        kind: 'field',
        key: 'cardLayout',
        value: 'image-right',
      },
    );
    const next = editWorkbench(previous, withRenderedClassification(''), {
      kind: 'field',
      key: 'cardWidthAuto',
      value: true,
    });
    assert.equal(next.cardWidthAuto, true);
    assert.equal(next.cardWidthPx, 608);
  });

  test('card-width-px on vertical clamps manual width', () => {
    const previous = { ...defaultMagicItemWorkbenchState };
    const rendered = withRenderedClassification('');
    const next = editWorkbench(previous, rendered, {
      kind: 'card-width-px',
      value: 640,
    });
    assert.equal(next.cardWidthAuto, false);
    assert.equal(next.cardWidthPx, 600);
  });

  test('artwork custom color and neutral source keeps color string', () => {
    const previous = { ...defaultMagicItemWorkbenchState };
    const rendered = withRenderedClassification('');
    const colored = editWorkbench(previous, rendered, {
      kind: 'artwork-custom-color',
      value: '#aabbcc',
    });
    assert.equal(colored.artworkColorSource, 'custom');
    assert.equal(colored.artworkCustomColor, '#aabbcc');
    const neutral = editWorkbench(colored, rendered, {
      kind: 'field',
      key: 'artworkColorSource',
      value: 'neutral',
    });
    assert.equal(neutral.artworkColorSource, 'neutral');
    assert.equal(neutral.artworkCustomColor, '#aabbcc');
  });

  test('image-frame preset updates frame fields only', () => {
    const previous = editWorkbench(
      { ...defaultMagicItemWorkbenchState },
      withRenderedClassification('Weapon, rare'),
      { kind: 'field', key: 'cardLayout', value: 'image-right' },
    );
    const rendered = withRenderedClassification('Weapon, rare');
    const next = editWorkbench(previous, rendered, {
      kind: 'image-frame',
      value: 'bordered',
    });
    assert.equal(next.imageBorderWidthPx, 5);
    assert.equal(next.imageBorderRadius, 100);
    assert.equal(next.imageAspectRatio, 'square');
    assert.equal(next.classificationAndRarity, 'Weapon, rare');
    assert.equal(next.imageRightVerticalPosition, 13);
  });
});
