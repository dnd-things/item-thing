import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { defaultMagicItemWorkbenchState } from '@/features/workbench/lib/workbench-options';
import {
  applyImageFrame,
  controlsForPlacement,
  normalizeWorkbenchStateForStyle,
  readBasicChoice,
  renderStyleFieldIds,
  resolveCardStyle,
} from './card-style';

describe('resolveCardStyle', () => {
  test('print', () => {
    assert.deepEqual(resolveCardStyle('print'), {
      capability: 'print',
      layout: 'print',
    });
  });

  test('minimal', () => {
    assert.deepEqual(resolveCardStyle('minimal'), {
      capability: 'minimal',
      layout: 'minimal',
    });
  });

  test('classic', () => {
    assert.deepEqual(resolveCardStyle('classic'), {
      capability: 'print',
      layout: 'pending',
    });
  });
});

describe('controlsForPlacement', () => {
  test('classic basic controls match print', () => {
    assert.deepEqual(
      controlsForPlacement('classic', 'basic'),
      controlsForPlacement('print', 'basic'),
    );
  });

  test('minimal basic omits quickLayout and imageFrame', () => {
    const basic = controlsForPlacement('minimal', 'basic');
    assert.equal(basic.includes('quickLayout'), false);
    assert.equal(basic.includes('imageFramePreset'), false);
  });
});

describe('image frame preset', () => {
  test('apply then read returns the same preset', () => {
    const bordered = applyImageFrame(
      defaultMagicItemWorkbenchState,
      'bordered',
    );
    assert.equal(readBasicChoice(bordered, 'imageFrame'), 'bordered');
    const borderless = applyImageFrame(
      defaultMagicItemWorkbenchState,
      'borderless',
    );
    assert.equal(readBasicChoice(borderless, 'imageFrame'), 'borderless');
  });

  test('width-only read null', () => {
    assert.equal(
      readBasicChoice(
        {
          ...defaultMagicItemWorkbenchState,
          imageBorderWidthPx: 5,
          imageBorderRadius: 0,
          imageAspectRatio: 'based-on-image',
        },
        'imageFrame',
      ),
      null,
    );
  });

  test('radius-only read null', () => {
    assert.equal(
      readBasicChoice(
        {
          ...defaultMagicItemWorkbenchState,
          imageBorderWidthPx: 0,
          imageBorderRadius: 100,
          imageAspectRatio: 'based-on-image',
        },
        'imageFrame',
      ),
      null,
    );
  });

  test('aspect-only read null', () => {
    assert.equal(
      readBasicChoice(
        {
          ...defaultMagicItemWorkbenchState,
          imageBorderWidthPx: 0,
          imageBorderRadius: 0,
          imageAspectRatio: 'square',
        },
        'imageFrame',
      ),
      null,
    );
  });
});

describe('readBasicChoice quickLayout', () => {
  test('vertical is stacked', () => {
    assert.equal(
      readBasicChoice(
        {
          ...defaultMagicItemWorkbenchState,
          cardLayout: 'vertical',
          sideLayoutFlow: 'fixed',
        },
        'quickLayout',
      ),
      'stacked',
    );
  });

  test('image-right fluid is compact', () => {
    assert.equal(
      readBasicChoice(
        {
          ...defaultMagicItemWorkbenchState,
          cardLayout: 'image-right',
          sideLayoutFlow: 'fluid',
        },
        'quickLayout',
      ),
      'compact',
    );
  });

  test('image-right fixed is null', () => {
    assert.equal(
      readBasicChoice(
        {
          ...defaultMagicItemWorkbenchState,
          cardLayout: 'image-right',
          sideLayoutFlow: 'fixed',
        },
        'quickLayout',
      ),
      null,
    );
  });
});

describe('normalizeWorkbenchStateForStyle', () => {
  test('minimal clears frame and layout fields and leaves cardStyle minimal', () => {
    const input = {
      ...defaultMagicItemWorkbenchState,
      cardStyle: 'minimal' as const,
      cardLayout: 'image-right' as const,
      sideLayoutFlow: 'fluid' as const,
      cardBorderRadius: 'small' as const,
      imageAspectRatio: 'square' as const,
      imageBorderRadius: 50,
      imageBorderWidthPx: 3,
      imageRightVerticalPosition: 8,
    };
    const normalized = normalizeWorkbenchStateForStyle(input);
    assert.equal(normalized.cardStyle, 'minimal');
    assert.equal(normalized.cardLayout, 'vertical');
    assert.equal(normalized.sideLayoutFlow, 'fixed');
    assert.equal(normalized.cardBorderRadius, 'none');
    assert.equal(normalized.imageAspectRatio, 'based-on-image');
    assert.equal(normalized.imageBorderRadius, 0);
    assert.equal(normalized.imageBorderWidthPx, 0);
    assert.equal(normalized.imageRightVerticalPosition, 0);
  });

  test('classic leaves portrait frame fields and cardStyle classic', () => {
    const input = {
      ...defaultMagicItemWorkbenchState,
      cardStyle: 'classic' as const,
      imageAspectRatio: 'portrait' as const,
      imageBorderRadius: 20,
      imageBorderWidthPx: 4,
    };
    const normalized = normalizeWorkbenchStateForStyle(input);
    assert.equal(normalized.cardStyle, 'classic');
    assert.equal(normalized.imageAspectRatio, 'portrait');
    assert.equal(normalized.imageBorderRadius, 20);
    assert.equal(normalized.imageBorderWidthPx, 4);
  });
});

describe('renderStyleFieldIds', () => {
  test('minimal omits frame fields that print includes', () => {
    const printFields = renderStyleFieldIds('print');
    const minimalFields = renderStyleFieldIds('minimal');
    assert.equal(minimalFields.includes('imageBorderRadius'), false);
    assert.equal(minimalFields.includes('imageBorderWidthPx'), false);
    assert.equal(printFields.includes('imageBorderRadius'), true);
    assert.equal(printFields.includes('imageBorderWidthPx'), true);
  });
});
