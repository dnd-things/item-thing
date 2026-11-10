import { v } from 'convex/values';

import type { Id } from './_generated/dataModel';
import {
  internalMutation,
  internalQuery,
  type MutationCtx,
} from './_generated/server';
import { SOURCE_OPTIMIZER_VERSION } from './lib/sourceOptimizerVersion';
import {
  type FinalizeCandidateStorageDb,
  finalizeCandidateStorageRecords,
  liveCachedStorageId,
} from './lib/sourceReuse';

function asStorageId(storageId: string): Id<'_storage'> {
  return storageId as Id<'_storage'>;
}

function finalizeDb(ctx: MutationCtx): FinalizeCandidateStorageDb {
  return {
    storageExists: async (storageId) =>
      (await ctx.db.system.get('_storage', asStorageId(storageId))) !== null,
    findContentHash: async (contentHash) => {
      const row = await ctx.db
        .query('storageByContentHash')
        .withIndex('by_contentHash', (q) => q.eq('contentHash', contentHash))
        .first();
      if (row === null) {
        return null;
      }
      return { id: row._id, storageId: row.storageId };
    },
    deleteContentHash: async (id) => {
      await ctx.db.delete(id as Id<'storageByContentHash'>);
    },
    insertContentHash: async (contentHash, storageId) => {
      await ctx.db.insert('storageByContentHash', {
        contentHash,
        storageId: asStorageId(storageId),
      });
    },
    findSourceOptimization: async (inputHash, optimizerVersion) => {
      const row = await ctx.db
        .query('sourceOptimizationCache')
        .withIndex('by_inputHash_optimizerVersion', (q) =>
          q.eq('inputHash', inputHash).eq('optimizerVersion', optimizerVersion),
        )
        .unique();
      if (row === null) {
        return null;
      }
      return { id: row._id, storageId: row.storageId };
    },
    deleteSourceOptimization: async (id) => {
      await ctx.db.delete(id as Id<'sourceOptimizationCache'>);
    },
    insertSourceOptimization: async (row) => {
      await ctx.db.insert('sourceOptimizationCache', {
        inputHash: row.inputHash,
        optimizerVersion: row.optimizerVersion,
        storageId: asStorageId(row.storageId),
      });
    },
    deleteStorage: async (storageId) => {
      await ctx.storage.delete(asStorageId(storageId));
    },
  };
}

export const lookupLiveSourceOptimization = internalQuery({
  args: {
    inputHash: v.string(),
    optimizerVersion: v.string(),
  },
  returns: v.union(v.id('_storage'), v.null()),
  handler: async (ctx, args): Promise<Id<'_storage'> | null> => {
    const row = await ctx.db
      .query('sourceOptimizationCache')
      .withIndex('by_inputHash_optimizerVersion', (q) =>
        q
          .eq('inputHash', args.inputHash)
          .eq('optimizerVersion', args.optimizerVersion),
      )
      .unique();
    if (row === null) {
      return null;
    }
    const storageExists =
      (await ctx.db.system.get('_storage', row.storageId)) !== null;
    const storageId = liveCachedStorageId(row, storageExists);
    if (storageId === null) {
      return null;
    }
    return asStorageId(storageId);
  },
});

export const finalizeCandidateStorage = internalMutation({
  args: {
    candidateStorageId: v.id('_storage'),
    contentHash: v.string(),
    inputHash: v.optional(v.string()),
    optimizerVersion: v.optional(v.string()),
  },
  returns: v.id('_storage'),
  handler: async (ctx, args): Promise<Id<'_storage'>> => {
    const storageId = await finalizeCandidateStorageRecords({
      db: finalizeDb(ctx),
      activeOptimizerVersion: SOURCE_OPTIMIZER_VERSION,
      candidateStorageId: args.candidateStorageId,
      contentHash: args.contentHash,
      ...(args.inputHash !== undefined ? { inputHash: args.inputHash } : {}),
      ...(args.optimizerVersion !== undefined
        ? { optimizerVersion: args.optimizerVersion }
        : {}),
    });
    return asStorageId(storageId);
  },
});
