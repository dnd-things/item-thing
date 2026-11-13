import assert from 'node:assert/strict';
import test from 'node:test';
import sharp from 'sharp';

import { prepareArtworkFromBuffer } from './prepare-sharp.ts';

test('sharp round-trip crops a single visible pixel', async () => {
  const width = 5;
  const height = 4;
  const raw = Buffer.alloc(width * height * 4, 0);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      raw.writeUInt8(1 + x, offset);
      raw.writeUInt8(2 + y, offset + 1);
      raw.writeUInt8(3, offset + 2);
      raw.writeUInt8(7, offset + 3);
    }
  }
  const offset = (1 * width + 3) * 4;
  raw.writeUInt8(12, offset);
  raw.writeUInt8(34, offset + 1);
  raw.writeUInt8(56, offset + 2);
  raw.writeUInt8(8, offset + 3);

  const input = await sharp(raw, {
    raw: { width, height, channels: 4 },
  })
    .png({ palette: false, compressionLevel: 9, adaptiveFiltering: false })
    .toBuffer();

  const result = await prepareArtworkFromBuffer(input);
  assert.equal(result.mimeType, 'image/png');
  assert.equal(result.width, 1);
  assert.equal(result.height, 1);
  assert.notEqual(result.buffer, input);

  const decoded = await sharp(result.buffer).ensureAlpha().raw().toBuffer();
  assert.deepEqual(decoded, Buffer.from([12, 34, 56, 8]));
});
