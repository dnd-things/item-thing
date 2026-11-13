import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { artworkLimitCopy, identityCrop } from './geometry.ts';
import type {
  ArtworkDisplayPreviewEncoder,
  ArtworkPixelReader,
} from './pixel-reader.ts';
import { prepareArtwork } from './prepare.ts';

describe('prepare artwork', () => {
  test('fake pixel reader returns content rectangle and preview without exposing limits', async () => {
    const originalBytes = new Uint8Array([1, 2, 3, 4]);
    const contentRectangle = { left: 2, top: 1, width: 3, height: 2 };
    const pixelReader: ArtworkPixelReader = {
      async contentRectangle() {
        return contentRectangle;
      },
    };
    const previewEncoder: ArtworkDisplayPreviewEncoder = {
      async displayPreview() {
        return {
          bytes: new Uint8Array([9, 8, 7]),
          mimeType: 'image/png',
          width: 3,
          height: 2,
        };
      },
    };
    const prepared = await prepareArtwork(originalBytes, {
      decodeDimensions: async () => ({ width: 8, height: 4 }),
      pixelReader,
      previewEncoder,
    });
    assert.equal(prepared.originalBytes, originalBytes);
    assert.deepEqual(prepared.contentRectangle, contentRectangle);
    assert.equal(prepared.aspectRatio, 1.5);
    assert.equal(prepared.displayWidth, 3);
    assert.equal(prepared.displayHeight, 2);
    assert.equal(prepared.displayPreviewMimeType, 'image/png');
  });

  test('rejects oversized bytes before decode', async () => {
    const { SOURCE_MAX_BYTES } = await import('./limits.ts');
    let decoded = 0;
    await assert.rejects(
      prepareArtwork(new Uint8Array(SOURCE_MAX_BYTES + 1), {
        decodeDimensions: async () => {
          decoded += 1;
          return { width: 1, height: 1 };
        },
        pixelReader: {
          async contentRectangle() {
            return identityCrop(1, 1);
          },
        },
        previewEncoder: {
          async displayPreview() {
            return {
              bytes: new Uint8Array([1]),
              mimeType: 'image/png',
              width: 1,
              height: 1,
            };
          },
        },
      }),
      { message: artworkLimitCopy.encodedBytes },
    );
    assert.equal(decoded, 0);
  });

  test('rejects oversized dimensions before pixel reader runs', async () => {
    const { SOURCE_MAX_EDGE_PX } = await import('./limits.ts');
    let scanned = 0;
    await assert.rejects(
      prepareArtwork(new Uint8Array([1]), {
        decodeDimensions: async () => ({
          width: SOURCE_MAX_EDGE_PX + 1,
          height: 2,
        }),
        pixelReader: {
          async contentRectangle() {
            scanned += 1;
            return identityCrop(1, 1);
          },
        },
        previewEncoder: {
          async displayPreview() {
            return {
              bytes: new Uint8Array([1]),
              mimeType: 'image/png',
              width: 1,
              height: 1,
            };
          },
        },
      }),
      { message: artworkLimitCopy.dimensions },
    );
    assert.equal(scanned, 0);
  });
});
