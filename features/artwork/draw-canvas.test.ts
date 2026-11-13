import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { rotatedBoundingBox } from './geometry.ts';
import type { DrawCanvas, DrawContext } from './raster.ts';
import { renderTransformedCanvas } from './raster.ts';

class FakeContext implements DrawContext {
  readonly calls: string[] = [];

  drawImage(): void {
    this.calls.push('draw');
  }

  translate(): void {
    this.calls.push('translate');
  }

  rotate(): void {
    this.calls.push('rotate');
  }

  scale(): void {
    this.calls.push('scale');
  }

  save(): void {
    this.calls.push('save');
  }

  restore(): void {
    this.calls.push('restore');
  }

  getImageData(): { data: Uint8ClampedArray } {
    return { data: new Uint8ClampedArray() };
  }
}

describe('canvas draw round-trip', () => {
  test('display policy caps destination and records rotate-then-flip order', () => {
    const created: Array<{ width: number; height: number }> = [];
    const contexts: FakeContext[] = [];
    const factory = {
      create(width: number, height: number): DrawCanvas {
        created.push({ width, height });
        const context = new FakeContext();
        contexts.push(context);
        return {
          width,
          height,
          getContext() {
            return context;
          },
          toBlob(callback) {
            callback(
              new Blob([Uint8Array.from([1, 2, 3])], { type: 'image/png' }),
            );
          },
        };
      },
      release(canvas: DrawCanvas) {
        canvas.width = 0;
        canvas.height = 0;
      },
    };
    const canvas = renderTransformedCanvas(
      { width: 20, height: 10 },
      {
        logicalWidth: 20,
        logicalHeight: 10,
        rotationDegrees: 90,
        flipHorizontal: true,
        flipVertical: false,
        policy: 'display',
      },
      factory,
    );
    assert.equal(created.length, 1);
    const bounds = rotatedBoundingBox(20, 10, 90);
    assert.equal(canvas.width, bounds.width);
    assert.equal(canvas.height, bounds.height);
    const context = contexts[0];
    assert.ok(context);
    assert.deepEqual(
      context.calls.filter((call) => call !== 'draw'),
      ['save', 'translate', 'scale', 'rotate', 'restore'],
    );
    factory.release(canvas);
    assert.equal(canvas.width, 0);
    assert.equal(canvas.height, 0);
  });

  test('export policy keeps native rotated bounds', () => {
    const created: Array<{ width: number; height: number }> = [];
    const factory = {
      create(width: number, height: number): DrawCanvas {
        created.push({ width, height });
        return {
          width,
          height,
          getContext() {
            return new FakeContext();
          },
          toBlob(callback) {
            callback(new Blob([Uint8Array.from([1])], { type: 'image/png' }));
          },
        };
      },
      release() {},
    };
    const canvas = renderTransformedCanvas(
      { width: 2000, height: 1000 },
      {
        logicalWidth: 2000,
        logicalHeight: 1000,
        rotationDegrees: 0,
        flipHorizontal: false,
        flipVertical: false,
        policy: 'export',
      },
      factory,
    );
    assert.equal(canvas.width, 2000);
    assert.equal(canvas.height, 1000);
    assert.equal(created.length, 1);
  });
});
