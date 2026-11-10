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

type EffectCell = {
  deps?: unknown[];
  run: () => void;
};

function createHookHost() {
  const React = require('react') as typeof import('react');
  const cells: unknown[] = [];
  const layoutEffects: Array<() => void> = [];
  let cursor = 0;
  let offsetHeightReads = 0;

  const cardNode = {
    get offsetHeight() {
      offsetHeightReads += 1;
      return 640;
    },
  };

  const react = {
    ...React,
    useState(init: unknown) {
      const index = cursor;
      cursor += 1;
      if (!(index in cells)) {
        cells[index] =
          typeof init === 'function' ? (init as () => unknown)() : init;
      }
      return [
        cells[index],
        (value: unknown) => {
          cells[index] =
            typeof value === 'function'
              ? (value as (current: unknown) => unknown)(cells[index])
              : value;
        },
      ];
    },
    useRef(init: unknown) {
      const index = cursor;
      cursor += 1;
      if (!(index in cells)) {
        cells[index] = { current: init };
      }
      return cells[index] as { current: unknown };
    },
    useLayoutEffect(effect: () => void, deps: unknown[]) {
      const index = cursor;
      cursor += 1;
      const previous = cells[index] as EffectCell | undefined;
      const changed =
        !previous ||
        deps.some(
          (value, depsIndex) => !Object.is(value, previous.deps?.[depsIndex]),
        );
      if (changed) {
        cells[index] = {
          deps,
          run: effect,
        };
        layoutEffects.push(effect);
      }
    },
  };

  return {
    react,
    cells,
    layoutEffects,
    cardNode,
    get offsetHeightReads() {
      return offsetHeightReads;
    },
    resetOffsetHeightReads() {
      offsetHeightReads = 0;
    },
    render(fn: () => unknown) {
      cursor = 0;
      layoutEffects.length = 0;
      const result = fn();
      for (const effect of layoutEffects) {
        effect();
      }
      return result;
    },
  };
}

const base = loader();
const { defaultMagicItemWorkbenchState } = base(
  'features/workbench/lib/workbench-options.ts',
) as {
  defaultMagicItemWorkbenchState: Record<string, unknown>;
};

test('image-right remeasures once per measure-key change', () => {
  const host = createHookHost();
  const load = loader({ react: host.react });
  const { useImageRightVerticalPositionBounds } = load(
    'features/workbench/lib/use-image-right-vertical-position-bounds.ts',
  ) as {
    useImageRightVerticalPositionBounds: (
      cardRef: { current: unknown },
      workbenchState: Record<string, unknown>,
      setWorkbenchField: () => void,
    ) => unknown;
  };
  const cardRef = { current: host.cardNode };
  const setWorkbenchField = () => undefined;
  const measureState = {
    ...defaultMagicItemWorkbenchState,
    cardLayout: 'image-right',
    itemName: 'Wand',
    mechanicalDescription: 'Glows.',
  };
  host.render(() =>
    useImageRightVerticalPositionBounds(
      cardRef,
      measureState,
      setWorkbenchField,
    ),
  );
  assert.equal(host.offsetHeightReads, 1);
  host.resetOffsetHeightReads();
  host.render(() =>
    useImageRightVerticalPositionBounds(
      cardRef,
      measureState,
      setWorkbenchField,
    ),
  );
  assert.equal(host.offsetHeightReads, 0);

  const updated = { ...measureState, itemName: 'Staff' };
  host.resetOffsetHeightReads();
  host.render(() =>
    useImageRightVerticalPositionBounds(cardRef, updated, setWorkbenchField),
  );
  assert.equal(host.offsetHeightReads, 1);
});

test('image-right skips remeasure when only vertical position changes', () => {
  const host = createHookHost();
  const load = loader({ react: host.react });
  const { useImageRightVerticalPositionBounds } = load(
    'features/workbench/lib/use-image-right-vertical-position-bounds.ts',
  ) as {
    useImageRightVerticalPositionBounds: (
      cardRef: { current: unknown },
      workbenchState: Record<string, unknown>,
      setWorkbenchField: () => void,
    ) => unknown;
  };
  const cardRef = { current: host.cardNode };
  const setWorkbenchField = () => undefined;
  const baseState = {
    ...defaultMagicItemWorkbenchState,
    cardLayout: 'image-right',
    imageRightVerticalPosition: 2,
  };
  host.render(() =>
    useImageRightVerticalPositionBounds(cardRef, baseState, setWorkbenchField),
  );
  host.resetOffsetHeightReads();
  host.render(() =>
    useImageRightVerticalPositionBounds(
      cardRef,
      { ...baseState, imageRightVerticalPosition: 5 },
      setWorkbenchField,
    ),
  );
  assert.equal(host.offsetHeightReads, 0);
});

test('image-right skips remeasure when image preview length is unchanged', () => {
  const host = createHookHost();
  const load = loader({ react: host.react });
  const { useImageRightVerticalPositionBounds } = load(
    'features/workbench/lib/use-image-right-vertical-position-bounds.ts',
  ) as {
    useImageRightVerticalPositionBounds: (
      cardRef: { current: unknown },
      workbenchState: Record<string, unknown>,
      setWorkbenchField: () => void,
    ) => unknown;
  };
  const cardRef = { current: host.cardNode };
  const setWorkbenchField = () => undefined;
  const preview = 'data:image/png;base64,AAA';
  const baseState = {
    ...defaultMagicItemWorkbenchState,
    cardLayout: 'image-right',
    imagePreviewUrl: preview,
  };
  host.render(() =>
    useImageRightVerticalPositionBounds(cardRef, baseState, setWorkbenchField),
  );
  host.resetOffsetHeightReads();
  host.render(() =>
    useImageRightVerticalPositionBounds(
      cardRef,
      { ...baseState, imagePreviewUrl: 'data:image/png;base64,BBB' },
      setWorkbenchField,
    ),
  );
  assert.equal(host.offsetHeightReads, 0);
});

test('non-image-right layout does not read card height', () => {
  const host = createHookHost();
  const load = loader({ react: host.react });
  const { useImageRightVerticalPositionBounds } = load(
    'features/workbench/lib/use-image-right-vertical-position-bounds.ts',
  ) as {
    useImageRightVerticalPositionBounds: (
      cardRef: { current: unknown },
      workbenchState: Record<string, unknown>,
      setWorkbenchField: () => void,
    ) => unknown;
  };
  const cardRef = { current: host.cardNode };
  host.render(() =>
    useImageRightVerticalPositionBounds(
      cardRef,
      { ...defaultMagicItemWorkbenchState, cardLayout: 'vertical' },
      () => undefined,
    ),
  );
  assert.equal(host.offsetHeightReads, 0);
});

test('layout effect still calls both vertical position state setters', () => {
  const source = fs.readFileSync(
    path.join(
      root,
      'features/workbench/lib/use-image-right-vertical-position-bounds.ts',
    ),
    'utf8',
  );
  const effectBody = source.slice(
    source.indexOf('useLayoutEffect(() => {'),
    source.indexOf(
      '}, [cardRef, setWorkbenchField, workbenchStateTriggerKey]);',
    ),
  );
  assert.match(effectBody, /setMeasuredCardSurfaceHeightPx\(/);
  assert.match(effectBody, /setVerticalPositionMax\(/);
});
