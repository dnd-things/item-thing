export const INSPECTION_MAX_EDGE_PX = 2048;
export const INSPECTION_MAX_PIXELS = 4_194_304;
export const DISPLAY_MAX_EDGE_PX = 1024;
export const DISPLAY_MAX_PIXELS = 1_048_576;
export const SOURCE_MAX_BYTES = 32 * 1024 * 1024;
export const SOURCE_MAX_EDGE_PX = 4096;
export const SOURCE_MAX_PIXELS = 16_777_216;
export const EXPORT_TRANSFORM_MAX_EDGE_PX = 6144;
export const EXPORT_TRANSFORM_MAX_PIXELS = 37_748_736;
export const CARD_OUTPUT_MAX_EDGE_PX = 16384;
export const CARD_OUTPUT_MAX_PIXELS = 33_554_432;

export const artworkLimitCopy = {
  encodedBytes:
    'This image is over 32 MiB. Resize or compress it and try again.',
  dimensions:
    'This image is over 4096px or 16 megapixels. Resize it and try again.',
  invalidDimensions: 'Image dimensions are invalid.',
  displayEncode: 'Could not prepare a display preview for this image.',
  exportTransform:
    'Rotated artwork is over 6144px. Use a smaller image and try again.',
  cardOutput:
    'This card export is too large. Lower the scale or card size and try again.',
  cardUnmeasured: 'Card preview is not ready to export.',
  encodeFailed: 'Could not encode artwork.',
  sourceMismatch:
    'Saved artwork does not match its recorded size. Replace the image and try again.',
  savedTooLarge:
    'Saved artwork exceeds 4096px or 32 MiB. Replace the image to save and export it.',
  exportBusy: 'An export is already running.',
  artworkFailed: 'Could not prepare artwork for export.',
  missingSource:
    'This image has no exportable source. Replace it and try again.',
  artworkTooLarge:
    'Image is too large. Resize it to at most 4096px on each side and try again.',
} as const;
