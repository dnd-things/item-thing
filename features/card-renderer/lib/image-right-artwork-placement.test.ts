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
  measureFixedImageRightSurfaceHeightPx: (surface: {
    offsetHeight: number;
  }) => number;
};

const classification = 'Weapon, rare';

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
      imageRightVerticalPosition: 13,
      sideLayoutFlow: 'fixed',
      classificationAndRarity: classification,
      surfaceHeightPx: 0,
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

type EffectCell = { deps?: unknown[]; run: () => void };

function createHookHost() {
  const React = require('react') as typeof import('react');
  const cells: unknown[] = [];
  const layoutEffects: Array<() => void> = [];
  let cursor = 0;
  let stateCommitted = false;
  let surfaceHeight = 779;
  const heightByWidth: Record<number, number> = {
    500: 779,
    516: 779,
    608: 779,
    700: 1558,
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
          const next =
            typeof value === 'function'
              ? (value as (current: unknown) => unknown)(cells[index])
              : value;
          if (Object.is(next, cells[index])) {
            return;
          }
          cells[index] = next;
          stateCommitted = true;
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
    useEffect() {
      const index = cursor;
      cursor += 1;
      if (!(index in cells)) {
        cells[index] = null;
      }
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
        cells[index] = { deps, run: effect };
        layoutEffects.push(effect);
      }
    },
  };

  const surfaceNodes: Array<{
    offsetHeight: number;
    style?: Record<string, unknown>;
  }> = [];

  const attachSurface = (surface?: { offsetHeight: number }) => {
    if (!surface) {
      return;
    }
    for (const cell of cells) {
      if (
        cell &&
        typeof cell === 'object' &&
        'current' in cell &&
        (cell as { current: unknown }).current === null
      ) {
        (cell as { current: unknown }).current = surface;
      }
    }
  };

  const runPass = (fn: () => unknown, surface?: { offsetHeight: number }) => {
    cursor = 0;
    layoutEffects.length = 0;
    const result = fn();
    attachSurface(surface);
    for (const effect of layoutEffects) {
      effect();
    }
    return result;
  };

  return {
    react,
    cells,
    layoutEffects,
    surfaceHeight,
    setSurfaceHeight(value: number) {
      surfaceHeight = value;
    },
    heightForWidth(widthPx: number) {
      return heightByWidth[widthPx] ?? surfaceHeight;
    },
    registerSurface(node: { offsetHeight: number }) {
      surfaceNodes.push(node);
      Object.defineProperty(node, 'offsetHeight', {
        get: () => surfaceHeight,
        configurable: true,
      });
    },
    render(fn: () => unknown, surface?: { offsetHeight: number }) {
      let result: unknown;
      for (let pass = 0; pass < 3; pass += 1) {
        cursor = 0;
        layoutEffects.length = 0;
        result = fn();
        attachSurface(surface);
        for (const effect of layoutEffects) {
          effect();
        }
      }
      return result;
    },
    rerunLayoutEffects() {
      for (const effect of layoutEffects) {
        effect();
      }
    },
    renderOnce(fn: () => unknown, surface?: { offsetHeight: number }) {
      stateCommitted = false;
      let result = runPass(fn, surface);
      if (stateCommitted) {
        stateCommitted = false;
        result = runPass(fn, surface);
      }
      return result;
    },
  };
}

function findMarginTop(value: unknown): string | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const record = value as {
    props?: {
      style?: { marginTop?: string };
      mediaColumnStyle?: { marginTop?: string };
      children?: unknown;
    };
  };
  const style = record.props?.style;
  if (style?.marginTop) {
    return style.marginTop;
  }
  const mediaColumnStyle = record.props?.mediaColumnStyle;
  if (mediaColumnStyle?.marginTop) {
    return mediaColumnStyle.marginTop;
  }
  const children = record.props?.children;
  if (Array.isArray(children)) {
    for (const child of children) {
      const nested = findMarginTop(child);
      if (nested) {
        return nested;
      }
    }
  } else if (children) {
    return findMarginTop(children);
  }
  return null;
}

function surfaceNode(host: ReturnType<typeof createHookHost>) {
  const surface = { offsetHeight: host.surfaceHeight };
  host.registerSurface(surface);
  return surface;
}

function baseCardState(overrides: Record<string, unknown> = {}) {
  const { defaultMagicItemWorkbenchState } = loader()(
    'features/workbench/lib/workbench-options.ts',
  ) as { defaultMagicItemWorkbenchState: Record<string, unknown> };
  return {
    ...defaultMagicItemWorkbenchState,
    cardStyle: 'print',
    cardLayout: 'image-right',
    sideLayoutFlow: 'fixed',
    classificationAndRarity: classification,
    imageRightVerticalPosition: 32,
    imagePreviewUrl: 'data:image/png;base64,AAAA',
    itemName: 'Sword',
    mechanicalDescription: 'Sharp.',
    ...overrides,
  };
}

function loadPrintCard(host: ReturnType<typeof createHookHost>) {
  return loader({
    react: host.react,
    '../lib/use-flipped-image-preview-url': {
      useFlippedImagePreviewUrl: () => ({
        effectiveUrl: 'data:image/png;base64,AAAA',
        state: 'ready',
      }),
      artworkDataset: () => ({}),
    },
    '../lib/use-minimal-artwork-theme': {
      useMinimalArtworkTheme: () => ({
        artworkColor: '#336699',
        settled: true,
      }),
    },
    'next/image': {
      __esModule: true,
      default: (props: Record<string, unknown>) => {
        const React = require('react') as typeof import('react');
        return React.createElement('img', props);
      },
    },
  })('features/card-renderer/components/print-magic-item-card.tsx') as {
    PrintMagicItemCard: (props: Record<string, unknown>) => unknown;
  };
}

function marginFromPrintCard(
  host: ReturnType<typeof createHookHost>,
  props: Record<string, unknown>,
) {
  const { PrintMagicItemCard } = loadPrintCard(host);
  const tree = host.render(() => PrintMagicItemCard(props), surfaceNode(host));
  const margin = findMarginTop(tree);
  assert.ok(margin, 'expected margin-top on print card');
  return margin;
}

test('export surface and client paths share latched margins at two widths', () => {
  const host = createHookHost();
  const widthCases = [
    { cardWidthPx: 500, cardWidthAuto: false, expectedMargin: '30rem' },
    { cardWidthPx: 700, cardWidthAuto: false, expectedMargin: '60rem' },
  ] as const;

  for (const { cardWidthPx, cardWidthAuto, expectedMargin } of widthCases) {
    host.setSurfaceHeight(host.heightForWidth(cardWidthPx));
    const exportMargin = marginFromPrintCard(host, {
      ...baseCardState({
        cardWidthAuto,
        cardWidthPx,
        imageRightVerticalPosition: 32,
      }),
    });
    assert.equal(exportMargin, expectedMargin);

    const clientMargin = marginFromPrintCard(host, {
      ...baseCardState({
        cardWidthAuto,
        cardWidthPx,
        imageRightVerticalPosition: 32,
        artworkDrawPolicy: 'export',
        exportGeneration: 1,
      }),
    });
    assert.equal(clientMargin, expectedMargin);
  }

  host.setSurfaceHeight(host.heightForWidth(608));
  const autoWidthMargin = marginFromPrintCard(host, {
    ...baseCardState({
      cardWidthAuto: true,
      cardWidthPx: 500,
      imageRightVerticalPosition: 32,
    }),
  });
  assert.equal(autoWidthMargin, '30rem');
});

test('width change with unchanged measured height keeps scaled margin', () => {
  const host = createHookHost();
  host.setSurfaceHeight(779);
  const { PrintMagicItemCard } = loadPrintCard(host);
  const surface = surfaceNode(host);
  const baseProps = baseCardState({
    cardWidthAuto: false,
    cardWidthPx: 500,
    imageRightVerticalPosition: 32,
  });
  host.render(() => PrintMagicItemCard(baseProps), surface);
  const widerProps = {
    ...baseProps,
    cardWidthPx: 516,
  };
  assert.equal(
    findMarginTop(
      host.renderOnce(() => PrintMagicItemCard(widerProps), surface),
    ),
    '30rem',
  );
});

test('position-only changes reuse latched height; width change remeasures', () => {
  const host = createHookHost();
  host.setSurfaceHeight(779);
  const { PrintMagicItemCard } = loadPrintCard(host);
  const props = baseCardState({
    cardWidthAuto: false,
    cardWidthPx: 500,
    imageRightVerticalPosition: 32,
  });
  const surface = surfaceNode(host);
  assert.equal(
    findMarginTop(host.render(() => PrintMagicItemCard(props), surface)),
    '30rem',
  );

  host.setSurfaceHeight(900);
  const atPositionZero = marginFromPrintCard(host, {
    ...props,
    imageRightVerticalPosition: 0,
  });
  assert.equal(atPositionZero, `${(-13 / 19) * 30}rem`);

  host.setSurfaceHeight(1558);
  const atWider = marginFromPrintCard(host, {
    ...props,
    cardWidthPx: 700,
    imageRightVerticalPosition: 32,
  });
  assert.equal(atWider, '60rem');
});

test('card export surface path omits height prop', () => {
  const React = require('react') as typeof import('react');
  const host = createHookHost();
  const load = loader({
    react: host.react,
    '@/features/card-renderer/card-renderer': {
      CardRenderer: (props: Record<string, unknown>) => {
        assert.equal(props['cardPreviewSurfaceHeightPx'], undefined);
        const { PrintMagicItemCard } = loadPrintCard(host);
        return PrintMagicItemCard(props);
      },
    },
  });
  const { defaultMagicItemWorkbenchState } = load(
    'features/workbench/lib/workbench-options.ts',
  ) as { defaultMagicItemWorkbenchState: Record<string, unknown> };
  const { CardExportSurface } = load(
    'features/workbench/components/card-export-surface.tsx',
  ) as {
    CardExportSurface: (props: {
      prepared: unknown;
      surfaceRef: { current: null };
    }) => unknown;
  };
  const prepared = {
    captured: {
      state: {
        ...defaultMagicItemWorkbenchState,
        cardLayout: 'image-right',
        sideLayoutFlow: 'fixed',
        imageRightVerticalPosition: 32,
        classificationAndRarity: classification,
        imagePreviewUrl: 'data:image/png;base64,AAAA',
      },
      bundle: null,
    },
    preparedUrl: 'data:image/png;base64,AAAA',
    alreadyTransformed: true,
  };
  host.setSurfaceHeight(779);
  const tree = CardExportSurface({
    prepared,
    surfaceRef: { current: null },
  });
  host.render(() => tree as React.ReactElement, surfaceNode(host));
});
