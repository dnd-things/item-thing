import { v } from 'convex/values';

const cardLayoutValidator = v.union(
  v.literal('vertical'),
  v.literal('image-right'),
);

const sideLayoutFlowValidator = v.union(v.literal('fixed'), v.literal('fluid'));

const cardStyleValidator = v.union(
  v.literal('print'),
  v.literal('minimal'),
  v.literal('classic'),
);

const cardBorderRadiusValidator = v.union(
  v.literal('none'),
  v.literal('small'),
  v.literal('large'),
);

const imageAspectRatioValidator = v.union(
  v.literal('based-on-image'),
  v.literal('square'),
  v.literal('portrait'),
  v.literal('portrait-3-4'),
  v.literal('portrait-2-3'),
  v.literal('portrait-9-16'),
  v.literal('landscape'),
  v.literal('widescreen'),
);

const minimalArtworkThemeSourceValidator = v.union(
  v.literal('auto-complement'),
  v.literal('triad-left'),
  v.literal('triad-right'),
  v.literal('custom'),
);

/**
 * Serializable workbench fields (matches MagicItemWorkbenchState minus imagePreviewUrl).
 */
export const workbenchSnapshotValidator = v.object({
  cardLayout: cardLayoutValidator,
  sideLayoutFlow: sideLayoutFlowValidator,
  cardStyle: cardStyleValidator,
  cardBorderRadius: cardBorderRadiusValidator,
  cardWidthAuto: v.boolean(),
  cardWidthPx: v.number(),
  imageSize: v.number(),
  imageAspectRatio: imageAspectRatioValidator,
  resolvedImageAspectRatio: v.number(),
  imageBorderRadius: v.number(),
  imageBorderWidthPx: v.number(),
  imageRightVerticalPosition: v.number(),
  imageRotationDegrees: v.number(),
  imageFlipHorizontal: v.boolean(),
  imageFlipVertical: v.boolean(),
  minimalArtworkThemeSource: minimalArtworkThemeSourceValidator,
  minimalArtworkThemeCustomColor: v.string(),
  imageFileName: v.string(),
  itemName: v.string(),
  classificationAndRarity: v.string(),
  requiresAttunement: v.boolean(),
  flavorDescription: v.string(),
  mechanicalDescription: v.string(),
});
