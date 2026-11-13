import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { resolveTransformedObjectUrl } from '../../card-renderer/lib/use-flipped-image-preview-url.ts';
import { loadImageElementFromObjectUrl } from './read-image-preview-data.ts';
import { createWorkbenchArtworkStore } from './workbench-artwork-store.ts';
import { workbenchItemDetailsSchema } from './workbench-form-schema.ts';
import { defaultMagicItemWorkbenchState } from './workbench-options.ts';
import {
  encodeWorkbenchEnvelopeV8,
  fileFromImageBytes,
  parseImageDataUrl,
  parseWorkbenchStorageJson,
  persistedWorkbenchStateKeys,
  previewDataUrlToBlob,
  projectPersistedWorkbenchState,
} from './workbench-persistence.ts';
import { toWorkbenchSnapshotForExport } from './workbench-snapshot-for-export.ts';

const pngBytes = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3, 4]);

function encodeBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function dataUrlFrom(bytes: Uint8Array, mimeType = 'image/png'): string {
  return `data:${mimeType};base64,${encodeBase64(bytes)}`;
}

function sampleState(previewUrl = dataUrlFrom(pngBytes)) {
  return {
    ...defaultMagicItemWorkbenchState,
    cardLayout: 'image-right' as const,
    sideLayoutFlow: 'fluid' as const,
    cardStyle: 'classic' as const,
    cardBorderRadius: 'none' as const,
    cardWidthAuto: false,
    cardWidthPx: 612,
    imageSize: 80,
    imageAspectRatio: 'portrait' as const,
    resolvedImageAspectRatio: 0.8,
    imageBorderRadius: 20,
    imageBorderWidthPx: 4,
    imageRightVerticalPosition: 12,
    imageRotationDegrees: 90,
    imageFlipHorizontal: true,
    imageFlipVertical: false,
    artworkColorSource: 'custom' as const,
    artworkCustomColor: '#aabbcc',
    imageFileName: 'sword.png',
    imagePreviewUrl: previewUrl,
    itemName: 'Sunblade',
    classificationAndRarity: 'Weapon, rare',
    requiresAttunement: true,
    flavorDescription: 'Warm.',
    mechanicalDescription: 'Deals damage.',
  };
}

class FakeRequest<T> {
  result: T | undefined = undefined;
  error: DOMException | null = null;
  onsuccess: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onblocked: ((event: Event) => void) | null = null;
  onupgradeneeded: ((event: Event) => void) | null = null;
}

interface PendingWrite {
  store: string;
  op: 'put' | 'delete';
  key: IDBValidKey;
  value?: unknown;
}

class FakeTransaction {
  error: DOMException | null = null;
  oncomplete: ((event: Event) => void) | null = null;
  onabort: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  done = false;
  aborted = false;
  readonly ops: string[] = [];
  readonly pending: PendingWrite[] = [];
  private queue: Array<() => void> = [];
  private pumping = false;
  readonly database: FakeDatabase;
  readonly storeNames: string[];
  readonly mode: IDBTransactionMode;

  constructor(
    database: FakeDatabase,
    storeNames: string[],
    mode: IDBTransactionMode,
  ) {
    this.database = database;
    this.storeNames = storeNames;
    this.mode = mode;
    database.transactions.push(this);
  }

  objectStore(name: string): FakeObjectStore {
    return new FakeObjectStore(this, name);
  }

  enqueue(task: () => void): void {
    if (this.aborted || this.done) {
      throw new DOMException(
        'The transaction finished.',
        'TransactionInactiveError',
      );
    }
    this.queue.push(task);
    if (this.pumping) {
      return;
    }
    this.pumping = true;
    queueMicrotask(() => {
      this.pumping = false;
      this.drain();
    });
  }

  request<T>(
    value: T,
    options?: { fail?: DOMException; afterSuccess?: () => void },
  ): FakeRequest<T> {
    const request = new FakeRequest<T>();
    this.enqueue(() => {
      if (this.aborted || this.done) {
        return;
      }
      if (options?.fail) {
        request.error = options.fail;
        this.error = options.fail;
        request.onerror?.(new Event('error'));
        this.onerror?.(new Event('error'));
        this.abort();
        return;
      }
      request.result = value;
      request.onsuccess?.(new Event('success'));
      options?.afterSuccess?.();
    });
    return request;
  }

  private drain(): void {
    if (this.aborted || this.done) {
      return;
    }
    const task = this.queue.shift();
    if (task) {
      task();
      if (!this.aborted && !this.done) {
        this.pumping = true;
        queueMicrotask(() => {
          this.pumping = false;
          this.drain();
        });
      }
      return;
    }
    this.done = true;
    this.database.apply(this.pending);
    this.oncomplete?.(new Event('complete'));
  }

  abort(): void {
    if (this.done || this.aborted) {
      return;
    }
    this.aborted = true;
    this.pending.splice(0, this.pending.length);
    if (!this.error) {
      this.error = new DOMException(
        'The transaction was aborted.',
        'AbortError',
      );
    }
    this.onabort?.(new Event('abort'));
  }
}

class FakeObjectStore {
  private readonly transaction: FakeTransaction;
  readonly name: string;

  constructor(transaction: FakeTransaction, name: string) {
    this.transaction = transaction;
    this.name = name;
  }

  get(key: IDBValidKey): FakeRequest<unknown> {
    this.transaction.ops.push(`${this.name}.get`);
    return this.transaction.request(
      this.transaction.database.stores.get(this.name)?.get(key),
    );
  }

  getKey(key: IDBValidKey): FakeRequest<IDBValidKey | undefined> {
    this.transaction.ops.push(`${this.name}.getKey`);
    const found = this.transaction.database.stores.get(this.name)?.has(key);
    return this.transaction.request(found ? key : undefined);
  }

  put(value: unknown, key: IDBValidKey): FakeRequest<IDBValidKey> {
    this.transaction.ops.push(`${this.name}.put`);
    if (
      this.name === 'artwork' &&
      this.transaction.database.factory.throwCloneOnArtworkPut
    ) {
      throw new DOMException(
        'The object could not be cloned.',
        'DataCloneError',
      );
    }
    if (this.transaction.database.factory.quotaOnPut) {
      return this.transaction.request(key, {
        fail: new DOMException('Quota exceeded.', 'QuotaExceededError'),
      });
    }
    this.transaction.pending.push({
      store: this.name,
      op: 'put',
      key,
      value,
    });
    return this.transaction.request(key, {
      afterSuccess: () => {
        if (this.transaction.database.factory.abortAfterPutSuccess) {
          this.transaction.database.factory.abortAfterPutSuccess = false;
          this.transaction.abort();
        }
      },
    });
  }

  delete(key: IDBValidKey): FakeRequest<undefined> {
    this.transaction.ops.push(`${this.name}.delete`);
    this.transaction.pending.push({ store: this.name, op: 'delete', key });
    return this.transaction.request(undefined);
  }
}

class FakeDatabase {
  readonly stores = new Map<string, Map<IDBValidKey, unknown>>();
  readonly transactions: FakeTransaction[] = [];
  onversionchange: ((event: Event) => void) | null = null;
  closed = false;
  readonly factory: FakeFactory;
  readonly name: string;
  version: number;
  readonly objectStoreNames = {
    contains: (name: string) => this.stores.has(name),
  };

  constructor(factory: FakeFactory, name: string, version: number) {
    this.factory = factory;
    this.name = name;
    this.version = version;
  }

  createObjectStore(name: string): void {
    this.stores.set(name, new Map());
  }

  transaction(storeNames: string[], mode: IDBTransactionMode): FakeTransaction {
    if (this.closed) {
      throw new DOMException('Database is closed.', 'InvalidStateError');
    }
    return new FakeTransaction(this, storeNames, mode);
  }

  close(): void {
    this.closed = true;
    for (const transaction of this.transactions) {
      transaction.abort();
    }
  }

  apply(pending: readonly PendingWrite[]): void {
    for (const write of pending) {
      const store = this.stores.get(write.store);
      if (!store) {
        continue;
      }
      if (write.op === 'delete') {
        store.delete(write.key);
        continue;
      }
      store.set(write.key, write.value);
    }
  }
}

class FakeFactory {
  readonly databases = new Map<string, FakeDatabase>();
  openCount = 0;
  blocked = false;
  openError: DOMException | null = null;
  quotaOnPut = false;
  abortAfterPutSuccess = false;
  throwCloneOnArtworkPut = false;

  open(name: string, version: number): FakeRequest<FakeDatabase> {
    this.openCount += 1;
    const request = new FakeRequest<FakeDatabase>();
    queueMicrotask(() => {
      if (this.blocked) {
        request.onblocked?.(new Event('blocked'));
        return;
      }
      if (this.openError) {
        request.error = this.openError;
        request.onerror?.(new Event('error'));
        return;
      }
      let database = this.databases.get(name);
      const needsUpgrade = !database || database.version < version;
      if (!database) {
        database = new FakeDatabase(this, name, version);
        this.databases.set(name, database);
      }
      request.result = database;
      if (needsUpgrade) {
        database.version = version;
        request.onupgradeneeded?.(new Event('upgradeneeded'));
      }
      request.onsuccess?.(new Event('success'));
    });
    return request;
  }
}

function factoryDatabase(factory: FakeFactory): FakeDatabase {
  const database = factory.databases.get('item-card-workbench');
  assert.ok(database);
  return database;
}

describe('workbench persistence codec', () => {
  test('projects persisted fields before serialization and omits preview bytes', () => {
    const preview = dataUrlFrom(pngBytes);
    const state = sampleState(preview);
    const extra = Object.assign(state, { draftToken: 'do-not-store' });
    const projected = projectPersistedWorkbenchState(extra);
    assert.equal('imagePreviewUrl' in projected, false);
    assert.equal('draftToken' in projected, false);
    assert.deepEqual(Object.keys(projected), [...persistedWorkbenchStateKeys]);
    const json = encodeWorkbenchEnvelopeV8(extra, 'asset-1');
    assert.equal(json.includes(preview), false);
    assert.equal(json.includes('draftToken'), false);
    assert.equal(json.includes('do-not-store'), false);
    const parsed = JSON.parse(json) as {
      version: number;
      assetKey: string;
      state: Record<string, unknown>;
    };
    assert.equal(parsed.version, 8);
    assert.equal(parsed.assetKey, 'asset-1');
    assert.equal('imagePreviewUrl' in parsed.state, false);
  });

  test('round-trips normalized workbench fields and keeps exact preview bytes', async () => {
    const state = sampleState();
    const json = encodeWorkbenchEnvelopeV8(state, null);
    const parsed = parseWorkbenchStorageJson(json);
    assert.equal(parsed.kind, 'v8');
    if (parsed.kind !== 'v8') {
      return;
    }
    const restored = {
      ...parsed.state,
      imagePreviewUrl: state.imagePreviewUrl,
    };
    assert.deepEqual(restored, state);
    assert.equal(encodeWorkbenchEnvelopeV8(restored, null), json);
    const blob = previewDataUrlToBlob(state.imagePreviewUrl);
    assert.equal(blob.type, 'image/png');
    assert.deepEqual(new Uint8Array(await blob.arrayBuffer()), pngBytes);
    const file = fileFromImageBytes(pngBytes, state.imageFileName, 'image/png');
    const validation = workbenchItemDetailsSchema.safeParse({
      itemName: state.itemName,
      imageFile: file,
      classificationAndRarity: state.classificationAndRarity,
      requiresAttunement: state.requiresAttunement,
      flavorDescription: state.flavorDescription,
      mechanicalDescription: state.mechanicalDescription,
    });
    assert.equal(validation.success, true);
    const snapshot = toWorkbenchSnapshotForExport({
      ...state,
      imagePreviewUrl: state.imagePreviewUrl,
    });
    assert.equal('imagePreviewUrl' in snapshot, false);
    assert.equal(snapshot.imageFileName, 'sword.png');
    assert.equal(snapshot.mechanicalDescription, 'Deals damage.');
  });

  test('parses only image data URLs into exact bytes', async () => {
    const parsed = parseImageDataUrl(dataUrlFrom(pngBytes, 'image/jpeg'));
    assert.equal(parsed.ok, true);
    if (parsed.ok) {
      assert.equal(parsed.mimeType, 'image/jpeg');
      assert.deepEqual(parsed.bytes, pngBytes);
    }
    assert.equal(parseImageDataUrl('https://example.test/a.png').ok, false);
    assert.equal(parseImageDataUrl('blob:https://example.test/a').ok, false);
    assert.equal(
      parseImageDataUrl('data:text/plain;base64,SGVsbG8=').ok,
      false,
    );
    assert.equal(parseImageDataUrl('data:image/png;base64,****').ok, false);
    assert.equal(parseImageDataUrl('data:image/png;base64,').ok, false);
    assert.equal(parseImageDataUrl('data:image/png,abcd').ok, false);
    const calls: string[] = [];
    const original = URL.createObjectURL;
    Object.assign(URL, {
      createObjectURL: () => {
        calls.push('create');
        return 'blob:preview';
      },
    });
    try {
      previewDataUrlToBlob(dataUrlFrom(pngBytes));
    } finally {
      Object.assign(URL, { createObjectURL: original });
    }
    assert.deepEqual(calls, []);
  });
});

describe('native IndexedDB adapter transaction events', () => {
  test('metadata save checks the key and does not read or rewrite the blob', async () => {
    const factory = new FakeFactory();
    const store = createWorkbenchArtworkStore({
      indexedDB: factory as unknown as IDBFactory,
    });
    const blob = new Blob([pngBytes], { type: 'image/png' });
    const first = await store.commit({
      kind: 'replace',
      json: '{"version":7,"assetKey":"asset-a"}',
      assetKey: 'asset-a',
      previousAssetKey: null,
      newBlob: blob,
    });
    assert.equal(first.ok, true);
    const database = factoryDatabase(factory);
    database.transactions.splice(0, database.transactions.length);
    const second = await store.commit({
      kind: 'metadata',
      json: '{"version":7,"assetKey":"asset-a","state":{"itemName":"Edited"}}',
      assetKey: 'asset-a',
    });
    assert.equal(second.ok, true);
    const metadata = database.transactions.at(-1);
    assert.ok(metadata);
    assert.deepEqual(metadata.ops, ['artwork.getKey', 'workbench.put']);
    assert.equal(
      database.stores.get('artwork')?.get('asset-a') instanceof Blob,
      true,
    );
    assert.equal(database.transactions.length, 1);
  });

  test('a missing asset key aborts before metadata is written', async () => {
    const factory = new FakeFactory();
    const store = createWorkbenchArtworkStore({
      indexedDB: factory as unknown as IDBFactory,
    });
    await store.commit({
      kind: 'replace',
      json: '{"version":7,"assetKey":"asset-a"}',
      assetKey: 'asset-a',
      previousAssetKey: null,
      newBlob: new Blob([pngBytes], { type: 'image/png' }),
    });
    const before = factoryDatabase(factory)
      .stores.get('workbench')
      ?.get('current');
    const result = await store.commit({
      kind: 'metadata',
      json: '{"version":7,"assetKey":"missing"}',
      assetKey: 'missing',
    });
    assert.deepEqual(result, { ok: false, reason: 'conflict' });
    assert.equal(
      factoryDatabase(factory).stores.get('workbench')?.get('current'),
      before,
    );
  });

  test('a clone error after metadata is queued aborts and keeps the previous record', async () => {
    const factory = new FakeFactory();
    const store = createWorkbenchArtworkStore({
      indexedDB: factory as unknown as IDBFactory,
    });
    const blob = new Blob([pngBytes], { type: 'image/png' });
    const previous =
      '{"version":7,"assetKey":"asset-a","state":{"itemName":"Before"}}';
    assert.equal(
      (
        await store.commit({
          kind: 'replace',
          json: previous,
          assetKey: 'asset-a',
          previousAssetKey: null,
          newBlob: blob,
        })
      ).ok,
      true,
    );
    factory.throwCloneOnArtworkPut = true;
    const result = await store.commit({
      kind: 'replace',
      json: '{"version":7,"assetKey":"asset-b","state":{"itemName":"After"}}',
      assetKey: 'asset-b',
      previousAssetKey: 'asset-a',
      newBlob: new Blob([Uint8Array.from([9])], { type: 'image/png' }),
    });
    assert.deepEqual(result, { ok: false, reason: 'unknown' });
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
    const database = factoryDatabase(factory);
    const failed = database.transactions.at(-1);
    assert.equal(failed?.aborted, true);
    assert.equal(failed?.done, false);
    assert.equal(database.stores.get('workbench')?.get('current'), previous);
    assert.equal(database.stores.get('artwork')?.get('asset-a'), blob);
    assert.equal(database.stores.get('artwork')?.has('asset-b'), false);
  });

  test('request success followed by transaction abort is not a commit', async () => {
    const factory = new FakeFactory();
    factory.abortAfterPutSuccess = true;
    const store = createWorkbenchArtworkStore({
      indexedDB: factory as unknown as IDBFactory,
    });
    const result = await store.commit({
      kind: 'replace',
      json: '{"version":7,"assetKey":"asset-a"}',
      assetKey: 'asset-a',
      previousAssetKey: null,
      newBlob: new Blob([pngBytes], { type: 'image/png' }),
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, 'aborted');
    }
    const database = factoryDatabase(factory);
    assert.equal(database.stores.get('workbench')?.has('current'), false);
    assert.equal(database.stores.get('artwork')?.has('asset-a'), false);
  });

  test('quota, blocked, security, and versionchange stay typed and closed', async () => {
    const quotaFactory = new FakeFactory();
    quotaFactory.quotaOnPut = true;
    const quotaStore = createWorkbenchArtworkStore({
      indexedDB: quotaFactory as unknown as IDBFactory,
    });
    const quota = await quotaStore.commit({
      kind: 'metadata',
      json: '{"version":7,"assetKey":null}',
      assetKey: null,
    });
    assert.deepEqual(quota, { ok: false, reason: 'quota' });
    assert.equal(
      factoryDatabase(quotaFactory).stores.get('workbench')?.has('current'),
      false,
    );

    const blockedFactory = new FakeFactory();
    blockedFactory.blocked = true;
    const blockedStore = createWorkbenchArtworkStore({
      indexedDB: blockedFactory as unknown as IDBFactory,
    });
    assert.deepEqual(await blockedStore.load(), {
      ok: false,
      reason: 'blocked',
    });
    assert.deepEqual(await blockedStore.load(), {
      ok: false,
      reason: 'blocked',
    });
    assert.equal(blockedFactory.openCount, 1);

    const deniedFactory = new FakeFactory();
    deniedFactory.openError = new DOMException('Denied.', 'SecurityError');
    const deniedStore = createWorkbenchArtworkStore({
      indexedDB: deniedFactory as unknown as IDBFactory,
    });
    assert.deepEqual(await deniedStore.load(), {
      ok: false,
      reason: 'unavailable',
    });

    const missing = createWorkbenchArtworkStore({ indexedDB: null });
    assert.deepEqual(await missing.load(), {
      ok: false,
      reason: 'unavailable',
    });

    let versionChanges = 0;
    const versionFactory = new FakeFactory();
    const versionStore = createWorkbenchArtworkStore({
      indexedDB: versionFactory as unknown as IDBFactory,
      onVersionChange() {
        versionChanges += 1;
      },
    });
    assert.equal((await versionStore.load()).ok, true);
    const database = factoryDatabase(versionFactory);
    database.onversionchange?.(new Event('versionchange'));
    assert.equal(versionChanges, 1);
    assert.equal(database.closed, true);
    assert.deepEqual(
      await versionStore.commit({
        kind: 'metadata',
        json: '{}',
        assetKey: null,
      }),
      { ok: false, reason: 'unavailable' },
    );
  });

  test('loads metadata and artwork in one readonly transaction', async () => {
    const factory = new FakeFactory();
    const store = createWorkbenchArtworkStore({
      indexedDB: factory as unknown as IDBFactory,
    });
    const blob = new Blob([pngBytes], { type: 'image/png' });
    assert.equal(
      (
        await store.commit({
          kind: 'replace',
          json: encodeWorkbenchEnvelopeV8(sampleState(), 'asset-a'),
          assetKey: 'asset-a',
          previousAssetKey: 'asset-old',
          newBlob: blob,
        })
      ).ok,
      true,
    );
    const database = factoryDatabase(factory);
    assert.equal(database.stores.get('artwork')?.has('asset-old'), false);
    database.transactions.splice(0, database.transactions.length);
    const loaded = await store.load();
    assert.equal(loaded.ok, true);
    if (loaded.ok) {
      assert.equal(loaded.record?.blob, blob);
    }
    assert.equal(database.transactions.length, 1);
    assert.equal(database.transactions[0]?.mode, 'readonly');
    assert.deepEqual(database.transactions[0]?.storeNames, [
      'workbench',
      'artwork',
    ]);
    assert.deepEqual(database.transactions[0]?.ops, [
      'workbench.get',
      'artwork.get',
    ]);
  });

  test('a non-string record is corrupt rather than an empty workbench', async () => {
    const factory = new FakeFactory();
    const store = createWorkbenchArtworkStore({
      indexedDB: factory as unknown as IDBFactory,
    });
    assert.equal((await store.load()).ok, true);
    const database = factoryDatabase(factory);
    database.stores.get('workbench')?.set('current', { version: 7 });
    assert.deepEqual(await store.load(), { ok: false, reason: 'corrupt' });
  });
});

describe('preview URL ownership', () => {
  test('decode helper revokes its temporary URL on success and error', async () => {
    const revoked: string[] = [];
    const originalCreate = Object.getOwnPropertyDescriptor(
      URL,
      'createObjectURL',
    );
    const originalRevoke = Object.getOwnPropertyDescriptor(
      URL,
      'revokeObjectURL',
    );
    const OriginalImage = globalThis.Image;
    let fail = false;
    Object.assign(URL, {
      createObjectURL: () => 'blob:preview-test',
      revokeObjectURL: (url: string) => {
        revoked.push(url);
      },
    });
    class FakeImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      naturalWidth = 2;
      naturalHeight = 2;
      set src(_value: string) {
        queueMicrotask(() => {
          if (fail) {
            this.onerror?.();
            return;
          }
          this.onload?.();
        });
      }
    }
    Object.assign(globalThis, { Image: FakeImage });
    try {
      const image = await loadImageElementFromObjectUrl(
        new Blob([pngBytes], { type: 'image/png' }),
      );
      assert.equal(image.naturalWidth, 2);
      fail = true;
      await assert.rejects(
        loadImageElementFromObjectUrl(
          new Blob([pngBytes], { type: 'image/png' }),
        ),
      );
    } finally {
      if (originalCreate) {
        Object.defineProperty(URL, 'createObjectURL', originalCreate);
      }
      if (originalRevoke) {
        Object.defineProperty(URL, 'revokeObjectURL', originalRevoke);
      }
      Object.assign(globalThis, { Image: OriginalImage });
    }
    assert.deepEqual(revoked, ['blob:preview-test', 'blob:preview-test']);
  });

  test('a cancelled transform does not create an object URL', () => {
    let created = 0;
    let revoked = 0;
    const resolved = resolveTransformedObjectUrl({
      cancelled: true,
      blob: new Blob(['png']),
      previousUrl: 'blob:old',
      sourceUrl: 'data:image/png;base64,AAAA',
      createObjectURL: () => {
        created += 1;
        return 'blob:new';
      },
      revokeObjectURL: () => {
        revoked += 1;
      },
    });
    assert.equal(created, 0);
    assert.equal(revoked, 0);
    assert.equal(resolved.ownedUrl, 'blob:old');
    const published = resolveTransformedObjectUrl({
      cancelled: false,
      blob: new Blob(['png']),
      previousUrl: 'blob:old',
      sourceUrl: 'data:image/png;base64,AAAA',
      createObjectURL: () => {
        created += 1;
        return 'blob:new';
      },
      revokeObjectURL: () => {
        revoked += 1;
      },
    });
    assert.equal(created, 1);
    assert.equal(revoked, 1);
    assert.equal(published.effectiveUrl, 'blob:new');
  });
});

describe('conditional saved-card reset', () => {
  test('a stale reset preserves a newer compatible save and its artwork', async () => {
    const factory = new FakeFactory();
    const store = createWorkbenchArtworkStore({
      indexedDB: factory as unknown as IDBFactory,
    });
    const old = JSON.stringify({ version: 7, state: {}, assetKey: 'old' });
    const blob = new Blob([pngBytes], { type: 'image/png' });
    await store.commit({
      kind: 'replace',
      json: old,
      assetKey: 'old',
      previousAssetKey: null,
      newBlob: blob,
    });
    const loaded = await store.load();
    assert.equal(loaded.ok, true);
    const newer = encodeWorkbenchEnvelopeV8(sampleState(), 'new');
    await store.commit({
      kind: 'replace',
      json: newer,
      assetKey: 'new',
      previousAssetKey: 'old',
      newBlob: blob,
    });
    const result = await store.commit({
      kind: 'reset',
      expectedJson: old,
      json: encodeWorkbenchEnvelopeV8(defaultMagicItemWorkbenchState, null),
      previousAssetKey: 'old',
    });
    assert.deepEqual(result, { ok: false, reason: 'conflict' });
    const restored = await store.load();
    assert.equal(restored.ok, true);
    if (restored.ok) assert.equal(restored.record?.json, newer);
    assert.equal(
      factoryDatabase(factory).stores.get('artwork')?.get('new'),
      blob,
    );
  });
  test('an unchanged incompatible save resets and deletes only its associated artwork', async () => {
    const factory = new FakeFactory();
    const store = createWorkbenchArtworkStore({
      indexedDB: factory as unknown as IDBFactory,
    });
    const old = JSON.stringify({ version: 7, state: {}, assetKey: 'old' });
    await store.commit({
      kind: 'replace',
      json: old,
      assetKey: 'old',
      previousAssetKey: null,
      newBlob: new Blob([pngBytes]),
    });
    const empty = encodeWorkbenchEnvelopeV8(
      defaultMagicItemWorkbenchState,
      null,
    );
    assert.deepEqual(
      await store.commit({
        kind: 'reset',
        expectedJson: old,
        json: empty,
        previousAssetKey: 'old',
      }),
      { ok: true },
    );
    const loaded = await store.load();
    assert.equal(loaded.ok, true);
    if (loaded.ok) assert.equal(loaded.record?.json, empty);
    assert.equal(
      factoryDatabase(factory).stores.get('artwork')?.has('old'),
      false,
    );
  });
});
