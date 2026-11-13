import { type Validator, v } from 'convex/values';
import {
  type DurableCardState,
  durableCardStateSchema,
} from '../../lib/durable-card-state';

const cardLayoutValidator = v.union(
  ...durableCardStateSchema.shape.cardLayout.options.map((value) =>
    v.literal(value),
  ),
);

const sideLayoutFlowValidator = v.union(
  ...durableCardStateSchema.shape.sideLayoutFlow.options.map((value) =>
    v.literal(value),
  ),
);

const cardStyleValidator = v.union(
  ...durableCardStateSchema.shape.cardStyle.options.map((value) =>
    v.literal(value),
  ),
);

const cardBorderRadiusValidator = v.union(
  ...durableCardStateSchema.shape.cardBorderRadius.options.map((value) =>
    v.literal(value),
  ),
);

const imageAspectRatioValidator = v.union(
  ...durableCardStateSchema.shape.imageAspectRatio.options.map((value) =>
    v.literal(value),
  ),
);

const artworkColorSourceValidator = v.union(
  ...durableCardStateSchema.shape.artworkColorSource.options.map((value) =>
    v.literal(value),
  ),
);

/**
 * Serializable workbench fields (matches MagicItemWorkbenchState minus imagePreviewUrl).
 */
const sharedWorkbenchSnapshotShape = {
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
  artworkColorSource: artworkColorSourceValidator,
  artworkCustomColor: v.string(),
  imageFileName: v.string(),
  itemName: v.string(),
  classificationAndRarity: v.string(),
  requiresAttunement: v.boolean(),
  flavorDescription: v.string(),
  mechanicalDescription: v.string(),
} satisfies { [K in keyof DurableCardState]: Validator<DurableCardState[K]> };

export const workbenchSnapshotValidator = v.object(
  sharedWorkbenchSnapshotShape,
);
