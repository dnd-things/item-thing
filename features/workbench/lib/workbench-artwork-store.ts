'use client';

import { peekWorkbenchAssetKey } from './workbench-persistence';

const DATABASE_NAME = 'item-card-workbench';
const DATABASE_VERSION = 1;
const WORKBENCH_STORE = 'workbench';
const ARTWORK_STORE = 'artwork';
const CURRENT_RECORD_KEY = 'current';

export type WorkbenchStoreReason =
  | 'unavailable'
  | 'blocked'
  | 'quota'
  | 'conflict'
  | 'aborted'
  | 'corrupt'
  | 'unknown';

export interface WorkbenchStoredRecord {
  json: string;
  blob: unknown;
}

export type WorkbenchLoadResult =
  | { ok: true; record: WorkbenchStoredRecord | null }
  | { ok: false; reason: WorkbenchStoreReason };

export type WorkbenchCommitResult =
  | { ok: true }
  | { ok: false; reason: WorkbenchStoreReason };

export type WorkbenchCommitInput =
  | {
      kind: 'reset';
      json: string;
      expectedJson: string;
      previousAssetKey: string | null;
    }
  | {
      kind: 'metadata';
      json: string;
      assetKey: string | null;
    }
  | {
      kind: 'replace';
      json: string;
      assetKey: string | null;
      previousAssetKey: string | null;
      newBlob?: unknown;
    };

export interface WorkbenchArtworkStore {
  load(): Promise<WorkbenchLoadResult>;
  commit(input: WorkbenchCommitInput): Promise<WorkbenchCommitResult>;
  abortActive(): void;
  close(): void;
}

export interface WorkbenchArtworkStoreOptions {
  indexedDB?: IDBFactory | null;
  onVersionChange?: () => void;
}

class StoreAccessError extends Error {
  readonly reason: WorkbenchStoreReason;

  constructor(reason: WorkbenchStoreReason, cause?: unknown) {
    super(reason);
    this.name = 'StoreAccessError';
    this.reason = reason;
    if (cause !== undefined) {
      this.cause = cause;
    }
  }
}

function reasonFromUnknown(error: unknown): WorkbenchStoreReason {
  if (error instanceof StoreAccessError) {
    return error.reason;
  }
  if (isQuotaError(error)) {
    return 'quota';
  }
  if (isSecurityError(error)) {
    return 'unavailable';
  }
  if (error instanceof DOMException && error.name === 'AbortError') {
    return 'aborted';
  }
  return 'unknown';
}

function isQuotaError(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    (error.name === 'QuotaExceededError' ||
      error.name === 'NS_ERROR_DOM_QUOTA_REACHED')
  );
}

function isSecurityError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'SecurityError';
}

export function createWorkbenchArtworkStore(
  options: WorkbenchArtworkStoreOptions = {},
): WorkbenchArtworkStore {
  let database: IDBDatabase | null = null;
  let opening: Promise<IDBDatabase> | null = null;
  let openFailure: WorkbenchStoreReason | null = null;
  let closed = false;
  let activeTransaction: IDBTransaction | null = null;

  const failOpen = (reason: WorkbenchStoreReason): StoreAccessError => {
    openFailure = reason;
    closed = true;
    return new StoreAccessError(reason);
  };

  const openDatabase = (): Promise<IDBDatabase> => {
    if (closed || openFailure) {
      return Promise.reject(new StoreAccessError(openFailure ?? 'unavailable'));
    }
    if (database) {
      return Promise.resolve(database);
    }
    if (opening) {
      return opening;
    }

    opening = new Promise<IDBDatabase>((resolve, reject) => {
      let factory: IDBFactory | null | undefined;
      try {
        factory =
          options.indexedDB === undefined
            ? globalThis.indexedDB
            : options.indexedDB;
      } catch (error) {
        reject(failOpen(reasonFromUnknown(error)));
        return;
      }
      if (!factory) {
        reject(failOpen('unavailable'));
        return;
      }

      let request: IDBOpenDBRequest;
      try {
        request = factory.open(DATABASE_NAME, DATABASE_VERSION);
      } catch (error) {
        reject(failOpen(reasonFromUnknown(error)));
        return;
      }

      let settled = false;
      const rejectOnce = (reason: WorkbenchStoreReason, cause?: unknown) => {
        if (settled) {
          return;
        }
        settled = true;
        reject(failOpen(reason));
        if (cause !== undefined && reason === 'unknown') {
          openFailure = 'unknown';
        }
      };
      const resolveOnce = (nextDatabase: IDBDatabase) => {
        if (settled || closed) {
          settled = true;
          nextDatabase.close();
          if (!settled || closed) {
            reject(new StoreAccessError('unavailable'));
          }
          return;
        }
        settled = true;
        nextDatabase.onversionchange = () => {
          closed = true;
          openFailure = 'unavailable';
          try {
            nextDatabase.close();
          } catch {
            closed = true;
          }
          if (database === nextDatabase) {
            database = null;
          }
          options.onVersionChange?.();
        };
        database = nextDatabase;
        resolve(nextDatabase);
      };

      request.onupgradeneeded = () => {
        const upgrading = request.result;
        if (!upgrading.objectStoreNames.contains(WORKBENCH_STORE)) {
          upgrading.createObjectStore(WORKBENCH_STORE);
        }
        if (!upgrading.objectStoreNames.contains(ARTWORK_STORE)) {
          upgrading.createObjectStore(ARTWORK_STORE);
        }
      };
      request.onblocked = () => {
        rejectOnce('blocked');
      };
      request.onerror = () => {
        rejectOnce(reasonFromUnknown(request.error), request.error);
      };
      request.onsuccess = () => {
        resolveOnce(request.result);
      };
    }).catch((error: unknown) => {
      opening = null;
      throw error instanceof StoreAccessError
        ? error
        : new StoreAccessError(reasonFromUnknown(error), error);
    });

    return opening;
  };

  const settleTransaction = (
    transaction: IDBTransaction,
    interpretAbort: () => WorkbenchStoreReason,
  ): Promise<WorkbenchCommitResult> => {
    activeTransaction = transaction;
    return new Promise((resolve) => {
      let settled = false;
      const finish = (result: WorkbenchCommitResult) => {
        if (settled) {
          return;
        }
        settled = true;
        if (activeTransaction === transaction) {
          activeTransaction = null;
        }
        resolve(result);
      };
      transaction.oncomplete = () => {
        finish({ ok: true });
      };
      transaction.onabort = () => {
        finish({ ok: false, reason: interpretAbort() });
      };
      transaction.onerror = () => {
        if (transaction.error) {
          interpretAbort();
        }
      };
    });
  };

  return {
    async load() {
      try {
        const connection = await openDatabase();
        if (closed) {
          return { ok: false, reason: 'unavailable' };
        }
        return await new Promise<WorkbenchLoadResult>((resolve) => {
          const transaction = connection.transaction(
            [WORKBENCH_STORE, ARTWORK_STORE],
            'readonly',
          );
          let settled = false;
          const finish = (result: WorkbenchLoadResult) => {
            if (settled) {
              return;
            }
            settled = true;
            resolve(result);
          };
          let record: WorkbenchStoredRecord | null = null;
          let corrupt = false;
          const request = transaction
            .objectStore(WORKBENCH_STORE)
            .get(CURRENT_RECORD_KEY);
          request.onsuccess = () => {
            const value: unknown = request.result;
            if (value === undefined) {
              return;
            }
            if (typeof value !== 'string') {
              corrupt = true;
              return;
            }
            record = { json: value, blob: null };
            const assetKey = peekWorkbenchAssetKey(value);
            if (typeof assetKey !== 'string') {
              return;
            }
            const blobRequest = transaction
              .objectStore(ARTWORK_STORE)
              .get(assetKey);
            blobRequest.onsuccess = () => {
              const blob: unknown = blobRequest.result;
              if (blob !== undefined) {
                record = { json: value, blob };
              }
            };
          };
          transaction.oncomplete = () => {
            if (corrupt) {
              finish({ ok: false, reason: 'corrupt' });
              return;
            }
            finish({ ok: true, record });
          };
          transaction.onabort = () => {
            finish({
              ok: false,
              reason: isQuotaError(transaction.error) ? 'quota' : 'unknown',
            });
          };
          transaction.onerror = () => {
            finish({
              ok: false,
              reason: reasonFromUnknown(transaction.error),
            });
          };
        });
      } catch (error) {
        return { ok: false, reason: reasonFromUnknown(error) };
      }
    },

    async commit(input) {
      let connection: IDBDatabase;
      try {
        connection = await openDatabase();
      } catch (error) {
        return { ok: false, reason: reasonFromUnknown(error) };
      }
      if (closed) {
        return { ok: false, reason: 'unavailable' };
      }

      let transaction: IDBTransaction;
      try {
        transaction = connection.transaction(
          [WORKBENCH_STORE, ARTWORK_STORE],
          'readwrite',
        );
      } catch (error) {
        return { ok: false, reason: reasonFromUnknown(error) };
      }

      const enqueueFailure: { reason: WorkbenchStoreReason | null } = {
        reason: null,
      };
      let conflict = false;
      const settled = settleTransaction(transaction, () => {
        if (enqueueFailure.reason) {
          return enqueueFailure.reason;
        }
        if (conflict) {
          return 'conflict';
        }
        if (isQuotaError(transaction.error)) {
          return 'quota';
        }
        if (transaction.error && transaction.error.name === 'AbortError') {
          return 'aborted';
        }
        return transaction.error
          ? reasonFromUnknown(transaction.error)
          : 'aborted';
      });

      try {
        const workbenchStore = transaction.objectStore(WORKBENCH_STORE);
        const artworkStore = transaction.objectStore(ARTWORK_STORE);

        if (input.kind === 'reset') {
          const request = workbenchStore.get(CURRENT_RECORD_KEY);
          request.onsuccess = () => {
            if (request.result !== input.expectedJson) {
              conflict = true;
              transaction.abort();
              return;
            }
            try {
              workbenchStore.put(input.json, CURRENT_RECORD_KEY);
              if (input.previousAssetKey)
                artworkStore.delete(input.previousAssetKey);
            } catch (error) {
              enqueueFailure.reason = reasonFromUnknown(error);
              transaction.abort();
            }
          };
        } else if (input.kind === 'metadata') {
          if (input.assetKey === null) {
            workbenchStore.put(input.json, CURRENT_RECORD_KEY);
          } else {
            const assetKey = input.assetKey;
            const keyRequest = artworkStore.getKey(assetKey);
            keyRequest.onerror = () => {
              conflict = false;
            };
            keyRequest.onsuccess = () => {
              if (keyRequest.result === undefined) {
                conflict = true;
                try {
                  transaction.abort();
                } catch {
                  conflict = true;
                }
                return;
              }
              try {
                workbenchStore.put(input.json, CURRENT_RECORD_KEY);
              } catch (error) {
                enqueueFailure.reason = reasonFromUnknown(error);
                try {
                  transaction.abort();
                } catch (abortError) {
                  enqueueFailure.reason =
                    enqueueFailure.reason ?? reasonFromUnknown(abortError);
                }
              }
            };
          }
        } else {
          workbenchStore.put(input.json, CURRENT_RECORD_KEY);
          if (input.newBlob && input.assetKey) {
            artworkStore.put(input.newBlob, input.assetKey);
          }
          if (
            input.previousAssetKey &&
            input.previousAssetKey !== input.assetKey
          ) {
            artworkStore.delete(input.previousAssetKey);
          }
        }
      } catch (error) {
        enqueueFailure.reason = reasonFromUnknown(error);
        try {
          transaction.abort();
        } catch (abortError) {
          enqueueFailure.reason =
            enqueueFailure.reason ?? reasonFromUnknown(abortError);
        }
      }

      return settled;
    },

    abortActive() {
      const transaction = activeTransaction;
      if (!transaction) {
        return;
      }
      try {
        transaction.abort();
      } catch {
        activeTransaction = null;
      }
    },

    close() {
      closed = true;
      openFailure = 'unavailable';
      try {
        activeTransaction?.abort();
      } catch {
        activeTransaction = null;
      }
      activeTransaction = null;
      database?.close();
      database = null;
    },
  };
}
