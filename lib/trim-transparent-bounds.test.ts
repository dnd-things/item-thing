import assert from 'node:assert/strict';
import test from 'node:test';
import sharp from 'sharp';
import { trimTransparentBounds } from './trim-transparent-bounds.ts';

const MIN_VISIBLE_ALPHA = 8;
const MAX_ALPHA_TRIM_PIXELS = 16_777_216;

function sliceRgba(
  raw: Buffer,
  sourceWidth: number,
  left: number,
  top: number,
  width: number,
  height: number,
): Buffer {
  const cropped = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const sourceStart = ((top + y) * sourceWidth + left) * 4;
    raw.copy(cropped, y * width * 4, sourceStart, sourceStart + width * 4);
  }
  return cropped;
}

function countVisibleColors(raw: Buffer): number {
  const colors = new Set<number>();
  for (let offset = 0; offset < raw.length; offset += 4) {
    if (raw.readUInt8(offset + 3) < MIN_VISIBLE_ALPHA) {
      continue;
    }
    const color =
      (raw.readUInt8(offset) << 16) |
      (raw.readUInt8(offset + 1) << 8) |
      raw.readUInt8(offset + 2);
    colors.add(color);
  }
  return colors.size;
}

async function pngFromRgba(
  raw: Buffer,
  width: number,
  height: number,
): Promise<Buffer> {
  return sharp(raw, {
    raw: { width, height, channels: 4 },
  })
    .png({
      palette: false,
      compressionLevel: 9,
      adaptiveFiltering: false,
    })
    .toBuffer();
}

async function jpegFromRgb(
  raw: Buffer,
  width: number,
  height: number,
): Promise<Buffer> {
  return sharp(raw, {
    raw: { width, height, channels: 3 },
  })
    .jpeg({ quality: 80 })
    .toBuffer();
}

async function decodeRgba(png: Buffer): Promise<{
  data: Buffer;
  width: number;
  height: number;
  isPalette: boolean;
}> {
  const metadata = await sharp(png).metadata();
  const data = await sharp(png).ensureAlpha().raw().toBuffer();
  return {
    data,
    width: metadata.width ?? 0,
    height: metadata.height ?? 0,
    isPalette: metadata.isPalette,
  };
}

function assertRgbaEqual(actual: Buffer, expected: Buffer): void {
  if (actual.equals(expected)) {
    return;
  }

  const length = Math.min(actual.length, expected.length);
  let index = 0;
  while (
    index < length &&
    actual.readUInt8(index) === expected.readUInt8(index)
  ) {
    index += 1;
  }

  assert.fail(
    `RGBA mismatch at byte ${index} (actual ${actual.length} bytes, expected ${expected.length} bytes)`,
  );
}

function assertTruecolorRgbaPng(png: Buffer): void {
  assert.equal(png.subarray(12, 16).toString('ascii'), 'IHDR');
  assert.equal(png.readUInt8(24), 8);
  assert.equal(png.readUInt8(25), 6);
}

function writeRgba(
  raw: Buffer,
  width: number,
  x: number,
  y: number,
  red: number,
  green: number,
  blue: number,
  alpha: number,
): void {
  const offset = (y * width + x) * 4;
  raw.writeUInt8(red, offset);
  raw.writeUInt8(green, offset + 1);
  raw.writeUInt8(blue, offset + 2);
  raw.writeUInt8(alpha, offset + 3);
}

test('crop keeps exact RGBA for inset artwork with more than 256 colors', async () => {
  const width = 24;
  const height = 24;
  const border = 2;
  const raw = Buffer.alloc(width * height * 4);
  let visible = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const inside =
        x >= border && x < width - border && y >= border && y < height - border;
      if (!inside) {
        writeRgba(raw, width, x, y, 0, 0, 0, 0);
        continue;
      }

      const red = visible & 255;
      const green = (visible >> 8) & 255;
      const blue = (visible * 13 + 7) & 255;
      const alpha = visible % 2 === 0 ? 255 : 8 + (visible % 190);
      writeRgba(raw, width, x, y, red, green, blue, alpha);
      visible += 1;
    }
  }

  const croppedWidth = width - border * 2;
  const croppedHeight = height - border * 2;
  assert.ok(countVisibleColors(raw) > 256);
  assert.ok(visible > 256);

  const input = await pngFromRgba(raw, width, height);
  const decodedInput = await decodeRgba(input);
  assert.equal(decodedInput.isPalette, false);
  assertRgbaEqual(decodedInput.data, raw);

  const result = await trimTransparentBounds(input);
  assert.notEqual(result.buffer, input);
  assert.equal(result.mimeType, 'image/png');
  assert.equal(result.width, croppedWidth);
  assert.equal(result.height, croppedHeight);

  const decoded = await decodeRgba(result.buffer);
  assert.equal(decoded.width, croppedWidth);
  assert.equal(decoded.height, croppedHeight);
  assertRgbaEqual(
    decoded.data,
    sliceRgba(raw, width, border, border, croppedWidth, croppedHeight),
  );
  assert.equal(decoded.isPalette, false);
  assertTruecolorRgbaPng(result.buffer);
});

test('alpha 8 defines inclusive bounds and interior samples stay exact', async () => {
  const width = 7;
  const height = 7;
  const alphas = [
    7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 8, 40, 7, 7, 7, 7, 8, 0, 7, 180, 7, 7, 7, 0,
    8, 100, 8, 7, 7, 7, 7, 7, 8, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7,
  ];
  assert.equal(alphas.length, width * height);

  const raw = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = alphas[y * width + x];
      assert.notEqual(alpha, undefined);
      writeRgba(
        raw,
        width,
        x,
        y,
        (x * 17 + 3) & 255,
        (y * 29 + 5) & 255,
        (x * 13 + y * 11 + 9) & 255,
        alpha ?? 0,
      );
    }
  }

  const input = await pngFromRgba(raw, width, height);
  const result = await trimTransparentBounds(input);

  assert.equal(result.mimeType, 'image/png');
  assert.equal(result.width, 4);
  assert.equal(result.height, 4);
  assert.notEqual(result.buffer, input);

  const decoded = await decodeRgba(result.buffer);
  assertRgbaEqual(decoded.data, sliceRgba(raw, width, 2, 1, 4, 4));
  assert.equal(decoded.isPalette, false);
  assertTruecolorRgbaPng(result.buffer);
});

test('a single visible pixel crops to that exact sample', async () => {
  const width = 5;
  const height = 4;
  const raw = Buffer.alloc(width * height * 4, 0);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      writeRgba(raw, width, x, y, 1 + x, 2 + y, 3, 7);
    }
  }
  writeRgba(raw, width, 3, 1, 12, 34, 56, 8);

  const input = await pngFromRgba(raw, width, height);
  const result = await trimTransparentBounds(input);
  const decoded = await decodeRgba(result.buffer);

  assert.equal(result.mimeType, 'image/png');
  assert.equal(result.width, 1);
  assert.equal(result.height, 1);
  assertRgbaEqual(decoded.data, Buffer.from([12, 34, 56, 8]));
  assert.equal(decoded.isPalette, false);
});

test('returns the original jpeg buffer when the input has no alpha', async () => {
  const width = 9;
  const height = 5;
  const raw = Buffer.alloc(width * height * 3);
  for (let offset = 0; offset < raw.length; offset += 1) {
    raw.writeUInt8((offset * 17 + 3) & 255, offset);
  }

  const input = await jpegFromRgb(raw, width, height);
  const metadata = await sharp(input).metadata();
  assert.equal(metadata.format, 'jpeg');
  assert.equal(metadata.hasAlpha, false);

  const result = await trimTransparentBounds(input);
  assert.equal(result.buffer, input);
  assert.equal(result.mimeType, 'image/jpeg');
  assert.equal(result.width, width);
  assert.equal(result.height, height);
});

test('returns the original buffer when visible alpha already spans the image', async () => {
  const width = 6;
  const height = 5;
  const raw = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      writeRgba(raw, width, x, y, 20 + x, 30 + y, 40, 0);
    }
  }
  writeRgba(raw, width, 0, 0, 9, 8, 7, 8);
  writeRgba(raw, width, width - 1, 0, 6, 5, 4, 255);
  writeRgba(raw, width, 0, height - 1, 3, 2, 1, 8);
  writeRgba(raw, width, width - 1, height - 1, 11, 12, 13, 255);

  const input = await pngFromRgba(raw, width, height);
  const metadata = await sharp(input).metadata();
  assert.equal(metadata.hasAlpha, true);

  const result = await trimTransparentBounds(input);
  assert.equal(result.buffer, input);
  assert.equal(result.mimeType, 'image/png');
  assert.equal(result.width, width);
  assert.equal(result.height, height);
});

test('returns the original buffer when every alpha sample is transparent', async () => {
  const width = 4;
  const height = 3;
  const raw = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      writeRgba(raw, width, x, y, 200, 10, 20, 0);
    }
  }

  const input = await pngFromRgba(raw, width, height);
  const result = await trimTransparentBounds(input);
  assert.equal(result.buffer, input);
  assert.equal(result.mimeType, 'image/png');
  assert.equal(result.width, width);
  assert.equal(result.height, height);
});

test('returns the original buffer when every alpha sample is below 8', async () => {
  const width = 4;
  const height = 3;
  const alphas = [0, 1, 7, 7, 3, 7, 0, 7, 6, 2, 7, 1];
  const raw = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = alphas[y * width + x];
      assert.ok(alpha !== undefined && alpha < MIN_VISIBLE_ALPHA);
      writeRgba(raw, width, x, y, 4 + x, 5 + y, 6, alpha ?? 0);
    }
  }

  const input = await pngFromRgba(raw, width, height);
  const result = await trimTransparentBounds(input);
  assert.equal(result.buffer, input);
  assert.equal(result.mimeType, 'image/png');
  assert.equal(result.width, width);
  assert.equal(result.height, height);
});

test('rejects alpha images above the pixel guard and bypasses oversized images without alpha', {
  timeout: 120_000,
}, async () => {
  const width = 4096;
  const height = Math.floor(MAX_ALPHA_TRIM_PIXELS / width) + 1;
  assert.ok(width * height > MAX_ALPHA_TRIM_PIXELS);

  const alphaPng = await sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 10, g: 20, b: 30, alpha: 0 },
    },
  })
    .png({
      palette: false,
      compressionLevel: 9,
      adaptiveFiltering: false,
    })
    .toBuffer();
  const alphaMetadata = await sharp(alphaPng).metadata();
  assert.equal(alphaMetadata.hasAlpha, true);
  assert.equal(alphaMetadata.width, width);
  assert.equal(alphaMetadata.height, height);

  await assert.rejects(() => trimTransparentBounds(alphaPng), {
    name: 'Error',
    message: 'Image is too large to inspect transparency safely.',
  });

  const opaquePng = await sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 10, g: 20, b: 30 },
    },
  })
    .png({
      palette: false,
      compressionLevel: 9,
      adaptiveFiltering: false,
    })
    .toBuffer();
  const opaqueMetadata = await sharp(opaquePng).metadata();
  assert.equal(opaqueMetadata.hasAlpha, false);
  assert.equal(opaqueMetadata.width, width);
  assert.equal(opaqueMetadata.height, height);

  const result = await trimTransparentBounds(opaquePng);
  assert.equal(result.buffer, opaquePng);
  assert.equal(result.mimeType, 'image/png');
  assert.equal(result.width, width);
  assert.equal(result.height, height);
});
