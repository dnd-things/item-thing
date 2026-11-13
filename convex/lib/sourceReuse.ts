import { ConvexError } from 'convex/values';

import type { Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';
import { SOURCE_OPTIMIZER_VERSION } from './sourceOptimizerVersion.ts';

export const STALE_OPTIMIZER_VERSION = 'stale_optimizer_version';
export const STALE_SOURCE = 'stale_source';

export type SourceReuseErrorCode =
  | typeof STALE_OPTIMIZER_VERSION
  | typeof STALE_SOURCE;

export function sourceReuseFailure(
  code: SourceReuseErrorCode,
): ConvexError<{ code: SourceReuseErrorCode }> {
  return new ConvexError({ code });
}

export function liveCachedStorageId(
  row: { storageId: string } | null,
  storageExists: boolean,
): string | null {
  if (row === null || !storageExists) {
    return null;
  }
  return row.storageId;
}

export function sourceReuseStatus(args: {
  activeOptimizerVersion: string;
  hasStorageId: boolean;
  optimizerVersion?: string;
  storageExists: boolean;
}): { optimizerVersion: string; reusable: boolean } {
  return {
    optimizerVersion: args.activeOptimizerVersion,
    reusable:
      args.hasStorageId &&
      args.optimizerVersion === args.activeOptimizerVersion &&
      args.storageExists,
  };
}

async function storageIdExists(
  ctx: MutationCtx,
  storageId: Id<'_storage'>,
): Promise<boolean> {
  return (await ctx.db.system.get('_storage', storageId)) !== null;
}

export async function lookupLiveSourceOptimization(
  ctx: QueryCtx,
  args: { inputHash: string; optimizerVersion: string },
): Promise<Id<'_storage'> | null> {
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
  return row.storageId;
}

export async function finalizeCandidateStorageRecords(
  ctx: MutationCtx,
  args: {
    candidateStorageId: Id<'_storage'>;
    contentHash: string;
    inputHash?: string;
    optimizerVersion?: string;
  },
): Promise<Id<'_storage'>> {
  if (
    args.optimizerVersion !== undefined &&
    args.optimizerVersion !== SOURCE_OPTIMIZER_VERSION
  ) {
    throw sourceReuseFailure(STALE_OPTIMIZER_VERSION);
  }

  const inputHash = args.inputHash;
  const optimizerVersion = args.optimizerVersion;

  let inputRow =
    inputHash !== undefined && optimizerVersion !== undefined
      ? await ctx.db
          .query('sourceOptimizationCache')
          .withIndex('by_inputHash_optimizerVersion', (q) =>
            q
              .eq('inputHash', inputHash)
              .eq('optimizerVersion', optimizerVersion),
          )
          .unique()
      : null;
  let canonical: Id<'_storage'> | null = null;
  if (inputRow !== null) {
    if (await storageIdExists(ctx, inputRow.storageId)) {
      canonical = inputRow.storageId;
    } else {
      await ctx.db.delete(inputRow._id);
      inputRow = null;
    }
  }

  let outputRow = await ctx.db
    .query('storageByContentHash')
    .withIndex('by_contentHash', (q) => q.eq('contentHash', args.contentHash))
    .first();
  if (
    outputRow !== null &&
    !(await storageIdExists(ctx, outputRow.storageId))
  ) {
    await ctx.db.delete(outputRow._id);
    outputRow = null;
  }

  if (canonical === null) {
    if (outputRow !== null) {
      canonical = outputRow.storageId;
    } else if (await storageIdExists(ctx, args.candidateStorageId)) {
      canonical = args.candidateStorageId;
    } else {
      throw new Error('Candidate storage not found');
    }
  }

  const candidateIsMapped =
    (inputRow !== null && inputRow.storageId === args.candidateStorageId) ||
    (outputRow !== null && outputRow.storageId === args.candidateStorageId);

  if (canonical === args.candidateStorageId && outputRow === null) {
    await ctx.db.insert('storageByContentHash', {
      contentHash: args.contentHash,
      storageId: canonical,
    });
  }

  if (
    inputHash !== undefined &&
    optimizerVersion !== undefined &&
    inputRow === null
  ) {
    await ctx.db.insert('sourceOptimizationCache', {
      inputHash,
      optimizerVersion,
      storageId: canonical,
    });
  }

  if (args.candidateStorageId !== canonical && !candidateIsMapped) {
    await ctx.storage.delete(args.candidateStorageId);
  }

  return canonical;
}

export async function createItemExportRecord<
  TSnapshot,
  TStorageId extends string,
>(
  args: {
    workbenchSnapshot: TSnapshot;
    exportFormat: 'png' | 'jpg';
    exportPixelRatio: 1 | 2;
    sourceImageStorageId?: TStorageId;
    sourceOptimizerVersion?: string;
  },
  deps: {
    activeOptimizerVersion: string;
    storageExists: (storageId: TStorageId) => Promise<boolean>;
    insert: (doc: {
      workbenchSnapshot: TSnapshot;
      exportFormat: 'png' | 'jpg';
      exportPixelRatio: 1 | 2;
      sourceImageStorageId?: TStorageId;
    }) => Promise<void>;
  },
): Promise<void> {
  const sourceImageStorageId = args.sourceImageStorageId;
  if (
    sourceImageStorageId !== undefined &&
    args.sourceOptimizerVersion !== undefined
  ) {
    if (args.sourceOptimizerVersion !== deps.activeOptimizerVersion) {
      throw sourceReuseFailure(STALE_OPTIMIZER_VERSION);
    }
    if (!(await deps.storageExists(sourceImageStorageId))) {
      throw sourceReuseFailure(STALE_SOURCE);
    }
  }

  await deps.insert({
    workbenchSnapshot: args.workbenchSnapshot,
    exportFormat: args.exportFormat,
    exportPixelRatio: args.exportPixelRatio,
    ...(sourceImageStorageId !== undefined ? { sourceImageStorageId } : {}),
  });
}
