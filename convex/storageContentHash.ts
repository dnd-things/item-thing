import { v } from 'convex/values';

import type { Id } from './_generated/dataModel';
import { internalMutation, internalQuery } from './_generated/server';
import {
  finalizeCandidateStorageRecords,
  lookupLiveSourceOptimization as lookupLiveSourceOptimizationRecords,
} from './lib/sourceReuse';

export const lookupLiveSourceOptimization = internalQuery({
  args: {
    inputHash: v.string(),
    optimizerVersion: v.string(),
  },
  returns: v.union(v.id('_storage'), v.null()),
  handler: async (ctx, args): Promise<Id<'_storage'> | null> => {
    return lookupLiveSourceOptimizationRecords(ctx, args);
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
    return finalizeCandidateStorageRecords(ctx, {
      candidateStorageId: args.candidateStorageId,
      contentHash: args.contentHash,
      ...(args.inputHash !== undefined ? { inputHash: args.inputHash } : {}),
      ...(args.optimizerVersion !== undefined
        ? { optimizerVersion: args.optimizerVersion }
        : {}),
    });
  },
});
