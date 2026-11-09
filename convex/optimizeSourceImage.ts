'use node';

import { v } from 'convex/values';
import { internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { action } from './_generated/server';
import {
  optimizeSourcePng,
  storeOptimizedSourceImage,
} from './optimizeSourcePng';

export const optimizeSourceImage = action({
  args: {
    sourceStorageId: v.id('_storage'),
    mimeType: v.string(),
  },
  returns: v.id('_storage'),
  handler: async (ctx, args): Promise<Id<'_storage'>> => {
    void args.mimeType;
    return await storeOptimizedSourceImage({
      sourceStorageId: args.sourceStorageId,
      load: (sourceStorageId) => ctx.storage.get(sourceStorageId),
      optimize: (input) => optimizeSourcePng(input),
      store: (blob) => ctx.storage.store(blob),
      finalize: (payload) =>
        ctx.runMutation(
          internal.storageContentHash.finalizeCandidateStorage,
          payload,
        ),
      deleteSource: (sourceStorageId) => ctx.storage.delete(sourceStorageId),
    });
  },
});
