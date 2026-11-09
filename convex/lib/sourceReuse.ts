import { ConvexError } from 'convex/values';

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

export type FinalizeCandidateStorageDb = {
  storageExists(storageId: string): Promise<boolean>;
  findContentHash(
    contentHash: string,
  ): Promise<{ id: string; storageId: string } | null>;
  deleteContentHash(id: string): Promise<void>;
  insertContentHash(contentHash: string, storageId: string): Promise<void>;
  findSourceOptimization(
    inputHash: string,
    optimizerVersion: string,
  ): Promise<{ id: string; storageId: string } | null>;
  deleteSourceOptimization(id: string): Promise<void>;
  insertSourceOptimization(row: {
    inputHash: string;
    optimizerVersion: string;
    storageId: string;
  }): Promise<void>;
  deleteStorage(storageId: string): Promise<void>;
};

export async function finalizeCandidateStorageRecords(args: {
  db: FinalizeCandidateStorageDb;
  activeOptimizerVersion: string;
  candidateStorageId: string;
  contentHash: string;
  inputHash?: string;
  optimizerVersion?: string;
}): Promise<string> {
  if (
    args.optimizerVersion !== undefined &&
    args.optimizerVersion !== args.activeOptimizerVersion
  ) {
    throw sourceReuseFailure(STALE_OPTIMIZER_VERSION);
  }

  const inputHash = args.inputHash;
  const optimizerVersion = args.optimizerVersion;

  let inputRow =
    inputHash !== undefined && optimizerVersion !== undefined
      ? await args.db.findSourceOptimization(inputHash, optimizerVersion)
      : null;
  let canonical: string | null = null;
  if (inputRow !== null) {
    if (await args.db.storageExists(inputRow.storageId)) {
      canonical = inputRow.storageId;
    } else {
      await args.db.deleteSourceOptimization(inputRow.id);
      inputRow = null;
    }
  }

  let outputRow = await args.db.findContentHash(args.contentHash);
  if (
    outputRow !== null &&
    !(await args.db.storageExists(outputRow.storageId))
  ) {
    await args.db.deleteContentHash(outputRow.id);
    outputRow = null;
  }

  if (canonical === null) {
    if (outputRow !== null) {
      canonical = outputRow.storageId;
    } else if (await args.db.storageExists(args.candidateStorageId)) {
      canonical = args.candidateStorageId;
    } else {
      throw new Error('Candidate storage not found');
    }
  }

  const candidateIsMapped =
    (inputRow !== null && inputRow.storageId === args.candidateStorageId) ||
    (outputRow !== null && outputRow.storageId === args.candidateStorageId);

  if (canonical === args.candidateStorageId && outputRow === null) {
    await args.db.insertContentHash(args.contentHash, canonical);
  }

  if (
    inputHash !== undefined &&
    optimizerVersion !== undefined &&
    inputRow === null
  ) {
    await args.db.insertSourceOptimization({
      inputHash,
      optimizerVersion,
      storageId: canonical,
    });
  }

  if (args.candidateStorageId !== canonical && !candidateIsMapped) {
    await args.db.deleteStorage(args.candidateStorageId);
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
