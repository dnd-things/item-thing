import {
  type CardExportCandidate,
  type PreparedSource,
  persistCardExport,
  type SourceReuseStatus,
} from '../../card-export/lib/persist-card-export.ts';

export { isRetryableSourceReuseError } from '../../card-export/lib/persist-card-export.ts';
export type { PreparedSource, SourceReuseStatus };

export type PreviewReuseSlot = {
  dataUrl: string;
  promise: Promise<PreparedSource>;
} | null;

type PreviewReuseDeps = {
  prepare: (dataUrl: string) => Promise<PreparedSource>;
  validate: (prepared: PreparedSource) => Promise<SourceReuseStatus>;
};

type SlotRef = { current: PreviewReuseSlot };

type BrowserHold = Promise<PreparedSource> | null;

const slotEpochs = new WeakMap<SlotRef, number>();

function slotEpoch(slotRef: SlotRef): number {
  return slotEpochs.get(slotRef) ?? 0;
}

export function capturePreviewReuseOwnership(slotRef: SlotRef): number {
  return slotEpoch(slotRef);
}

function ownedReuseEpoch(
  slotRef: SlotRef,
  reuseEpoch: number | undefined,
): number {
  if (reuseEpoch === undefined) {
    return slotEpoch(slotRef);
  }
  return reuseEpoch;
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

async function readPreviewCandidate(
  slotRef: SlotRef,
  dataUrl: string,
  epoch: number,
  attempt: 1 | 2,
  discard: BrowserHold,
  deps: PreviewReuseDeps,
): Promise<CardExportCandidate<BrowserHold>> {
  if (
    discard !== null &&
    slotEpoch(slotRef) === epoch &&
    slotRef.current?.promise === discard
  ) {
    slotRef.current = null;
  }
  if (dataUrl.trim() === '') {
    if (slotEpoch(slotRef) === epoch) {
      releasePreviewReuseSlot(slotRef);
    }
    return { kind: 'absent' };
  }
  const replace = attempt === 1;
  const current = slotRef.current;
  if (slotEpoch(slotRef) === epoch && current?.dataUrl === dataUrl) {
    const token = current.promise;
    const source = await token;
    return { kind: 'cached', source, hold: token };
  }
  if (slotEpoch(slotRef) !== epoch || (!replace && current !== null)) {
    const source = await deps.prepare(dataUrl);
    return { kind: 'fresh', source, hold: null };
  }
  const installed = installPreparation(slotRef, dataUrl, deps.prepare, epoch);
  const source = await installed.promise;
  return { kind: 'fresh', source, hold: installed.token };
}

async function replacePreviewCandidate(
  slotRef: SlotRef,
  dataUrl: string,
  epoch: number,
  hold: BrowserHold,
  deps: PreviewReuseDeps,
): Promise<CardExportCandidate<BrowserHold>> {
  if (
    hold !== null &&
    slotEpoch(slotRef) === epoch &&
    slotRef.current?.promise === hold
  ) {
    const installed = installPreparation(slotRef, dataUrl, deps.prepare, epoch);
    const source = await installed.promise;
    return { kind: 'fresh', source, hold: installed.token };
  }
  if (slotEpoch(slotRef) === epoch && slotRef.current?.dataUrl === dataUrl) {
    const token = slotRef.current.promise;
    const source = await token;
    return { kind: 'cached', source, hold: token };
  }
  const source = await deps.prepare(dataUrl);
  return { kind: 'fresh', source, hold: null };
}

export function releasePreviewReuseSlot(slotRef: SlotRef): void {
  slotRef.current = null;
  slotEpochs.set(slotRef, slotEpoch(slotRef) + 1);
}

export function syncPreviewReuseSlotOnArtworkChange(
  slotRef: SlotRef,
  artworkPresent: { current: boolean; url?: string },
  sourcePreviewDataUrl: string,
): void {
  const next = sourcePreviewDataUrl.trim();
  const previous = artworkPresent.url ?? '';
  if (
    artworkPresent.current &&
    (next === '' || (previous !== '' && next !== previous))
  ) {
    releasePreviewReuseSlot(slotRef);
  }
  artworkPresent.current = next !== '';
  artworkPresent.url = next;
}

export async function persistExportWithPreviewReuse<TSnapshot>(
  slotRef: SlotRef,
  input: {
    workbenchSnapshot: TSnapshot;
    sourceImagePreviewDataUrl: string;
    exportFormat: 'png' | 'jpg';
    exportPixelRatio: 1 | 2;
    reuseEpoch?: number;
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
  const epoch = ownedReuseEpoch(slotRef, input.reuseEpoch);
  await persistCardExport<BrowserHold>({
    read: ({ attempt, discard }) =>
      readPreviewCandidate(slotRef, dataUrl, epoch, attempt, discard, deps),
    replace: (hold) =>
      replacePreviewCandidate(slotRef, dataUrl, epoch, hold, deps),
    isCurrent: (hold) => {
      if (hold === null) {
        return false;
      }
      return slotEpoch(slotRef) === epoch && slotRef.current?.promise === hold;
    },
    validate: deps.validate,
    insert: async (source) => {
      if (source === null) {
        await deps.insert({
          workbenchSnapshot: input.workbenchSnapshot,
          exportFormat: input.exportFormat,
          exportPixelRatio: input.exportPixelRatio,
        });
        return;
      }
      await deps.insert({
        workbenchSnapshot: input.workbenchSnapshot,
        exportFormat: input.exportFormat,
        exportPixelRatio: input.exportPixelRatio,
        sourceImageStorageId: source.storageId,
        sourceOptimizerVersion: source.optimizerVersion,
      });
    },
  });
}
