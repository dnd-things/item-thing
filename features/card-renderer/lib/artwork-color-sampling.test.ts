import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { rotatedBoundingBox } from '@/features/workbench/lib/artwork-geometry.ts';
import { resolveArtworkColor } from './artwork-color-source.ts';
import { resolveMinimalArtworkTheme } from './minimal-artwork-theme-source.ts';
import {
  findAccentColorFromImageData,
  getSampleCanvasDimensions,
} from './use-minimal-artwork-theme.ts';

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..',
);
const require = createRequire(path.join(root, 'package.json'));

Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);

type Rgba = [number, number, number, number];

function hslToRgb(hue: number, saturation: number, lightness: number): Rgba {
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const intermediate = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const match = lightness - chroma / 2;
  let red = 0;
  let green = 0;
  let blue = 0;

  if (hue < 60) {
    red = chroma;
    green = intermediate;
  } else if (hue < 120) {
    red = intermediate;
    green = chroma;
  } else if (hue < 180) {
    green = chroma;
    blue = intermediate;
  } else if (hue < 240) {
    green = intermediate;
    blue = chroma;
  } else if (hue < 300) {
    red = intermediate;
    blue = chroma;
  } else {
    red = chroma;
    blue = intermediate;
  }

  return [
    Math.round((red + match) * 255),
    Math.round((green + match) * 255),
    Math.round((blue + match) * 255),
    255,
  ];
}

function buildSplitFixture(
  width: number,
  height: number,
  splitColumn: number,
  leftHue: number,
  rightHue: number,
): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);
  const left = hslToRgb(leftHue, 0.74, 0.52);
  const right = hslToRgb(rightHue, 0.74, 0.52);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [r, g, b, a] = x < splitColumn ? left : right;
      const offset = (y * width + x) * 4;
      data[offset] = r;
      data[offset + 1] = g;
      data[offset + 2] = b;
      data[offset + 3] = a;
    }
  }

  return data;
}

function sampleBilinear(
  source: Uint8ClampedArray,
  sourceWidth: number,
  sourceHeight: number,
  x: number,
  y: number,
): Rgba {
  if (x < 0 || y < 0 || x >= sourceWidth || y >= sourceHeight) {
    return [0, 0, 0, 0];
  }
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(sourceWidth - 1, x0 + 1);
  const y1 = Math.min(sourceHeight - 1, y0 + 1);
  const tx = x - x0;
  const ty = y - y0;

  const read = (px: number, py: number): Rgba => {
    const offset = (py * sourceWidth + px) * 4;
    return [
      source[offset] ?? 0,
      source[offset + 1] ?? 0,
      source[offset + 2] ?? 0,
      source[offset + 3] ?? 0,
    ];
  };

  const c00 = read(x0, y0);
  const c10 = read(x1, y0);
  const c01 = read(x0, y1);
  const c11 = read(x1, y1);

  const mix = (c0: number, c1: number, t: number) => c0 + (c1 - c0) * t;
  return [
    Math.round(mix(mix(c00[0], c10[0], tx), mix(c01[0], c11[0], tx), ty)),
    Math.round(mix(mix(c00[1], c10[1], tx), mix(c01[1], c11[1], tx), ty)),
    Math.round(mix(mix(c00[2], c10[2], tx), mix(c01[2], c11[2], tx), ty)),
    Math.round(mix(mix(c00[3], c10[3], tx), mix(c01[3], c11[3], tx), ty)),
  ];
}

function rotateBilinear(
  source: Uint8ClampedArray,
  sourceWidth: number,
  sourceHeight: number,
  rotationDegrees: number,
): { data: Uint8ClampedArray; width: number; height: number } {
  const bounds = rotatedBoundingBox(sourceWidth, sourceHeight, rotationDegrees);
  const data = new Uint8ClampedArray(bounds.width * bounds.height * 4);
  const theta = (rotationDegrees * Math.PI) / 180;
  const cosine = Math.cos(theta);
  const sine = Math.sin(theta);
  const sourceCenterX = (sourceWidth - 1) / 2;
  const sourceCenterY = (sourceHeight - 1) / 2;
  const outputCenterX = (bounds.width - 1) / 2;
  const outputCenterY = (bounds.height - 1) / 2;

  for (let y = 0; y < bounds.height; y += 1) {
    for (let x = 0; x < bounds.width; x += 1) {
      const dx = x - outputCenterX;
      const dy = y - outputCenterY;
      const sourceX = cosine * dx + sine * dy + sourceCenterX;
      const sourceY = -sine * dx + cosine * dy + sourceCenterY;
      const [r, g, b, a] = sampleBilinear(
        source,
        sourceWidth,
        sourceHeight,
        sourceX,
        sourceY,
      );
      const offset = (y * bounds.width + x) * 4;
      data[offset] = r;
      data[offset + 1] = g;
      data[offset + 2] = b;
      data[offset + 3] = a;
    }
  }

  return { data, width: bounds.width, height: bounds.height };
}

function downsampleBilinear(
  source: Uint8ClampedArray,
  sourceWidth: number,
  sourceHeight: number,
): { data: Uint8ClampedArray; width: number; height: number } {
  const { width, height } = getSampleCanvasDimensions(
    sourceWidth,
    sourceHeight,
  );
  const data = new Uint8ClampedArray(width * height * 4);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const sourceX = ((x + 0.5) * sourceWidth) / width - 0.5;
      const sourceY = ((y + 0.5) * sourceHeight) / height - 0.5;
      const [r, g, b, a] = sampleBilinear(
        source,
        sourceWidth,
        sourceHeight,
        sourceX,
        sourceY,
      );
      const offset = (y * width + x) * 4;
      data[offset] = r;
      data[offset + 1] = g;
      data[offset + 2] = b;
      data[offset + 3] = a;
    }
  }

  return { data, width, height };
}

function imageDataFrom(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): ImageData {
  return { data, width, height } as ImageData;
}

function measureArtworkColors(
  source: Uint8ClampedArray,
  sourceWidth: number,
  sourceHeight: number,
  rotationDegrees: number,
) {
  const rotated = rotateBilinear(
    source,
    sourceWidth,
    sourceHeight,
    rotationDegrees,
  );
  const sample = downsampleBilinear(
    rotated.data,
    rotated.width,
    rotated.height,
  );
  const accent = findAccentColorFromImageData(
    imageDataFrom(sample.data, sample.width, sample.height),
  );
  return {
    accent,
    swatch: resolveArtworkColor(accent, 'auto-complement', '#292d4c'),
    base: resolveMinimalArtworkTheme(accent, 'auto-complement', '#292d4c').base,
  };
}

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
            return require(id);
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

type ReactTestRendererModule = {
  act: (callback: () => void) => void;
  create: (element: import('react').ReactElement) => { unmount: () => void };
};

function createSamplerRecorder() {
  const urls: string[] = [];
  const fallbackTheme = resolveMinimalArtworkTheme(
    null,
    'auto-complement',
    '#292d4c',
  );
  const useMinimalArtworkTheme = (renderImageUrl: string) => {
    urls.push(renderImageUrl);
    return {
      accentColor: null,
      artworkColor: '#336699',
      swatches: [],
      theme: fallbackTheme,
      settled: true,
    };
  };
  return { urls, useMinimalArtworkTheme, fallbackTheme };
}

function mountPreviewColumn(options: {
  workbenchState: Record<string, unknown>;
  drawnUrl: string;
  transform: boolean;
}) {
  const React = require('react') as typeof import('react');
  const TestRenderer =
    require('react-test-renderer') as ReactTestRendererModule;
  const recorder = createSamplerRecorder();
  const flippedModule = {
    useFlippedImagePreviewUrl: (
      imagePreviewUrl: string,
      _rotationDegrees: number,
    ) => ({
      effectiveUrl: options.transform ? options.drawnUrl : imagePreviewUrl,
      ready: true,
      error: null,
      transformed: options.transform,
    }),
    artworkDataset: () => ({
      'data-artwork-state': 'ready',
      'data-artwork-error': '',
    }),
  };
  const themeModule = {
    useMinimalArtworkTheme: recorder.useMinimalArtworkTheme,
    minimalArtworkThemeFallback: recorder.fallbackTheme,
  };
  const load = loader({
    '@/features/card-renderer/lib/use-minimal-artwork-theme': themeModule,
    '../lib/use-minimal-artwork-theme': themeModule,
    '../lib/use-flipped-image-preview-url': flippedModule,
    'next/dynamic': () => () => null,
    'next/image': {
      __esModule: true,
      default: (props: Record<string, unknown>) =>
        React.createElement('img', props),
    },
    '@hugeicons/core-free-icons': new Proxy({}, { get: () => ({}) }),
    '@hugeicons/react': {
      HugeiconsIcon: () => null,
    },
    '@/components/ui/button': {
      Button: (props: Record<string, unknown>) =>
        React.createElement('button', props),
    },
    '@/components/ui/slider': {
      Slider: () => null,
    },
    '@/components/ui/toggle': {
      Toggle: () => null,
    },
    '@/components/ui/toggle-group': {
      ToggleGroup: (props: Record<string, unknown>) =>
        React.createElement('div', props),
      ToggleGroupItem: (props: Record<string, unknown>) =>
        React.createElement('button', props),
    },
    './workbench-field-controls': {
      ToggleField: () => null,
    },
    './artwork-color-source-control': {
      ArtworkColorSourceControl: () => null,
    },
  });
  const { defaultMagicItemWorkbenchState } = load(
    'features/workbench/lib/workbench-options.ts',
  ) as { defaultMagicItemWorkbenchState: Record<string, unknown> };
  const { PreviewColumn } = load(
    'features/workbench/components/preview-column.tsx',
  ) as {
    PreviewColumn: import('react').ComponentType<Record<string, unknown>>;
  };
  const cardRef = { current: { offsetHeight: 640 } };
  TestRenderer.act(() => {
    TestRenderer.create(
      React.createElement(PreviewColumn, {
        cardRef,
        showAdvancedWorkbenchControls: false,
        workbenchState: {
          ...defaultMagicItemWorkbenchState,
          ...options.workbenchState,
        },
        onWorkbenchEdit: () => {},
      }),
    );
  });
  return recorder.urls;
}

test('dominant split fixture keeps swatch and base stable across rotation', () => {
  const source = buildSplitFixture(96, 48, 78, 200, 30);
  const upright = measureArtworkColors(source, 96, 48, 0);
  assert.equal(upright.swatch, 'hsl(20 74% 52%)');
  assert.equal(upright.base, 'hsl(20 34% 24%)');

  for (const degrees of [15, 45, 90, 180]) {
    const rotated = measureArtworkColors(source, 96, 48, degrees);
    assert.equal(rotated.swatch, upright.swatch);
    assert.equal(rotated.base, upright.base);
  }
});

test('near-tie split fixture shifts swatch at 45 degrees', () => {
  const source = buildSplitFixture(96, 48, 48, 5, 10);
  const upright = measureArtworkColors(source, 96, 48, 0);
  const at90 = measureArtworkColors(source, 96, 48, 90);
  const at45 = measureArtworkColors(source, 96, 48, 45);

  assert.equal(upright.swatch, 'hsl(185 74% 52%)');
  assert.equal(at90.swatch, upright.swatch);
  assert.equal(at45.swatch, 'hsl(190 74% 52%)');
  assert.equal(
    upright.base,
    resolveMinimalArtworkTheme(upright.accent, 'auto-complement', '#292d4c')
      .base,
  );
  assert.equal(at90.base, upright.base);
  assert.equal(
    at45.base,
    resolveMinimalArtworkTheme(at45.accent, 'auto-complement', '#292d4c').base,
  );
});

test('preview column records preview and drawn artwork urls for print', () => {
  const sourceUrl = 'data:image/png;base64,SOURCE';
  const drawnUrl = 'data:image/png;base64,DRAWN';
  const urls = mountPreviewColumn({
    workbenchState: {
      cardStyle: 'print',
      imagePreviewUrl: sourceUrl,
      imageRotationDegrees: 45,
      imageBorderWidthPx: 5,
    },
    drawnUrl,
    transform: true,
  });
  assert.deepEqual(urls, [sourceUrl, drawnUrl]);
});

test('preview column records preview and drawn artwork urls for minimal', () => {
  const sourceUrl = 'data:image/png;base64,SOURCE2';
  const drawnUrl = 'data:image/png;base64,DRAWN2';
  const urls = mountPreviewColumn({
    workbenchState: {
      cardStyle: 'minimal',
      imagePreviewUrl: sourceUrl,
      imageRotationDegrees: 90,
    },
    drawnUrl,
    transform: true,
  });
  assert.deepEqual(urls, [sourceUrl, drawnUrl]);
});

test('preview column records the source url twice when transform is identity', () => {
  const sourceUrl = 'data:image/png;base64,SAME';
  const urls = mountPreviewColumn({
    workbenchState: {
      cardStyle: 'print',
      imagePreviewUrl: sourceUrl,
      imageRotationDegrees: 0,
      imageBorderWidthPx: 5,
    },
    drawnUrl: sourceUrl,
    transform: false,
  });
  assert.deepEqual(urls, [sourceUrl, sourceUrl]);
});
