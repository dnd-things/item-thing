import { v } from 'convex/values';
import { mutation } from './_generated/server';

import { workbenchSnapshotValidator } from './lib/workbenchSnapshotValidators';

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

export const createItemExport = mutation({
  args: {
    workbenchSnapshot: workbenchSnapshotValidator,
    exportFormat: v.union(v.literal('png'), v.literal('jpg')),
    exportPixelRatio: v.union(v.literal(1), v.literal(2)),
    sourceImageStorageId: v.optional(v.id('_storage')),
    exportedImageStorageId: v.optional(v.id('_storage')),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert('itemExports', {
      workbenchSnapshot: args.workbenchSnapshot,
      exportFormat: args.exportFormat,
      exportPixelRatio: args.exportPixelRatio,
      ...(args.sourceImageStorageId !== undefined
        ? { sourceImageStorageId: args.sourceImageStorageId }
        : {}),
      ...(args.exportedImageStorageId !== undefined
        ? { exportedImageStorageId: args.exportedImageStorageId }
        : {}),
    });
  },
});
