import { v } from 'convex/values';

import type { Id } from './_generated/dataModel';
import { internalMutation } from './_generated/server';

export const finalizeCandidateStorage = internalMutation({
  args: {
    candidateStorageId: v.id('_storage'),
    /** SHA-256 of stored bytes, lowercase hex (64 chars). Computed in the caller action. */
    contentHash: v.string(),
  },
  returns: v.id('_storage'),
  handler: async (ctx, args): Promise<Id<'_storage'>> => {
    const existing = await ctx.db
      .query('storageByContentHash')
      .withIndex('by_contentHash', (q) => q.eq('contentHash', args.contentHash))
      .first();

    if (existing !== null) {
      await ctx.storage.delete(args.candidateStorageId);
      return existing.storageId;
    }

    await ctx.db.insert('storageByContentHash', {
      contentHash: args.contentHash,
      storageId: args.candidateStorageId,
    });
    return args.candidateStorageId;
  },
});
