import type { IntegerCrop } from './geometry.ts';

export interface ArtworkPixelReader {
  contentRectangle(
    bytes: Uint8Array,
    sourceWidth: number,
    sourceHeight: number,
  ): Promise<IntegerCrop>;
}

export interface ArtworkDisplayPreviewEncoder {
  displayPreview(
    bytes: Uint8Array,
    sourceWidth: number,
    sourceHeight: number,
    contentRectangle: IntegerCrop,
  ): Promise<{
    bytes: Uint8Array | Blob;
    mimeType: string;
    width: number;
    height: number;
  }>;
}
