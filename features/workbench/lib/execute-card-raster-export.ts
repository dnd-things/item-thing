'use client';

import {
  type ArtworkWaitTarget,
  assertMeasuredCardOutput,
  waitForArtworkState,
} from './export-card-artwork';

export async function executeCardRasterExport(input: {
  node: ArtworkWaitTarget & { offsetWidth: number; offsetHeight: number };
  format: 'png' | 'jpg';
  pixelRatio: 1 | 2;
  generation: number;
  rasterizer: {
    toPng: (
      node: ArtworkWaitTarget,
      options: { pixelRatio: 1 | 2; skipAutoScale: true },
    ) => Promise<string>;
    toJpeg: (
      node: ArtworkWaitTarget,
      options: {
        pixelRatio: 1 | 2;
        quality: number;
        skipAutoScale: true;
      },
    ) => Promise<string>;
  };
  settleSize?: (
    node: ArtworkWaitTarget & { offsetWidth: number; offsetHeight: number },
  ) => Promise<void>;
}): Promise<string> {
  await waitForArtworkState(input.node, { generation: input.generation });
  await input.settleSize?.(input.node);
  assertMeasuredCardOutput(
    input.node.offsetWidth,
    input.node.offsetHeight,
    input.pixelRatio,
  );
  if (input.format === 'png') {
    return await input.rasterizer.toPng(input.node, {
      pixelRatio: input.pixelRatio,
      skipAutoScale: true,
    });
  }
  return await input.rasterizer.toJpeg(input.node, {
    pixelRatio: input.pixelRatio,
    quality: 0.92,
    skipAutoScale: true,
  });
}
