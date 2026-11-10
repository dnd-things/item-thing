'use client';

import {
  artworkLimitCopy,
  assertCardOutputBudget,
  needsRasterTransform,
} from './artwork-geometry';
import {
  browserCanvasFactory,
  canvasToPngBlob,
  renderTransformedCanvas,
} from './artwork-raster';
import {
  type ArtworkBundle,
  type CanonicalArtwork,
  materializeCanonicalArtwork,
} from './artwork-source';
import {
  loadImageElementFromObjectUrl,
  measureImageBlob,
  rasterizeNativeCrop,
} from './read-image-preview-data';
import type { MagicItemWorkbenchState } from './workbench-options';
import { readBlobAsDataUrl } from './workbench-persistence';
import type { WorkbenchSnapshotForExport } from './workbench-snapshot-for-export';

export interface CapturedCardExport {
  state: MagicItemWorkbenchState;
  snapshot: WorkbenchSnapshotForExport;
  format: 'png' | 'jpg';
  pixelRatio: 1 | 2;
  cardPreviewSurfaceHeightPx: number;
  bundle: ArtworkBundle | null;
  reuseEpoch: number;
}

export interface PreparedCardExport {
  captured: CapturedCardExport;
  preparedUrl: string;
  sourceDataUrl: string;
  alreadyTransformed: boolean;
  release: () => void;
}

export interface PreparedExportDeps {
  materialize: (bundle: ArtworkBundle) => Promise<CanonicalArtwork>;
  renderTransformedUrl: (input: {
    blob: Blob;
    logicalWidth: number;
    logicalHeight: number;
    rotationDegrees: number;
    flipHorizontal: boolean;
    flipVertical: boolean;
  }) => Promise<{ url: string; release: () => void }>;
}

export function materializeBrowserCanonical(
  bundle: ArtworkBundle,
): Promise<CanonicalArtwork> {
  return materializeCanonicalArtwork(bundle, {
    readDataUrl: readBlobAsDataUrl,
    decodeDimensions: measureImageBlob,
    rasterizeCrop: rasterizeNativeCrop,
  });
}

export async function renderExportArtworkUrl(input: {
  blob: Blob;
  logicalWidth: number;
  logicalHeight: number;
  rotationDegrees: number;
  flipHorizontal: boolean;
  flipVertical: boolean;
}): Promise<{ url: string; release: () => void }> {
  const image = await loadImageElementFromObjectUrl(input.blob);
  const factory = browserCanvasFactory();
  let canvas: ReturnType<typeof factory.create> | null = null;
  try {
    canvas = renderTransformedCanvas(
      image,
      {
        logicalWidth: input.logicalWidth,
        logicalHeight: input.logicalHeight,
        rotationDegrees: input.rotationDegrees,
        flipHorizontal: input.flipHorizontal,
        flipVertical: input.flipVertical,
        policy: 'export',
      },
      factory,
    );
    const png = await canvasToPngBlob(canvas);
    const url = URL.createObjectURL(png);
    let released = false;
    return {
      url,
      release() {
        if (released) {
          return;
        }
        released = true;
        URL.revokeObjectURL(url);
      },
    };
  } finally {
    if (canvas) {
      factory.release(canvas);
    }
    image.src = '';
  }
}

export async function prepareCapturedExport(
  captured: CapturedCardExport,
  deps: PreparedExportDeps,
): Promise<PreparedCardExport> {
  const bundle = captured.bundle;
  if (!bundle) {
    if (captured.state.imagePreviewUrl.trim() !== '') {
      throw new Error(artworkLimitCopy.missingSource);
    }
    return {
      captured,
      preparedUrl: '',
      sourceDataUrl: '',
      alreadyTransformed: true,
      release() {
        return undefined;
      },
    };
  }
  const canonical = await deps.materialize(bundle);
  const transformed = needsRasterTransform(
    captured.state.imageRotationDegrees,
    captured.state.imageFlipHorizontal,
    captured.state.imageFlipVertical,
  );
  if (!transformed) {
    return {
      captured,
      preparedUrl: canonical.dataUrl,
      sourceDataUrl: canonical.dataUrl,
      alreadyTransformed: true,
      release() {
        return undefined;
      },
    };
  }
  const rendered = await deps.renderTransformedUrl({
    blob: canonical.blob,
    logicalWidth: bundle.crop.width,
    logicalHeight: bundle.crop.height,
    rotationDegrees: captured.state.imageRotationDegrees,
    flipHorizontal: captured.state.imageFlipHorizontal,
    flipVertical: captured.state.imageFlipVertical,
  });
  let released = false;
  return {
    captured,
    preparedUrl: rendered.url,
    sourceDataUrl: canonical.dataUrl,
    alreadyTransformed: true,
    release() {
      if (released) {
        return;
      }
      released = true;
      rendered.release();
    },
  };
}

export function completeCapturedExport(
  prepared: PreparedCardExport,
  exportDataUrl: string,
): {
  exportDataUrl: string;
  exportFormat: 'png' | 'jpg';
  exportPixelRatio: 1 | 2;
  workbenchSnapshot: WorkbenchSnapshotForExport;
  sourceImagePreviewDataUrl: string;
  reuseEpoch: number;
} {
  return {
    exportDataUrl,
    exportFormat: prepared.captured.format,
    exportPixelRatio: prepared.captured.pixelRatio,
    workbenchSnapshot: prepared.captured.snapshot,
    sourceImagePreviewDataUrl: prepared.sourceDataUrl,
    reuseEpoch: prepared.captured.reuseEpoch,
  };
}

export function assertMeasuredCardOutput(
  width: number,
  height: number,
  pixelRatio: 1 | 2,
): void {
  assertCardOutputBudget(width, height, pixelRatio);
}

export interface ArtworkWaitTarget {
  getAttribute(name: string): string | null;
  querySelector?(selector: string): ArtworkWaitTarget | null;
  querySelectorAll?(selector: string): ArrayLike<ArtworkWaitImage>;
}

interface ArtworkWaitImage {
  complete: boolean;
  naturalWidth: number;
}

function artworkReadinessTarget(
  node: ArtworkWaitTarget,
): ArtworkWaitTarget | null {
  if (node.getAttribute('data-artwork-state') !== null) {
    return node;
  }
  return node.querySelector?.('[data-artwork-state]') ?? null;
}

function renderedImagesReady(node: ArtworkWaitTarget): boolean {
  const images = node.querySelectorAll?.('img');
  if (!images) {
    return true;
  }
  for (const image of Array.from(images)) {
    if (!image.complete || image.naturalWidth <= 0) {
      return false;
    }
  }
  return true;
}

function renderedImagesFailed(node: ArtworkWaitTarget): boolean {
  const images = node.querySelectorAll?.('img');
  if (!images) {
    return false;
  }
  for (const image of Array.from(images)) {
    if (image.complete && image.naturalWidth <= 0) {
      return true;
    }
  }
  return false;
}

export async function waitForArtworkState(
  node: ArtworkWaitTarget,
  options?: { generation?: number },
): Promise<void> {
  const deadline = Date.now() + 5000;
  const generation = options?.generation;
  while (Date.now() < deadline) {
    const target = artworkReadinessTarget(node);
    const state = target?.getAttribute('data-artwork-state');
    const committed =
      generation === undefined ||
      target?.getAttribute('data-export-generation') === String(generation);
    if (committed && state === 'error') {
      const message = target?.getAttribute('data-artwork-error');
      throw new Error(
        message && message.trim() !== ''
          ? message
          : artworkLimitCopy.artworkFailed,
      );
    }
    if (committed && state === 'ready' && renderedImagesFailed(node)) {
      throw new Error(artworkLimitCopy.artworkFailed);
    }
    if (committed && state === 'ready' && renderedImagesReady(node)) {
      return;
    }
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve());
    });
  }
  throw new Error(artworkLimitCopy.artworkFailed);
}

export function createCardExportLock(): {
  run: <T>(task: () => Promise<T>) => Promise<T>;
} {
  let busy = false;
  return {
    async run(task) {
      if (busy) {
        throw new Error(artworkLimitCopy.exportBusy);
      }
      busy = true;
      try {
        return await task();
      } finally {
        busy = false;
      }
    },
  };
}
