import { z } from 'zod';

const cardLayoutSchema = z.enum(['vertical', 'image-right']);
const sideLayoutFieldSchema = z.enum(['fixed', 'fluid']);
const cardStyleSchema = z.enum(['print', 'minimal', 'classic']);
const cardBorderRadiusSchema = z.enum(['none', 'small', 'large']);
const imageAspectRatioSchema = z.enum([
  'based-on-image',
  'square',
  'portrait',
  'portrait-3-4',
  'portrait-2-3',
  'portrait-9-16',
  'landscape',
  'widescreen',
]);
const artworkColorSourceSchema = z.enum([
  'auto-complement',
  'triad-left',
  'triad-right',
  'neutral',
  'custom',
]);

export const durableCardStateSchema = z
  .object({
    cardLayout: cardLayoutSchema,
    sideLayoutFlow: sideLayoutFieldSchema,
    cardStyle: cardStyleSchema,
    cardBorderRadius: cardBorderRadiusSchema,
    cardWidthAuto: z.boolean(),
    cardWidthPx: z.number(),
    imageSize: z.number(),
    imageAspectRatio: imageAspectRatioSchema,
    resolvedImageAspectRatio: z.number(),
    imageBorderRadius: z.number(),
    imageBorderWidthPx: z.number(),
    imageRightVerticalPosition: z.number().int().min(-8),
    imageFlipHorizontal: z.boolean(),
    imageFlipVertical: z.boolean(),
    imageRotationDegrees: z.number(),
    artworkColorSource: artworkColorSourceSchema,
    artworkCustomColor: z.string(),
    imageFileName: z.string(),
    itemName: z.string(),
    classificationAndRarity: z.string(),
    requiresAttunement: z.boolean(),
    flavorDescription: z.string(),
    mechanicalDescription: z.string(),
  })
  .strip();

export type DurableCardState = z.infer<typeof durableCardStateSchema>;

/** Explicit projection drops transport controls and renderer-only state. */
export function toDurableCardState<T extends DurableCardState>(
  state: T,
): DurableCardState {
  return durableCardStateSchema.parse(state);
}
