import type { IntegerCrop } from './geometry.ts';

const MIN_VISIBLE_ALPHA = 8;

export function findVisibleAlphaBounds(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): IntegerCrop | null {
  let left = width;
  let right = -1;
  let top = height;
  let bottom = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = data[(y * width + x) * 4 + 3];
      if (alpha === undefined || alpha < MIN_VISIBLE_ALPHA) {
        continue;
      }
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    }
  }

  if (right < left || bottom < top) {
    return null;
  }

  return {
    left,
    top,
    width: right - left + 1,
    height: bottom - top + 1,
  };
}

export function findVisibleAlphaBoundsInBuffer(
  raw: Buffer,
  width: number,
  height: number,
): IntegerCrop | null {
  let left = width;
  let right = -1;
  let top = height;
  let bottom = -1;
  const rgbaChannels = 4;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = raw[(y * width + x) * rgbaChannels + 3];
      if (alpha === undefined || alpha < MIN_VISIBLE_ALPHA) {
        continue;
      }
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    }
  }

  if (right < left || bottom < top) {
    return null;
  }

  return {
    left,
    top,
    width: right - left + 1,
    height: bottom - top + 1,
  };
}
