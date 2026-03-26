import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

import { workbenchSnapshotValidator } from './lib/workbenchSnapshotValidators';

export default defineSchema({
  itemExports: defineTable({
    workbenchSnapshot: workbenchSnapshotValidator,
    exportFormat: v.union(v.literal('png'), v.literal('jpg')),
    exportPixelRatio: v.union(v.literal(1), v.literal(2)),
    sourceImageStorageId: v.optional(v.id('_storage')),
    exportedImageStorageId: v.optional(v.id('_storage')),
  }),
});
