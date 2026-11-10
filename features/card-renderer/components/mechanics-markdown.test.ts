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

Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);

type ReactTestRenderer = {
  update: (element: import('react').ReactElement) => void;
  unmount: () => void;
};

type ReactTestRendererModule = {
  act: (callback: () => void) => void;
  create: (element: import('react').ReactElement) => ReactTestRenderer;
};

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

function loadMechanicsMarkdown(MarkdownStub: unknown) {
  return loader({
    'react-markdown': {
      __esModule: true,
      default: MarkdownStub,
    },
  })('features/card-renderer/components/mechanics-markdown.tsx') as {
    MechanicsMarkdown: import('react').ComponentType<{
      children: string;
      components?: Record<string, unknown>;
    }>;
  };
}

test('MechanicsMarkdown memo skips react-markdown when components are new but stable', () => {
  const React = require('react') as typeof import('react');
  const TestRenderer =
    require('react-test-renderer') as ReactTestRendererModule;
  const markdownParseCount = { value: 0 };
  const MarkdownStub = (props: { children?: string }) => {
    markdownParseCount.value += 1;
    return React.createElement('div', null, props.children);
  };
  const stableTable = () => React.createElement('table');
  const { MechanicsMarkdown } = loadMechanicsMarkdown(MarkdownStub);

  const Parent = (_props: { revision: number }) =>
    React.createElement(MechanicsMarkdown, {
      children: 'Stable text.',
      components: {
        table: stableTable,
      },
    });

  let renderer!: ReactTestRenderer;
  TestRenderer.act(() => {
    renderer = TestRenderer.create(
      React.createElement(Parent, { revision: 1 }),
    );
  });
  assert.equal(markdownParseCount.value, 1);
  TestRenderer.act(() => {
    renderer.update(React.createElement(Parent, { revision: 2 }));
  });
  assert.equal(markdownParseCount.value, 1);
  TestRenderer.act(() => {
    renderer.unmount();
  });
});

test('MechanicsMarkdown re-parses when children change', () => {
  const React = require('react') as typeof import('react');
  const TestRenderer =
    require('react-test-renderer') as ReactTestRendererModule;
  const markdownParseCount = { value: 0 };
  const MarkdownStub = (props: { children?: string }) => {
    markdownParseCount.value += 1;
    return React.createElement('div', null, props.children);
  };
  const { MechanicsMarkdown } = loadMechanicsMarkdown(MarkdownStub);

  const Parent = ({ revision }: { revision: number }) =>
    React.createElement(MechanicsMarkdown, {
      children: revision === 1 ? 'First.' : 'Second.',
    });

  let renderer!: ReactTestRenderer;
  TestRenderer.act(() => {
    renderer = TestRenderer.create(
      React.createElement(Parent, { revision: 1 }),
    );
  });
  assert.equal(markdownParseCount.value, 1);
  TestRenderer.act(() => {
    renderer.update(React.createElement(Parent, { revision: 2 }));
  });
  assert.equal(markdownParseCount.value, 2);
  TestRenderer.act(() => {
    renderer.unmount();
  });
});

test('MechanicsMarkdown re-parses when a component function changes', () => {
  const React = require('react') as typeof import('react');
  const TestRenderer =
    require('react-test-renderer') as ReactTestRendererModule;
  const markdownParseCount = { value: 0 };
  const MarkdownStub = (props: { children?: string }) => {
    markdownParseCount.value += 1;
    return React.createElement('div', null, props.children);
  };
  const tableA = () => React.createElement('table');
  const tableB = () => React.createElement('table');
  const { MechanicsMarkdown } = loadMechanicsMarkdown(MarkdownStub);

  const Parent = ({ revision }: { revision: number }) =>
    React.createElement(MechanicsMarkdown, {
      children: 'Same.',
      components: {
        table: revision === 1 ? tableA : revision === 2 ? tableB : tableA,
      },
    });

  let renderer!: ReactTestRenderer;
  TestRenderer.act(() => {
    renderer = TestRenderer.create(
      React.createElement(Parent, { revision: 1 }),
    );
  });
  assert.equal(markdownParseCount.value, 1);
  TestRenderer.act(() => {
    renderer.update(React.createElement(Parent, { revision: 2 }));
  });
  assert.equal(markdownParseCount.value, 2);
  TestRenderer.act(() => {
    renderer.update(React.createElement(Parent, { revision: 3 }));
  });
  assert.equal(markdownParseCount.value, 3);
  TestRenderer.act(() => {
    renderer.unmount();
  });
});

test('MechanicsMarkdown renders dice markup and honors print heading overrides', () => {
  const React = require('react') as typeof import('react');
  const server =
    require('react-dom/server') as typeof import('react-dom/server');
  const load = loader({
    'next/image': {
      __esModule: true,
      default: (props: Record<string, unknown>) =>
        React.createElement('img', props),
    },
  });
  const { buildMagicItemPrintCardSlots } = load(
    'features/card-renderer/components/magic-item-print-card-slots.tsx',
  ) as {
    buildMagicItemPrintCardSlots: (params: Record<string, unknown>) => {
      bodySlot: import('react').ReactElement;
    };
  };
  const slots = buildMagicItemPrintCardSlots({
    isSideLayout: false,
    shouldUseWrappedSideLayout: false,
    shouldStackMetadata: false,
    cardImageDimensions: { width: 120, height: 120, borderRadius: 0 },
    imageBorderWidthPx: 0,
    imageBorderColor: '#000',
    sideImageMarginTopRem: 0,
    renderImageUrl: '',
    imageFileName: '',
    itemName: 'Test item',
    classificationAndRarity: 'Wondrous item, uncommon',
    requiresAttunement: false,
    flavorDescription: '',
    mechanicalDescription: 'Roll dice`2d6` damage.\n\n## Heading',
  });
  const markup = server.renderToStaticMarkup(slots.bodySlot);
  assert.match(markup, /data-mechanics-token="dice"/);
  assert.match(markup, />2d6</);
  assert.match(
    markup,
    /class="mt-3 mb-1 text-base font-semibold leading-6 text-slate-700 first:mt-0">Heading<\/div>/,
  );
});
