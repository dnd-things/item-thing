import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..',
);
const require = createRequire(path.join(root, 'package.json'));

function loader(overrides: Record<string, unknown> = {}) {
  const ts = require('typescript') as typeof import('typescript');
  const cache = new Map<string, { exports: Record<string, unknown> }>();
  const load = (file: string): Record<string, unknown> => {
    const resolved = path.resolve(root, file);
    const cached = cache.get(resolved);
    if (cached) {
      return cached.exports;
    }
    const module = { exports: {} as Record<string, unknown> };
    cache.set(resolved, module);
    const source = ts.transpileModule(fs.readFileSync(resolved, 'utf8'), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
        esModuleInterop: true,
      },
    }).outputText;
    const localRequire = (id: string): unknown => {
      if (Object.hasOwn(overrides, id)) {
        return overrides[id];
      }
      if (id.endsWith('.css')) {
        return {
          __esModule: true,
          default: new Proxy({}, { get: (_target, key) => key }),
        };
      }
      if (id.startsWith('.') || id.startsWith('@/')) {
        let next = id.startsWith('@/')
          ? path.join(root, id.slice(2))
          : path.resolve(path.dirname(resolved), id);
        if (!fs.existsSync(next)) {
          if (fs.existsSync(`${next}.ts`)) {
            next = `${next}.ts`;
          } else if (fs.existsSync(`${next}.tsx`)) {
            next = `${next}.tsx`;
          } else {
            return require(next);
          }
        }
        if (next.endsWith('.ts') || next.endsWith('.tsx')) {
          return load(next);
        }
        return require(next);
      }
      return require(id);
    };
    new Function('require', 'module', 'exports', source)(
      localRequire,
      module,
      module.exports,
    );
    return module.exports;
  };
  return load;
}

const placement = loader()(
  'features/card-renderer/lib/image-right-artwork-placement.ts',
) as {
  imageRightArtworkMarginTopRem: (input: {
    imageRightVerticalPosition: number;
    sideLayoutFlow: 'fixed' | 'fluid';
    classificationAndRarity: string;
    surfaceHeightPx: number;
  }) => number;
  defaultImageRightVerticalPosition: (
    flow: 'fixed' | 'fluid',
    classificationAndRarity: string,
  ) => number;
  reconcileImageRightVerticalPosition: (input: {
    cardLayout: 'vertical' | 'image-right';
    sideLayoutFlow: 'fixed' | 'fluid';
    classificationAndRarity: string;
    surface: { kind: 'unmeasured' } | { kind: 'measured'; heightPx: number };
    stored: number;
  }) => {
    bounds: { min: number; max: number };
    stored: number;
    sliderPercent: number;
  };
  storedImageRightVerticalPositionForSlider: (
    percent: number,
    bounds: { min: number; max: number },
  ) => number;
  measureFixedImageRightSurfaceHeightPx: (surface: {
    offsetHeight: number;
  }) => number;
  imageRightVerticalSlider: { min: number; max: number; step: number };
};

const classification = 'Weapon, rare';

const baseReconcile = {
  cardLayout: 'image-right' as const,
  sideLayoutFlow: 'fixed' as const,
  classificationAndRarity: classification,
};

test('fixed margin formula', () => {
  assert.equal(
    placement.imageRightArtworkMarginTopRem({
      imageRightVerticalPosition: 32,
      sideLayoutFlow: 'fixed',
      classificationAndRarity: classification,
      surfaceHeightPx: 779,
    }),
    30,
  );
  assert.equal(
    placement.imageRightArtworkMarginTopRem({
      imageRightVerticalPosition: 32,
      sideLayoutFlow: 'fixed',
      classificationAndRarity: classification,
      surfaceHeightPx: 0,
    }),
    9.5,
  );
  assert.equal(
    placement.imageRightArtworkMarginTopRem({
      imageRightVerticalPosition: 13,
      sideLayoutFlow: 'fixed',
      classificationAndRarity: classification,
      surfaceHeightPx: 779,
    }),
    0,
  );
  assert.equal(
    placement.imageRightArtworkMarginTopRem({
      imageRightVerticalPosition: 8,
      sideLayoutFlow: 'fluid',
      classificationAndRarity: classification,
      surfaceHeightPx: 779,
    }),
    4,
  );
  assert.equal(
    placement.imageRightArtworkMarginTopRem({
      imageRightVerticalPosition: 8,
      sideLayoutFlow: 'fluid',
      classificationAndRarity: classification,
      surfaceHeightPx: 0,
    }),
    4,
  );
});

test('measureFixedImageRightSurfaceHeightPx reads offsetHeight', () => {
  assert.equal(
    placement.measureFixedImageRightSurfaceHeightPx({ offsetHeight: 779 }),
    779,
  );
});

test('defaultImageRightVerticalPosition', () => {
  assert.equal(
    placement.defaultImageRightVerticalPosition('fixed', classification),
    13,
  );
  assert.equal(placement.defaultImageRightVerticalPosition('fixed', ''), 14);
  assert.equal(placement.defaultImageRightVerticalPosition('fixed', '   '), 14);
  assert.equal(
    placement.defaultImageRightVerticalPosition('fluid', classification),
    0,
  );
});

test('reconcile classification bounds and slider mapping', () => {
  const withClass = placement.reconcileImageRightVerticalPosition({
    ...baseReconcile,
    surface: { kind: 'unmeasured' },
    stored: 13,
  });
  assert.equal(withClass.bounds.min, -6);
  assert.equal(withClass.bounds.max, 32);
  assert.equal(withClass.stored, 13);
  assert.equal(withClass.sliderPercent, 50);

  assert.equal(
    placement.storedImageRightVerticalPositionForSlider(0, withClass.bounds),
    -6,
  );
  assert.equal(
    placement.storedImageRightVerticalPositionForSlider(100, withClass.bounds),
    32,
  );
});

test('reconcile fixed measured clamps', () => {
  const withClass = placement.reconcileImageRightVerticalPosition({
    ...baseReconcile,
    surface: { kind: 'measured', heightPx: 779 },
    stored: 33,
  });
  assert.equal(withClass.stored, 32);

  const belowMin = placement.reconcileImageRightVerticalPosition({
    ...baseReconcile,
    surface: { kind: 'measured', heightPx: 779 },
    stored: -7,
  });
  assert.equal(belowMin.stored, -6);

  const emptyClass = placement.reconcileImageRightVerticalPosition({
    ...baseReconcile,
    classificationAndRarity: '',
    surface: { kind: 'measured', heightPx: 779 },
    stored: -8,
  });
  assert.equal(emptyClass.bounds.min, -4);
  assert.equal(emptyClass.stored, -4);
});

test('reconcile fluid measured', () => {
  const reconciled = placement.reconcileImageRightVerticalPosition({
    ...baseReconcile,
    sideLayoutFlow: 'fluid',
    surface: { kind: 'measured', heightPx: 640 },
    stored: 41,
  });
  assert.equal(reconciled.bounds.max, 40);
  assert.equal(reconciled.stored, 40);

  const stays = placement.reconcileImageRightVerticalPosition({
    ...baseReconcile,
    sideLayoutFlow: 'fluid',
    surface: { kind: 'measured', heightPx: 640 },
    stored: 40,
  });
  assert.equal(stays.stored, 40);
});

test('reconcile unmeasured does not clamp stored', () => {
  const high = placement.reconcileImageRightVerticalPosition({
    ...baseReconcile,
    surface: { kind: 'unmeasured' },
    stored: 40,
  });
  assert.equal(high.bounds.max, 32);
  assert.equal(high.stored, 40);

  const low = placement.reconcileImageRightVerticalPosition({
    ...baseReconcile,
    classificationAndRarity: '',
    surface: { kind: 'unmeasured' },
    stored: -8,
  });
  assert.equal(low.bounds.max, 32);
  assert.equal(low.stored, -8);
});

test('reconcile vertical layout', () => {
  const reconciled = placement.reconcileImageRightVerticalPosition({
    cardLayout: 'vertical',
    sideLayoutFlow: 'fixed',
    classificationAndRarity: classification,
    surface: { kind: 'measured', heightPx: 640 },
    stored: 100,
  });
  assert.equal(reconciled.bounds.min, -6);
  assert.equal(reconciled.bounds.max, 32);
  assert.equal(reconciled.stored, 100);
});

test('fluid measured height zero collapses max', () => {
  const reconciled = placement.reconcileImageRightVerticalPosition({
    ...baseReconcile,
    sideLayoutFlow: 'fluid',
    surface: { kind: 'measured', heightPx: 0 },
    stored: 5,
  });
  assert.equal(reconciled.bounds.min, -6);
  assert.equal(reconciled.bounds.max, -6);
  assert.equal(reconciled.stored, -6);
});

test('zero-width bounds span', () => {
  const bounds = { min: -6, max: -6 };
  const reconciled = placement.reconcileImageRightVerticalPosition({
    ...baseReconcile,
    sideLayoutFlow: 'fluid',
    surface: { kind: 'measured', heightPx: 0 },
    stored: 12,
  });
  assert.equal(reconciled.sliderPercent, 50);
  assert.equal(
    placement.storedImageRightVerticalPositionForSlider(75, bounds),
    -6,
  );
});

test('imageRightVerticalSlider range', () => {
  assert.deepEqual(placement.imageRightVerticalSlider, {
    min: 0,
    max: 100,
    step: 1,
  });
});
