import { ConvexError } from 'convex/values';

export type PreparedSource = {
  storageId: string;
  optimizerVersion: string;
};

export type PreviewReuseSlot = {
  dataUrl: string;
  promise: Promise<PreparedSource>;
} | null;

export type SourceReuseStatus = {
  optimizerVersion: string;
  reusable: boolean;
};

type PreviewReuseDeps = {
  prepare: (dataUrl: string) => Promise<PreparedSource>;
  validate: (prepared: PreparedSource) => Promise<SourceReuseStatus>;
};

type SlotRef = { current: PreviewReuseSlot };

type BoundPreparation = {
  source: PreparedSource;
  token: Promise<PreparedSource> | null;
};

const slotEpochs = new WeakMap<SlotRef, number>();

function slotEpoch(slotRef: SlotRef): number {
  return slotEpochs.get(slotRef) ?? 0;
}

function installPreparation(
  slotRef: SlotRef,
  dataUrl: string,
  prepare: PreviewReuseDeps['prepare'],
  epoch: number,
): { promise: Promise<PreparedSource>; token: Promise<PreparedSource> | null } {
  const created = prepare(dataUrl);
  const handle: { promise?: Promise<PreparedSource> } = {};
  handle.promise = created.then(
    (prepared) => prepared,
    (error: unknown) => {
      if (slotRef.current?.promise === handle.promise) {
        slotRef.current = null;
      }
      throw error;
    },
  );
  const promise = handle.promise;
  if (slotEpoch(slotRef) !== epoch) {
    return { promise, token: null };
  }
  slotRef.current = { dataUrl, promise };
  return { promise, token: promise };
}

async function reusePrepared(
  slotRef: SlotRef,
  dataUrl: string,
  currentPromise: Promise<PreparedSource>,
  prepared: PreparedSource,
  deps: PreviewReuseDeps,
  epoch: number,
): Promise<BoundPreparation> {
  const status = await deps.validate(prepared);
  if (
    status.reusable &&
    status.optimizerVersion === prepared.optimizerVersion
  ) {
    return { source: prepared, token: currentPromise };
  }
  if (
    slotEpoch(slotRef) === epoch &&
    slotRef.current?.promise === currentPromise
  ) {
    const installed = installPreparation(slotRef, dataUrl, deps.prepare, epoch);
    return { source: await installed.promise, token: installed.token };
  }
  if (slotEpoch(slotRef) === epoch && slotRef.current?.dataUrl === dataUrl) {
    return beginPreparation(slotRef, dataUrl, deps, epoch, true);
  }
  return { source: await deps.prepare(dataUrl), token: null };
}

async function beginPreparation(
  slotRef: SlotRef,
  dataUrl: string,
  deps: PreviewReuseDeps,
  epoch: number,
  replace: boolean,
): Promise<BoundPreparation> {
  const current = slotRef.current;
  if (slotEpoch(slotRef) === epoch && current?.dataUrl === dataUrl) {
    const token = current.promise;
    const prepared = await token;
    return reusePrepared(slotRef, dataUrl, token, prepared, deps, epoch);
  }
  if (slotEpoch(slotRef) !== epoch || (!replace && current !== null)) {
    return { source: await deps.prepare(dataUrl), token: null };
  }
  const installed = installPreparation(slotRef, dataUrl, deps.prepare, epoch);
  return { source: await installed.promise, token: installed.token };
}

export function releasePreviewReuseSlot(slotRef: SlotRef): void {
  slotRef.current = null;
  slotEpochs.set(slotRef, slotEpoch(slotRef) + 1);
}

export function syncPreviewReuseSlotOnArtworkChange(
  slotRef: SlotRef,
  artworkPresent: { current: boolean },
  sourcePreviewDataUrl: string,
): void {
  const present = sourcePreviewDataUrl.trim() !== '';
  if (artworkPresent.current && !present) {
    releasePreviewReuseSlot(slotRef);
  }
  artworkPresent.current = present;
}

export function isRetryableSourceReuseError(error: unknown): boolean {
  if (!(error instanceof ConvexError)) {
    return false;
  }
  const data: unknown = error.data;
  if (typeof data !== 'object' || data === null || !('code' in data)) {
    return false;
  }
  const code = data.code;
  return code === 'stale_optimizer_version' || code === 'stale_source';
}

export async function persistExportWithPreviewReuse<TSnapshot>(
  slotRef: SlotRef,
  input: {
    workbenchSnapshot: TSnapshot;
    sourceImagePreviewDataUrl: string;
    exportFormat: 'png' | 'jpg';
    exportPixelRatio: 1 | 2;
  },
  deps: PreviewReuseDeps & {
    insert: (record: {
      workbenchSnapshot: TSnapshot;
      exportFormat: 'png' | 'jpg';
      exportPixelRatio: 1 | 2;
      sourceImageStorageId?: string;
      sourceOptimizerVersion?: string;
    }) => Promise<void>;
  },
): Promise<void> {
  const dataUrl = input.sourceImagePreviewDataUrl;
  const epoch = slotEpoch(slotRef);
  let token: Promise<PreparedSource> | null = null;

  const run = async (
    replace: boolean,
    failedToken: Promise<PreparedSource> | null,
  ): Promise<void> => {
    if (dataUrl.trim() === '') {
      releasePreviewReuseSlot(slotRef);
      await deps.insert({
        workbenchSnapshot: input.workbenchSnapshot,
        exportFormat: input.exportFormat,
        exportPixelRatio: input.exportPixelRatio,
      });
      return;
    }
    if (
      failedToken !== null &&
      slotEpoch(slotRef) === epoch &&
      slotRef.current?.promise === failedToken
    ) {
      slotRef.current = null;
    }
    const bound = await beginPreparation(
      slotRef,
      dataUrl,
      deps,
      epoch,
      replace,
    );
    token = bound.token;
    await deps.insert({
      workbenchSnapshot: input.workbenchSnapshot,
      exportFormat: input.exportFormat,
      exportPixelRatio: input.exportPixelRatio,
      sourceImageStorageId: bound.source.storageId,
      sourceOptimizerVersion: bound.source.optimizerVersion,
    });
  };

  try {
    await run(true, null);
  } catch (error: unknown) {
    if (!isRetryableSourceReuseError(error)) {
      throw error;
    }
    await run(false, token);
  }
}
