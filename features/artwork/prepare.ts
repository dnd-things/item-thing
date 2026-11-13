import {
  assertDecodedArtworkDimensions,
  assertEncodedArtworkBytes,
  type IntegerCrop,
  identityCrop,
} from './geometry.ts';
import type {
  ArtworkDisplayPreviewEncoder,
  ArtworkPixelReader,
} from './pixel-reader.ts';

export type PreparedArtwork = {
  originalBytes: Uint8Array;
  contentRectangle: IntegerCrop;
  aspectRatio: number;
  sourceWidth: number;
  sourceHeight: number;
  displayPreview: Uint8Array | Blob;
  displayPreviewMimeType: string;
  displayWidth: number;
  displayHeight: number;
};

export interface PrepareArtworkDeps {
  decodeDimensions(
    bytes: Uint8Array,
  ): Promise<{ width: number; height: number }>;
  pixelReader: ArtworkPixelReader;
  previewEncoder: ArtworkDisplayPreviewEncoder;
  isCancelled?: (() => boolean) | undefined;
}

function throwIfCancelled(isCancelled?: () => boolean): void {
  if (isCancelled?.()) {
    throw new DOMException('The operation was aborted.', 'AbortError');
  }
}

export async function prepareArtwork(
  originalBytes: Uint8Array,
  deps: PrepareArtworkDeps,
): Promise<PreparedArtwork> {
  assertEncodedArtworkBytes(originalBytes.byteLength);
  throwIfCancelled(deps.isCancelled);
  const { width: sourceWidth, height: sourceHeight } =
    await deps.decodeDimensions(originalBytes);
  throwIfCancelled(deps.isCancelled);
  assertDecodedArtworkDimensions(sourceWidth, sourceHeight);
  const contentRectangle = await deps.pixelReader.contentRectangle(
    originalBytes,
    sourceWidth,
    sourceHeight,
  );
  throwIfCancelled(deps.isCancelled);
  const crop =
    contentRectangle.width > 0 && contentRectangle.height > 0
      ? contentRectangle
      : identityCrop(sourceWidth, sourceHeight);
  const preview = await deps.previewEncoder.displayPreview(
    originalBytes,
    sourceWidth,
    sourceHeight,
    crop,
  );
  throwIfCancelled(deps.isCancelled);
  return {
    originalBytes,
    contentRectangle: crop,
    aspectRatio: crop.width / crop.height,
    sourceWidth,
    sourceHeight,
    displayPreview: preview.bytes,
    displayPreviewMimeType: preview.mimeType,
    displayWidth: preview.width,
    displayHeight: preview.height,
  };
}
