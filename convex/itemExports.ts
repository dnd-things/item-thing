import { v } from 'convex/values';
import type { Id } from './_generated/dataModel';
import { mutation, query } from './_generated/server';

import { SOURCE_OPTIMIZER_VERSION } from './lib/sourceOptimizerVersion';
import { createItemExportRecord, sourceReuseStatus } from './lib/sourceReuse';
import { workbenchSnapshotValidator } from './lib/workbenchSnapshotValidators';

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

export const getSourceReuseStatus = query({
  args: {
    storageId: v.optional(v.id('_storage')),
    optimizerVersion: v.optional(v.string()),
  },
  returns: v.object({
    optimizerVersion: v.string(),
    reusable: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const storageId = args.storageId;
    const storageExists =
      storageId !== undefined &&
      (await ctx.db.system.get('_storage', storageId)) !== null;
    return sourceReuseStatus({
      activeOptimizerVersion: SOURCE_OPTIMIZER_VERSION,
      hasStorageId: storageId !== undefined,
      ...(args.optimizerVersion !== undefined
        ? { optimizerVersion: args.optimizerVersion }
        : {}),
      storageExists,
    });
  },
});

export const createItemExport = mutation({
  args: {
    workbenchSnapshot: workbenchSnapshotValidator,
    exportFormat: v.union(v.literal('png'), v.literal('jpg')),
    exportPixelRatio: v.union(v.literal(1), v.literal(2)),
    sourceImageStorageId: v.optional(v.id('_storage')),
    sourceOptimizerVersion: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await createItemExportRecord(args, {
      activeOptimizerVersion: SOURCE_OPTIMIZER_VERSION,
      storageExists: async (storageId: Id<'_storage'>) =>
        (await ctx.db.system.get('_storage', storageId)) !== null,
      insert: async (doc) => {
        await ctx.db.insert('itemExports', doc);
      },
    });
  },
});
