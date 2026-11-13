'use client';

import { artworkLimitCopy, fitsDisplayBudget } from './artwork-geometry';
import {
  type ArtworkBundle,
  bundleFromLegacyBlob,
  isPreparedFile,
  markPreparedFile,
  readArtworkBundle,
} from './artwork-source';
import { measureImageBlob } from './read-image-preview-data';
import {
  createWorkbenchArtworkStore,
  type WorkbenchArtworkStore,
  type WorkbenchCommitResult,
  type WorkbenchStoredRecord,
  type WorkbenchStoreReason,
} from './workbench-artwork-store';
import {
  defaultMagicItemWorkbenchState,
  type MagicItemWorkbenchState,
} from './workbench-options';
import {
  decodeImageDataUrl,
  encodeWorkbenchEnvelopeV8,
  parseImageDataUrl,
  parseWorkbenchStorageJson,
  peekWorkbenchAssetKey,
  previewDataUrlToBlob,
  readBlobAsDataUrl,
} from './workbench-persistence';

export const WORKBENCH_AUTOSAVE_DELAY_MS = 400;
export const WORKBENCH_LOAD_TIMEOUT_MS = 5000;

export const workbenchPersistenceCopy = {
  loading: 'Loading saved workbench.',
  unavailable:
    'Cannot save in this browser. You can still edit and export this tab. Reload to try again. Unsaved edits are lost on reload.',
  blocked:
    'Browser storage is blocked. You can still edit and export this tab. Reload to try again. Unsaved edits are lost on reload.',
  timeout:
    'Saved workbench did not load in time. You can still edit and export this tab. Reload to try again. Unsaved edits are lost on reload.',
  quota:
    'Browser storage is full. You can still edit and export this tab. Reload to try again. Unsaved edits are lost on reload.',
  conflict:
    'This tab is out of date. Reload to keep saving. You can still export this tab. Unsaved edits are lost on reload.',
  reset: 'An older saved card was cleared. You are editing a new card.',
  corrupt:
    'Saved artwork cannot be read. Reload, or replace the image, to save again. You can still export this tab.',
  saveFailed:
    'Could not save. You can still edit and export this tab. Reload to try again. Unsaved edits are lost on reload.',
  clearFailed:
    'Could not clear saved artwork. The last save is unchanged. Reload to try again. Unsaved edits are lost on reload.',
  imageUnreadable: 'Could not read that image. Choose a different one.',
  imageTooLarge: artworkLimitCopy.savedTooLarge,
  imageSavingPaused:
    'Saving is paused. Edits will be lost on reload. Choose another image or clear it to resume saving.',
} as const;

export function workbenchImageFailureNotice(reason?: string): string {
  const lead = reason?.trim() || workbenchPersistenceCopy.imageUnreadable;
  return `${lead} ${workbenchPersistenceCopy.imageSavingPaused}`;
}

export interface WorkbenchClock {
  setTimeout(callback: () => void, delayMs: number): { cancel: () => void };
}

export interface WorkbenchHydration {
  state: MagicItemWorkbenchState;
  imageFile: File | undefined;
}

export type ImageWatchKind = 'ignore' | 'skip' | 'clear' | 'prepare';

export interface ImageWatch {
  id: number;
  kind: ImageWatchKind;
}

export interface AcceptedPreview {
  file: File;
  previewUrl: string;
  aspectRatio: number;
  bundle?: ArtworkBundle;
}

export interface WorkbenchPersistenceDeps {
  store: WorkbenchArtworkStore;
  convertPreviewToBlob: (dataUrl: string) => Promise<Blob>;
  blobToDataUrl: (blob: Blob) => Promise<string>;
  decodeImageDataUrl: (dataUrl: string) => Promise<boolean>;
  measureImageDataUrl?: (
    dataUrl: string,
  ) => Promise<{ width: number; height: number } | null>;
  clock?: WorkbenchClock;
  createAssetKey?: () => string;
  warn?: (message: string) => void;
  loadTimeoutMs?: number;
  autosaveMs?: number;
}

export interface WorkbenchPersistenceSession {
  start(): void;
  dispose(): void;
  subscribe(listener: () => void): () => void;
  getPhase(): 'loading' | 'settled';
  getNotice(): string | null;
  takeHydration(): WorkbenchHydration | null;
  shouldSkipImageProcessing(file: File | undefined): boolean;
  beginImageWatch(file: File | undefined): ImageWatch;
  cancelImageWatch(id: number): void;
  acceptPreview(id: number, preview: AcceptedPreview): boolean;
  failPreview(id: number, message?: string): void;
  captureArtwork(): ArtworkBundle | null;
  commitClear(state: MagicItemWorkbenchState): void;
  scheduleSnapshot(state: MagicItemWorkbenchState): void;
  cancelDebounce(): void;
  notifyStoreDisconnected(): void;
}

type PersistenceMode = 'autosave' | 'recover' | 'frozen';
type WatchKind = ImageWatchKind;

function systemWorkbenchClock(): WorkbenchClock {
  return {
    setTimeout(callback, delayMs) {
      const timer = setTimeout(callback, delayMs);
      return {
        cancel() {
          clearTimeout(timer);
        },
      };
    },
  };
}

function messageFor(
  reason: WorkbenchStoreReason | 'timeout' | 'conflict',
): string {
  switch (reason) {
    case 'blocked':
      return workbenchPersistenceCopy.blocked;
    case 'quota':
      return workbenchPersistenceCopy.quota;
    case 'timeout':
      return workbenchPersistenceCopy.timeout;
    case 'conflict':
      return workbenchPersistenceCopy.conflict;
    case 'corrupt':
      return workbenchPersistenceCopy.corrupt;
    case 'unavailable':
      return workbenchPersistenceCopy.unavailable;
    default:
      return workbenchPersistenceCopy.saveFailed;
  }
}

export function createWorkbenchAssetKey(webCrypto: Crypto = crypto): string {
  if (typeof webCrypto.randomUUID === 'function') {
    return webCrypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  webCrypto.getRandomValues(bytes);
  const version = bytes[6] ?? 0;
  const variant = bytes[8] ?? 0;
  bytes[6] = (version & 0x0f) | 0x40;
  bytes[8] = (variant & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function withoutPreview(
  state: MagicItemWorkbenchState,
): MagicItemWorkbenchState {
  return {
    ...state,
    imagePreviewUrl: '',
  };
}

export function createWorkbenchPersistenceSession(
  deps: WorkbenchPersistenceDeps,
): WorkbenchPersistenceSession {
  const clock = deps.clock ?? systemWorkbenchClock();
  const loadTimeoutMs = deps.loadTimeoutMs ?? WORKBENCH_LOAD_TIMEOUT_MS;
  const autosaveMs = deps.autosaveMs ?? WORKBENCH_AUTOSAVE_DELAY_MS;
  const createAssetKey =
    deps.createAssetKey ?? (() => createWorkbenchAssetKey());
  const warn = deps.warn ?? ((message: string) => console.warn(message));

  let phase: 'loading' | 'settled' = 'loading';
  let mode: PersistenceMode = 'autosave';
  let notice: string | null = null;
  let recoveryNoticeBase: string | null = null;
  let warned = false;
  let disposed = false;
  let started = false;
  let hydrateGeneration = 0;
  let imageEpoch = 0;
  let queueTicket = 0;
  let chain: Promise<void> = Promise.resolve();
  let sawLiveImage = false;
  let watchKind: WatchKind = 'ignore';
  let preparation: 'idle' | 'pending' | 'accepted' | 'failed' = 'idle';
  let failedGeneration: number | null = null;
  let restoredFile: File | undefined;
  let acceptedFile: File | undefined;
  let durableAssetKey: string | null = null;
  let currentBundle: ArtworkBundle | null = null;
  let lastCommittedJson: string | null = null;
  let latestState: MagicItemWorkbenchState | null = null;
  let hydration: WorkbenchHydration | null = null;
  let debounce: { cancel: () => void } | null = null;
  let loadTimer: { cancel: () => void } | null = null;
  let metadataQueued = false;
  let cancelConversionWait: (() => void) | null = null;
  let conversion: {
    epoch: number;
    assetKey: string;
    promise: Promise<Blob>;
  } | null = null;
  const listeners = new Set<() => void>();

  const emit = () => {
    for (const listener of listeners) {
      listener();
    }
  };

  const rememberWarning = () => {
    if (warned) {
      return;
    }
    warned = true;
    warn(notice ?? workbenchPersistenceCopy.saveFailed);
  };

  const applyImageFailureNotice = (message?: string) => {
    if (mode === 'frozen') {
      return;
    }
    const failure = workbenchImageFailureNotice(message);
    if (mode === 'recover' && recoveryNoticeBase) {
      notice = `${recoveryNoticeBase} ${failure}`;
    } else {
      notice = failure;
    }
    emit();
  };

  const isCurrent = (generation: number) =>
    !disposed && generation === hydrateGeneration;

  const cancelDebounce = () => {
    debounce?.cancel();
    debounce = null;
  };

  const invalidateQueue = () => {
    queueTicket += 1;
    cancelDebounce();
    metadataQueued = false;
    cancelConversionWait?.();
    cancelConversionWait = null;
    deps.store.abortActive();
  };

  const enqueue = (task: () => Promise<void>) => {
    const ticket = queueTicket;
    chain = chain
      .then(async () => {
        if (ticket !== queueTicket || disposed) {
          return;
        }
        await task();
      })
      .then(
        () => undefined,
        () => undefined,
      );
  };

  const publish = (
    generation: number,
    state: MagicItemWorkbenchState,
    imageFile: File | undefined,
    rawJson: string | null,
    assetKey: string | null,
  ) => {
    if (!isCurrent(generation)) {
      return;
    }
    latestState = { ...state };
    restoredFile = imageFile;
    acceptedFile = imageFile;
    durableAssetKey = assetKey;
    lastCommittedJson = rawJson;
    hydration = { state, imageFile };
    phase = 'settled';
    preparation = imageFile ? 'accepted' : 'idle';
    emit();
  };

  const failClosed = (
    generation: number,
    reason: WorkbenchStoreReason | 'timeout',
  ) => {
    if (!isCurrent(generation) || phase === 'settled') {
      return;
    }
    mode = 'frozen';
    notice = messageFor(reason);
    rememberWarning();
    currentBundle = null;
    publish(generation, defaultMagicItemWorkbenchState, undefined, null, null);
  };

  const degrade = (
    generation: number,
    state: MagicItemWorkbenchState,
    retainedAssetKey: string | null = null,
  ) => {
    if (!isCurrent(generation) || phase === 'settled') {
      return;
    }
    mode = 'recover';
    notice = workbenchPersistenceCopy.corrupt;
    recoveryNoticeBase = workbenchPersistenceCopy.corrupt;
    rememberWarning();
    currentBundle = null;
    publish(
      generation,
      withoutPreview(state),
      undefined,
      null,
      retainedAssetKey,
    );
  };

  const freeze = (reason: WorkbenchStoreReason | 'timeout' | 'conflict') => {
    if (disposed || mode === 'frozen') {
      return;
    }
    mode = 'frozen';
    notice = messageFor(reason);
    rememberWarning();
    emit();
  };

  const noteCommitFailure = (result: WorkbenchCommitResult) => {
    if (result.ok) {
      return;
    }
    if (result.reason === 'conflict') {
      freeze('conflict');
      return;
    }
    freeze(result.reason);
  };

  const recoverIfNeeded = () => {
    if (mode !== 'recover') {
      return;
    }
    mode = 'autosave';
    notice = null;
    recoveryNoticeBase = null;
    emit();
    const state = latestState;
    if (!state || disposed) {
      return;
    }
    if (
      encodeWorkbenchEnvelopeV8(state, durableAssetKey) !== lastCommittedJson
    ) {
      enqueueMetadata();
    }
  };

  const snapshotForPreview = (
    preview: AcceptedPreview,
  ): MagicItemWorkbenchState => {
    const base = latestState ?? defaultMagicItemWorkbenchState;
    return {
      ...base,
      imageFileName: preview.file.name,
      imagePreviewUrl: preview.previewUrl,
      resolvedImageAspectRatio: preview.aspectRatio,
    };
  };

  const enqueueMetadata = () => {
    if (
      metadataQueued ||
      disposed ||
      mode !== 'autosave' ||
      preparation === 'pending' ||
      failedGeneration === imageEpoch
    ) {
      return;
    }
    metadataQueued = true;
    const ticket = queueTicket;
    enqueue(async () => {
      metadataQueued = false;
      if (
        ticket !== queueTicket ||
        disposed ||
        mode !== 'autosave' ||
        preparation === 'pending' ||
        failedGeneration === imageEpoch
      ) {
        return;
      }
      const state = latestState;
      if (!state) {
        return;
      }
      const assetKey = durableAssetKey;
      const json = encodeWorkbenchEnvelopeV8(state, assetKey);
      if (json === lastCommittedJson) {
        return;
      }
      const result = await deps.store.commit({
        kind: 'metadata',
        json,
        assetKey,
      });
      if (ticket !== queueTicket || disposed) {
        return;
      }
      if (!result.ok) {
        noteCommitFailure(result);
        return;
      }
      lastCommittedJson = json;
      if (mode === 'autosave' && notice !== null) {
        notice = null;
        emit();
      }
      const current = latestState;
      if (
        current &&
        encodeWorkbenchEnvelopeV8(current, durableAssetKey) !== json &&
        mode === 'autosave'
      ) {
        enqueueMetadata();
      }
    });
  };

  const measureImage = async (dataUrl: string) => {
    if (deps.measureImageDataUrl) {
      return await deps.measureImageDataUrl(dataUrl);
    }
    return await measureImageBlob(previewDataUrlToBlob(dataUrl));
  };

  const fileFromArtworkSource = (
    bundle: ArtworkBundle,
    fileName: string,
    fallbackMime: string,
  ) => {
    return markPreparedFile(
      new File([bundle.source], fileName.trim() || 'image.png', {
        type: bundle.source.type || fallbackMime,
      }),
    );
  };

  const hydrateBundle = async (
    generation: number,
    state: MagicItemWorkbenchState,
    assetKey: string | null,
    rawJson: string,
    artwork: unknown,
  ) => {
    if (assetKey === null) {
      currentBundle = null;
      mode = 'autosave';
      publish(generation, state, undefined, rawJson, null);
      return;
    }
    const bundle = readArtworkBundle(artwork);
    if (!bundle) {
      degrade(generation, state, assetKey);
      return;
    }
    let dataUrl: string;
    try {
      dataUrl = await deps.blobToDataUrl(bundle.preview);
    } catch {
      if (isCurrent(generation)) {
        degrade(generation, state, assetKey);
      }
      return;
    }
    if (!isCurrent(generation)) {
      return;
    }
    const image = parseImageDataUrl(dataUrl);
    if (!image.ok) {
      degrade(generation, state, assetKey);
      return;
    }
    let decoded = false;
    try {
      decoded = await deps.decodeImageDataUrl(dataUrl);
    } catch {
      decoded = false;
    }
    if (!isCurrent(generation)) {
      return;
    }
    if (!decoded) {
      degrade(generation, state, assetKey);
      return;
    }
    let measured: { width: number; height: number } | null = null;
    try {
      measured = await measureImage(dataUrl);
    } catch {
      measured = null;
    }
    if (!isCurrent(generation)) {
      return;
    }
    if (!measured || !fitsDisplayBudget(measured.width, measured.height)) {
      degrade(generation, state, assetKey);
      return;
    }
    const file = fileFromArtworkSource(
      bundle,
      state.imageFileName,
      bundle.source.type || image.mimeType,
    );
    currentBundle = bundle;
    mode = 'autosave';
    publish(
      generation,
      { ...state, imagePreviewUrl: dataUrl },
      file,
      rawJson,
      assetKey,
    );
  };

  const hydrateStored = async (
    generation: number,
    record: WorkbenchStoredRecord,
    seen: Set<string> = new Set(),
  ) => {
    const parsed = parseWorkbenchStorageJson(record.json);
    if (!isCurrent(generation)) return;
    if (parsed.kind === 'v8') {
      await hydrateBundle(
        generation,
        parsed.state,
        parsed.assetKey,
        record.json,
        record.blob,
      );
      return;
    }
    if (seen.has(record.json)) {
      failClosed(generation, 'conflict');
      return;
    }
    seen.add(record.json);
    const result = await deps.store.commit({
      kind: 'reset',
      expectedJson: record.json,
      json: encodeWorkbenchEnvelopeV8(defaultMagicItemWorkbenchState, null),
      previousAssetKey: peekWorkbenchAssetKey(record.json) ?? null,
    });
    if (!isCurrent(generation)) return;
    if (!result.ok) {
      if (result.reason === 'conflict') {
        const reloaded = await deps.store.load();
        if (!isCurrent(generation)) return;
        if (!reloaded.ok) {
          failClosed(generation, reloaded.reason);
          return;
        }
        if (reloaded.record) {
          await hydrateStored(generation, reloaded.record, seen);
          return;
        }
        mode = 'autosave';
        publish(
          generation,
          defaultMagicItemWorkbenchState,
          undefined,
          null,
          null,
        );
        return;
      }
      failClosed(generation, result.reason);
      return;
    }
    mode = 'autosave';
    notice = workbenchPersistenceCopy.reset;
    publish(
      generation,
      defaultMagicItemWorkbenchState,
      undefined,
      encodeWorkbenchEnvelopeV8(defaultMagicItemWorkbenchState, null),
      null,
    );
  };

  const loadAndHydrate = async (generation: number) => {
    const loaded = await deps.store.load();
    if (!isCurrent(generation)) {
      return;
    }
    if (!loaded.ok) {
      if (loaded.reason === 'blocked') {
        deps.store.close();
      }
      if (loaded.reason === 'corrupt') {
        degrade(generation, defaultMagicItemWorkbenchState);
        return;
      }
      failClosed(generation, loaded.reason);
      return;
    }
    if (loaded.record) {
      await hydrateStored(generation, loaded.record);
      return;
    }
    mode = 'autosave';
    publish(generation, defaultMagicItemWorkbenchState, undefined, null, null);
  };

  const session: WorkbenchPersistenceSession = {
    start() {
      if (started) {
        return;
      }
      started = true;
      const generation = hydrateGeneration;
      loadTimer = clock.setTimeout(() => {
        if (
          disposed ||
          generation !== hydrateGeneration ||
          phase !== 'loading'
        ) {
          return;
        }
        hydrateGeneration += 1;
        deps.store.abortActive();
        deps.store.close();
        failClosed(hydrateGeneration, 'timeout');
      }, loadTimeoutMs);
      void loadAndHydrate(generation)
        .catch(() => {
          if (
            !disposed &&
            generation === hydrateGeneration &&
            phase === 'loading'
          ) {
            failClosed(generation, 'unknown');
          }
        })
        .finally(() => {
          loadTimer?.cancel();
          loadTimer = null;
        });
    },

    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      hydrateGeneration += 1;
      imageEpoch += 1;
      queueTicket += 1;
      cancelConversionWait?.();
      cancelConversionWait = null;
      cancelDebounce();
      loadTimer?.cancel();
      deps.store.abortActive();
      deps.store.close();
      listeners.clear();
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    getPhase() {
      return phase;
    },

    getNotice() {
      return notice;
    },

    takeHydration() {
      const pending = hydration;
      hydration = null;
      return pending;
    },

    shouldSkipImageProcessing(file) {
      if (file === undefined) {
        return false;
      }
      if (isPreparedFile(file) || file === restoredFile) {
        return true;
      }
      return file === acceptedFile && preparation !== 'pending';
    },

    beginImageWatch(file) {
      const id = imageEpoch + 1;
      imageEpoch = id;
      watchKind = 'ignore';
      if (phase !== 'settled') {
        return { id, kind: 'ignore' };
      }
      const initialEmpty =
        !sawLiveImage && file === undefined && restoredFile === undefined;
      const skip = initialEmpty || session.shouldSkipImageProcessing(file);
      sawLiveImage = true;
      if (skip) {
        watchKind = 'skip';
        return { id, kind: 'skip' };
      }
      failedGeneration = null;
      if (file === undefined) {
        watchKind = 'clear';
        preparation = 'idle';
        currentBundle = null;
        if (mode === 'autosave') {
          notice = null;
          emit();
        }
        invalidateQueue();
        return { id, kind: 'clear' };
      }
      watchKind = 'prepare';
      preparation = 'pending';
      conversion = null;
      currentBundle = null;
      invalidateQueue();
      return { id, kind: 'prepare' };
    },

    cancelImageWatch(id) {
      if (id !== imageEpoch) {
        return;
      }
      if (watchKind !== 'prepare' && watchKind !== 'clear') {
        return;
      }
      imageEpoch += 1;
      watchKind = 'ignore';
      preparation = 'idle';
      invalidateQueue();
    },

    acceptPreview(id, preview) {
      if (disposed || id !== imageEpoch) {
        return false;
      }
      preparation = 'accepted';
      acceptedFile = preview.file;
      restoredFile = undefined;
      latestState = snapshotForPreview(preview);
      const provided = preview.bundle
        ? readArtworkBundle(preview.bundle)
        : null;
      if (preview.bundle && !provided) {
        preparation = 'failed';
        failedGeneration = id;
        currentBundle = null;
        applyImageFailureNotice();
        return true;
      }
      if (provided) {
        currentBundle = provided;
      }
      if (mode === 'frozen') {
        emit();
        return true;
      }
      const epoch = id;
      const ticket = queueTicket;
      let cached = conversion;
      if (!provided && (!cached || cached.epoch !== epoch)) {
        cached = {
          epoch,
          assetKey: createAssetKey(),
          promise: deps.convertPreviewToBlob(preview.previewUrl),
        };
        conversion = cached;
      }
      const assetKey = provided ? createAssetKey() : cached?.assetKey;
      if (!assetKey) {
        return false;
      }
      const conversionPromise: Promise<Blob | ArtworkBundle> = provided
        ? Promise.resolve(provided)
        : (cached?.promise ?? Promise.reject(new Error('missing artwork')));
      void conversionPromise.then(
        () => undefined,
        () => undefined,
      );
      let cancelWait: () => void = () => undefined;
      const superseded = new Promise<never>((_resolve, reject) => {
        cancelWait = () => {
          reject(new Error('superseded'));
        };
      });
      void superseded.then(
        () => undefined,
        () => undefined,
      );
      const cancelPriorWait = cancelConversionWait;
      cancelConversionWait = () => {
        cancelPriorWait?.();
        cancelWait();
      };
      enqueue(async () => {
        if (ticket !== queueTicket || epoch !== imageEpoch || disposed) {
          return;
        }
        let artwork: ArtworkBundle;
        try {
          const converted = await Promise.race([
            conversionPromise ?? Promise.reject(new Error('missing')),
            superseded,
          ]);
          artwork = provided ?? bundleFromLegacyBlob(converted as Blob, 1, 1);
        } catch {
          if (epoch !== imageEpoch || disposed) {
            return;
          }
          failedGeneration = epoch;
          preparation = 'failed';
          applyImageFailureNotice();
          return;
        }
        if (ticket !== queueTicket || epoch !== imageEpoch || disposed) {
          return;
        }
        const state = snapshotForPreview(preview);
        latestState = state;
        currentBundle = artwork;
        const json = encodeWorkbenchEnvelopeV8(state, assetKey);
        const result = await deps.store.commit({
          kind: 'replace',
          json,
          assetKey,
          previousAssetKey: durableAssetKey,
          newBlob: artwork,
        });
        if (result.ok) {
          durableAssetKey = assetKey;
          lastCommittedJson = json;
        }
        if (ticket !== queueTicket || epoch !== imageEpoch || disposed) {
          return;
        }
        if (!result.ok) {
          noteCommitFailure(result);
          return;
        }
        currentBundle = artwork;
        if (mode === 'autosave' && notice !== null) {
          notice = null;
          emit();
        }
        recoverIfNeeded();
      });
      return true;
    },

    failPreview(id, message) {
      if (disposed || id !== imageEpoch) {
        return;
      }
      preparation = 'failed';
      failedGeneration = id;
      applyImageFailureNotice(message);
    },

    captureArtwork() {
      return currentBundle;
    },

    commitClear(state) {
      if (disposed) {
        return;
      }
      const cleared = {
        ...state,
        imageFileName: '',
        imagePreviewUrl: '',
      };
      latestState = cleared;
      acceptedFile = undefined;
      restoredFile = undefined;
      currentBundle = null;
      preparation = 'idle';
      failedGeneration = null;
      if (mode === 'frozen') {
        return;
      }
      const epoch = imageEpoch;
      const ticket = queueTicket;
      enqueue(async () => {
        if (ticket !== queueTicket || epoch !== imageEpoch || disposed) {
          return;
        }
        const snapshot = {
          ...(latestState ?? cleared),
          imageFileName: '',
          imagePreviewUrl: '',
        };
        const json = encodeWorkbenchEnvelopeV8(snapshot, null);
        const result = await deps.store.commit({
          kind: 'replace',
          json,
          assetKey: null,
          previousAssetKey: durableAssetKey,
        });
        if (result.ok && !disposed) {
          durableAssetKey = null;
          lastCommittedJson = json;
        }
        if (ticket !== queueTicket || epoch !== imageEpoch || disposed) {
          return;
        }
        if (!result.ok) {
          mode = 'frozen';
          notice = workbenchPersistenceCopy.clearFailed;
          rememberWarning();
          emit();
          return;
        }
        recoverIfNeeded();
      });
    },

    scheduleSnapshot(state) {
      latestState = { ...state };
      if (disposed || phase !== 'settled' || mode !== 'autosave') {
        return;
      }
      if (preparation === 'pending' || failedGeneration === imageEpoch) {
        return;
      }
      cancelDebounce();
      debounce = clock.setTimeout(() => {
        debounce = null;
        enqueueMetadata();
      }, autosaveMs);
    },

    cancelDebounce,

    notifyStoreDisconnected() {
      if (disposed) {
        return;
      }
      hydrateGeneration += 1;
      deps.store.abortActive();
      if (phase === 'loading') {
        failClosed(hydrateGeneration, 'unavailable');
        return;
      }
      freeze('unavailable');
    },
  };

  return session;
}

export function createBrowserWorkbenchPersistenceSession(): WorkbenchPersistenceSession {
  let session: WorkbenchPersistenceSession | null = null;
  const store = createWorkbenchArtworkStore({
    onVersionChange() {
      session?.notifyStoreDisconnected();
    },
  });
  session = createWorkbenchPersistenceSession({
    store,
    convertPreviewToBlob: async (dataUrl) => previewDataUrlToBlob(dataUrl),
    blobToDataUrl: readBlobAsDataUrl,
    decodeImageDataUrl,
    measureImageDataUrl: async (dataUrl) =>
      await measureImageBlob(previewDataUrlToBlob(dataUrl)),
    warn(message) {
      console.warn(message);
    },
  });
  return session;
}
