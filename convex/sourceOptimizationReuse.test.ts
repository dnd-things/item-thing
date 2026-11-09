import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { describe, test } from 'node:test';
import { ConvexError } from 'convex/values';
import { isRetryableSourceReuseError as apiRetryable } from '../features/server-render-card/source-artwork-reuse.ts';
import { isRetryableSourceReuseError as browserRetryable } from '../features/workbench/lib/persist-item-export-with-source-reuse.ts';
import { SOURCE_OPTIMIZER_VERSION } from './lib/sourceOptimizerVersion.ts';
import {
  createItemExportRecord,
  type FinalizeCandidateStorageDb,
  finalizeCandidateStorageRecords,
  liveCachedStorageId,
  STALE_OPTIMIZER_VERSION,
  STALE_SOURCE,
  sourceReuseFailure,
  sourceReuseStatus,
} from './lib/sourceReuse.ts';
import { storeOptimizedSourceImage } from './optimizeSourcePng.ts';

const ACTIVE = SOURCE_OPTIMIZER_VERSION;

function sha256Hex(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

function createCacheDb() {
  let storage = new Set<string>();
  let content = new Map<string, { id: string; storageId: string }>();
  let inputs = new Map<
    string,
    {
      id: string;
      storageId: string;
      inputHash: string;
      optimizerVersion: string;
    }
  >();
  let nextId = 1;
  let chain: Promise<void> = Promise.resolve();

  const snapshot = () => ({
    storage: new Set(storage),
    content: new Map(content),
    inputs: new Map(inputs),
    nextId,
  });

  const restore = (saved: ReturnType<typeof snapshot>) => {
    storage = saved.storage;
    content = saved.content;
    inputs = saved.inputs;
    nextId = saved.nextId;
  };

  const view = (): FinalizeCandidateStorageDb => ({
    storageExists: async (storageId) => storage.has(storageId),
    findContentHash: async (contentHash) => content.get(contentHash) ?? null,
    deleteContentHash: async (id) => {
      for (const [hash, row] of content) {
        if (row.id === id) {
          content.delete(hash);
        }
      }
    },
    insertContentHash: async (contentHash, storageId) => {
      if (content.has(contentHash)) {
        throw new Error(`duplicate content hash ${contentHash}`);
      }
      content.set(contentHash, { id: `content-${nextId}`, storageId });
      nextId += 1;
    },
    findSourceOptimization: async (inputHash, optimizerVersion) =>
      inputs.get(`${inputHash}\0${optimizerVersion}`) ?? null,
    deleteSourceOptimization: async (id) => {
      for (const [key, row] of inputs) {
        if (row.id === id) {
          inputs.delete(key);
        }
      }
    },
    insertSourceOptimization: async (row) => {
      const key = `${row.inputHash}\0${row.optimizerVersion}`;
      if (inputs.has(key)) {
        throw new Error(`duplicate input mapping ${key}`);
      }
      inputs.set(key, { ...row, id: `input-${nextId}` });
      nextId += 1;
    },
    deleteStorage: async (storageId) => {
      storage.delete(storageId);
    },
  });

  return {
    seedStorage(ids: string[]) {
      for (const id of ids) {
        storage.add(id);
      }
    },
    seedContent(contentHash: string, storageId: string) {
      content.set(contentHash, { id: `content-${nextId}`, storageId });
      nextId += 1;
    },
    seedInput(inputHash: string, optimizerVersion: string, storageId: string) {
      inputs.set(`${inputHash}\0${optimizerVersion}`, {
        id: `input-${nextId}`,
        inputHash,
        optimizerVersion,
        storageId,
      });
      nextId += 1;
    },
    transaction<T>(
      run: (db: FinalizeCandidateStorageDb) => Promise<T>,
    ): Promise<T> {
      const result = chain.then(async () => {
        const saved = snapshot();
        try {
          return await run(view());
        } catch (error) {
          restore(saved);
          throw error;
        }
      });
      chain = result.then(
        () => undefined,
        () => undefined,
      );
      return result;
    },
    hasStorage(storageId: string) {
      return storage.has(storageId);
    },
    contentStorage(contentHash: string) {
      return content.get(contentHash)?.storageId;
    },
    inputStorage(inputHash: string, optimizerVersion: string) {
      return inputs.get(`${inputHash}\0${optimizerVersion}`)?.storageId;
    },
    contentSize() {
      return content.size;
    },
    inputSize() {
      return inputs.size;
    },
  };
}

function finalize(
  db: ReturnType<typeof createCacheDb>,
  args: {
    candidateStorageId: string;
    contentHash: string;
    inputHash?: string;
    optimizerVersion?: string;
    activeOptimizerVersion?: string;
  },
) {
  return db.transaction((tx) =>
    finalizeCandidateStorageRecords({
      db: tx,
      activeOptimizerVersion: args.activeOptimizerVersion ?? ACTIVE,
      candidateStorageId: args.candidateStorageId,
      contentHash: args.contentHash,
      ...(args.inputHash !== undefined ? { inputHash: args.inputHash } : {}),
      ...(args.optimizerVersion !== undefined
        ? { optimizerVersion: args.optimizerVersion }
        : {}),
    }),
  );
}

describe('source reuse status and export insert', () => {
  test('status reports the active version and only a live matching id', () => {
    assert.deepEqual(
      sourceReuseStatus({
        activeOptimizerVersion: ACTIVE,
        hasStorageId: false,
        storageExists: false,
      }),
      { optimizerVersion: ACTIVE, reusable: false },
    );
    assert.deepEqual(
      Object.keys(
        sourceReuseStatus({
          activeOptimizerVersion: ACTIVE,
          hasStorageId: true,
          optimizerVersion: 'caller-picked',
          storageExists: true,
        }),
      ),
      ['optimizerVersion', 'reusable'],
    );
    assert.equal(
      sourceReuseStatus({
        activeOptimizerVersion: ACTIVE,
        hasStorageId: true,
        optimizerVersion: 'caller-picked',
        storageExists: true,
      }).reusable,
      false,
    );
    assert.equal(
      sourceReuseStatus({
        activeOptimizerVersion: ACTIVE,
        hasStorageId: true,
        optimizerVersion: ACTIVE,
        storageExists: true,
      }).reusable,
      true,
    );
    assert.equal(
      sourceReuseStatus({
        activeOptimizerVersion: ACTIVE,
        hasStorageId: true,
        optimizerVersion: ACTIVE,
        storageExists: false,
      }).reusable,
      false,
    );
    assert.equal(
      sourceReuseStatus({
        activeOptimizerVersion: ACTIVE,
        hasStorageId: true,
        storageExists: true,
      }).reusable,
      false,
    );
  });

  test('a missing cached blob is not reusable and caller hashes are not ids', () => {
    assert.equal(liveCachedStorageId(null, true), null);
    assert.equal(liveCachedStorageId({ storageId: 'gone' }, false), null);
    assert.equal(liveCachedStorageId({ storageId: 'live' }, true), 'live');
  });

  test('new exports check version and storage before insert; legacy shapes do not', async () => {
    const inserted: Array<{ sourceImageStorageId?: string }> = [];
    let existenceChecks = 0;
    const insert = async (doc: { sourceImageStorageId?: string }) => {
      inserted.push(doc);
    };
    const deps = {
      activeOptimizerVersion: ACTIVE,
      storageExists: async (storageId: string) => {
        existenceChecks += 1;
        return storageId === 'live';
      },
      insert,
    };

    await assert.rejects(
      () =>
        createItemExportRecord(
          {
            workbenchSnapshot: { name: 'one' },
            exportFormat: 'png',
            exportPixelRatio: 1,
            sourceImageStorageId: 'live',
            sourceOptimizerVersion: 'old-version',
          },
          deps,
        ),
      (error: unknown) => {
        assert.ok(error instanceof ConvexError);
        assert.equal(error.data.code, STALE_OPTIMIZER_VERSION);
        return true;
      },
    );
    assert.equal(existenceChecks, 0);
    assert.equal(inserted.length, 0);

    await assert.rejects(
      () =>
        createItemExportRecord(
          {
            workbenchSnapshot: { name: 'two' },
            exportFormat: 'jpg',
            exportPixelRatio: 2,
            sourceImageStorageId: 'missing',
            sourceOptimizerVersion: ACTIVE,
          },
          deps,
        ),
      (error: unknown) => {
        assert.ok(error instanceof ConvexError);
        assert.equal(error.data.code, STALE_SOURCE);
        return true;
      },
    );
    assert.equal(inserted.length, 0);

    await createItemExportRecord(
      {
        workbenchSnapshot: { name: 'three' },
        exportFormat: 'png',
        exportPixelRatio: 2,
        sourceImageStorageId: 'live',
        sourceOptimizerVersion: ACTIVE,
      },
      deps,
    );
    await createItemExportRecord(
      {
        workbenchSnapshot: { name: 'legacy-with-source' },
        exportFormat: 'png',
        exportPixelRatio: 1,
        sourceImageStorageId: 'missing',
      },
      deps,
    );
    await createItemExportRecord(
      {
        workbenchSnapshot: { name: 'legacy-empty' },
        exportFormat: 'jpg',
        exportPixelRatio: 1,
      },
      deps,
    );

    assert.equal(inserted.length, 3);
    assert.equal(inserted[0]?.sourceImageStorageId, 'live');
    assert.equal(inserted[1]?.sourceImageStorageId, 'missing');
    assert.equal(inserted[2]?.sourceImageStorageId, undefined);
    assert.equal(
      browserRetryable(sourceReuseFailure(STALE_OPTIMIZER_VERSION)),
      true,
    );
    assert.equal(apiRetryable(sourceReuseFailure(STALE_SOURCE)), true);
    assert.equal(browserRetryable(new Error('socket hang up')), false);
    assert.equal(
      apiRetryable(new ConvexError({ code: 'not-a-reuse-error' })),
      false,
    );
  });
});

describe('durable finalization', () => {
  test('version fence rejects before any cache write or candidate delete', async () => {
    const db = createCacheDb();
    db.seedStorage(['candidate', 'kept']);
    db.seedContent('kept-hash', 'kept');
    await assert.rejects(
      () =>
        finalize(db, {
          candidateStorageId: 'candidate',
          contentHash: 'new-hash',
          inputHash: 'input',
          optimizerVersion: 'retired-version',
        }),
      (error: unknown) => {
        assert.ok(error instanceof ConvexError);
        assert.equal(error.data.code, STALE_OPTIMIZER_VERSION);
        return true;
      },
    );
    assert.equal(db.hasStorage('candidate'), true);
    assert.equal(db.contentStorage('new-hash'), undefined);
    assert.equal(db.contentStorage('kept-hash'), 'kept');
    assert.equal(db.inputSize(), 0);
  });

  test('legacy output dedup repairs a dead hash row and keeps a live one', async () => {
    const repaired = createCacheDb();
    repaired.seedStorage(['candidate']);
    repaired.seedContent('hash', 'deleted-output');
    assert.equal(
      await finalize(repaired, {
        candidateStorageId: 'candidate',
        contentHash: 'hash',
      }),
      'candidate',
    );
    assert.equal(repaired.contentStorage('hash'), 'candidate');
    assert.equal(repaired.inputSize(), 0);
    assert.equal(repaired.hasStorage('candidate'), true);

    const deduped = createCacheDb();
    deduped.seedStorage(['candidate', 'canonical']);
    deduped.seedContent('hash', 'canonical');
    assert.equal(
      await finalize(deduped, {
        candidateStorageId: 'candidate',
        contentHash: 'hash',
      }),
      'canonical',
    );
    assert.equal(deduped.hasStorage('candidate'), false);
    assert.equal(deduped.hasStorage('canonical'), true);
    assert.equal(deduped.contentStorage('hash'), 'canonical');

    const same = createCacheDb();
    same.seedStorage(['canonical']);
    same.seedContent('hash', 'canonical');
    assert.equal(
      await finalize(same, {
        candidateStorageId: 'canonical',
        contentHash: 'hash',
      }),
      'canonical',
    );
    assert.equal(same.hasStorage('canonical'), true);
  });

  test('stale input and output mappings are replaced by a live candidate', async () => {
    const db = createCacheDb();
    db.seedStorage(['candidate']);
    db.seedInput('input', ACTIVE, 'deleted-output');
    db.seedContent('hash', 'deleted-output');
    assert.equal(
      await finalize(db, {
        candidateStorageId: 'candidate',
        contentHash: 'hash',
        inputHash: 'input',
        optimizerVersion: ACTIVE,
      }),
      'candidate',
    );
    assert.equal(db.inputStorage('input', ACTIVE), 'candidate');
    assert.equal(db.contentStorage('hash'), 'candidate');
    assert.equal(db.hasStorage('candidate'), true);
  });

  test('a missing candidate fails and the rolled-back rows stay until a later repair', async () => {
    const db = createCacheDb();
    db.seedInput('input', ACTIVE, 'deleted-output');
    db.seedContent('hash', 'deleted-output');
    await assert.rejects(
      () =>
        finalize(db, {
          candidateStorageId: 'missing-candidate',
          contentHash: 'hash',
          inputHash: 'input',
          optimizerVersion: ACTIVE,
        }),
      /Candidate storage not found/,
    );
    assert.equal(db.inputStorage('input', ACTIVE), 'deleted-output');
    assert.equal(db.contentStorage('hash'), 'deleted-output');

    db.seedStorage(['fresh']);
    assert.equal(
      await finalize(db, {
        candidateStorageId: 'fresh',
        contentHash: 'hash',
        inputHash: 'input',
        optimizerVersion: ACTIVE,
      }),
      'fresh',
    );
    assert.equal(db.inputStorage('input', ACTIVE), 'fresh');
    assert.equal(db.contentStorage('hash'), 'fresh');
  });

  test('concurrent different outputs keep the first live input mapping', async () => {
    const db = createCacheDb();
    db.seedStorage(['output-a', 'output-b']);
    const first = finalize(db, {
      candidateStorageId: 'output-a',
      contentHash: 'hash-a',
      inputHash: 'same-input',
      optimizerVersion: ACTIVE,
    });
    const second = finalize(db, {
      candidateStorageId: 'output-b',
      contentHash: 'hash-b',
      inputHash: 'same-input',
      optimizerVersion: ACTIVE,
    });
    assert.deepEqual(await Promise.all([first, second]), [
      'output-a',
      'output-a',
    ]);
    assert.equal(db.hasStorage('output-a'), true);
    assert.equal(db.hasStorage('output-b'), false);
    assert.equal(db.contentStorage('hash-a'), 'output-a');
    assert.equal(db.contentStorage('hash-b'), undefined);
    assert.equal(db.inputStorage('same-input', ACTIVE), 'output-a');
    assert.equal(db.contentSize(), 1);
    assert.equal(db.inputSize(), 1);
  });

  test('different input hashes do not alias, and a mapped candidate is not deleted', async () => {
    const db = createCacheDb();
    db.seedStorage(['alpha', 'beta']);
    assert.equal(
      await finalize(db, {
        candidateStorageId: 'alpha',
        contentHash: 'hash-alpha',
        inputHash: 'bytes-alpha',
        optimizerVersion: ACTIVE,
      }),
      'alpha',
    );
    assert.equal(
      await finalize(db, {
        candidateStorageId: 'beta',
        contentHash: 'hash-beta',
        inputHash: 'bytes-beta',
        optimizerVersion: ACTIVE,
      }),
      'beta',
    );
    assert.equal(db.inputStorage('bytes-alpha', ACTIVE), 'alpha');
    assert.equal(db.inputStorage('bytes-beta', ACTIVE), 'beta');

    const guarded = createCacheDb();
    guarded.seedStorage(['input-canonical', 'output-canonical']);
    guarded.seedInput('input', ACTIVE, 'input-canonical');
    guarded.seedContent('candidate-hash', 'output-canonical');
    assert.equal(
      await finalize(guarded, {
        candidateStorageId: 'output-canonical',
        contentHash: 'candidate-hash',
        inputHash: 'input',
        optimizerVersion: ACTIVE,
      }),
      'input-canonical',
    );
    assert.equal(guarded.hasStorage('output-canonical'), true);
    assert.equal(guarded.hasStorage('input-canonical'), true);
    assert.equal(guarded.contentStorage('candidate-hash'), 'output-canonical');
  });
});

describe('storage orchestration cache', () => {
  const active = ACTIVE;

  test('version mismatch runs before the source is loaded', async () => {
    let loads = 0;
    await assert.rejects(
      () =>
        storeOptimizedSourceImage<string>({
          sourceStorageId: 'raw',
          activeOptimizerVersion: active,
          expectedOptimizerVersion: 'stale-client',
          load: () => {
            loads += 1;
            return Promise.resolve(new Blob([Buffer.from('bytes')]));
          },
          lookup: () => Promise.resolve('cached'),
          optimize: () => Promise.resolve(Buffer.from('out')),
          store: () => Promise.resolve('stored'),
          finalize: () => Promise.resolve('stored'),
          deleteSource: () => Promise.resolve(),
        }),
      (error: unknown) => {
        assert.ok(error instanceof ConvexError);
        assert.equal(error.data.code, STALE_OPTIMIZER_VERSION);
        return true;
      },
    );
    assert.equal(loads, 0);
  });

  test('a live hit skips optimization and deletes only a distinct raw upload', async () => {
    const calls: string[] = [];
    const hit = await storeOptimizedSourceImage<string>({
      sourceStorageId: 'raw',
      activeOptimizerVersion: active,
      load: () => Promise.resolve(new Blob([Buffer.from('same-bytes')])),
      lookup: (query) => {
        calls.push('lookup');
        assert.equal(query.inputHash, sha256Hex(Buffer.from('same-bytes')));
        assert.equal(query.optimizerVersion, active);
        return Promise.resolve('canonical');
      },
      optimize: () => {
        calls.push('optimize');
        return Promise.resolve(Buffer.from('out'));
      },
      store: () => {
        calls.push('store');
        return Promise.resolve('stored');
      },
      finalize: () => {
        calls.push('finalize');
        return Promise.resolve('stored');
      },
      deleteSource: (storageId) => {
        calls.push(`delete:${storageId}`);
        return Promise.resolve();
      },
    });
    assert.equal(hit, 'canonical');
    assert.deepEqual(calls, ['lookup', 'delete:raw']);

    const sameIdCalls: string[] = [];
    const same = await storeOptimizedSourceImage<string>({
      sourceStorageId: 'canonical',
      activeOptimizerVersion: active,
      load: () => Promise.resolve(new Blob([Buffer.from('same-bytes')])),
      lookup: () => Promise.resolve('canonical'),
      optimize: () => {
        sameIdCalls.push('optimize');
        return Promise.resolve(Buffer.from('out'));
      },
      store: () => Promise.resolve('stored'),
      finalize: () => Promise.resolve('stored'),
      deleteSource: () => {
        sameIdCalls.push('delete');
        return Promise.resolve();
      },
    });
    assert.equal(same, 'canonical');
    assert.deepEqual(sameIdCalls, []);
  });

  test('a miss hashes loaded bytes, finalizes them, then deletes the raw upload', async () => {
    const input = Buffer.from('upload-bytes');
    const output = Buffer.from('optimized-bytes');
    const calls: string[] = [];
    let publishedHash = '';
    const result = await storeOptimizedSourceImage<string>({
      sourceStorageId: 'raw',
      activeOptimizerVersion: active,
      expectedOptimizerVersion: active,
      load: () => Promise.resolve(new Blob([input])),
      lookup: (query) => {
        calls.push('lookup');
        assert.equal(query.inputHash, sha256Hex(input));
        assert.notEqual(query.inputHash, 'caller-supplied-hash');
        return Promise.resolve(null);
      },
      optimize: (bytes) => {
        calls.push('optimize');
        assert.equal(bytes.equals(input), true);
        return Promise.resolve(output);
      },
      store: () => {
        calls.push('store');
        return Promise.resolve('candidate');
      },
      finalize: (payload) => {
        calls.push('finalize');
        assert.equal(payload.candidateStorageId, 'candidate');
        assert.equal(payload.contentHash, sha256Hex(output));
        assert.equal(payload.inputHash, sha256Hex(input));
        assert.equal(payload.optimizerVersion, active);
        publishedHash = payload.inputHash ?? '';
        return Promise.resolve('candidate');
      },
      deleteSource: () => {
        calls.push('delete');
        return Promise.resolve();
      },
    });
    assert.equal(result, 'candidate');
    assert.equal(publishedHash, sha256Hex(input));
    assert.deepEqual(calls, [
      'lookup',
      'optimize',
      'store',
      'finalize',
      'delete',
    ]);
  });

  test('optimizer failure and a missing raw upload do not publish or delete', async () => {
    const failedCalls: string[] = [];
    await assert.rejects(
      () =>
        storeOptimizedSourceImage<string>({
          sourceStorageId: 'raw',
          activeOptimizerVersion: active,
          load: () => Promise.resolve(new Blob([Buffer.from('upload')])),
          lookup: () => {
            failedCalls.push('lookup');
            return Promise.resolve(null);
          },
          optimize: () => Promise.reject(new Error('cap exceeded')),
          store: () => {
            failedCalls.push('store');
            return Promise.resolve('stored');
          },
          finalize: () => {
            failedCalls.push('finalize');
            return Promise.resolve('stored');
          },
          deleteSource: () => {
            failedCalls.push('delete');
            return Promise.resolve();
          },
        }),
      /Failed to optimize image: cap exceeded/,
    );
    assert.deepEqual(failedCalls, ['lookup']);

    await assert.rejects(
      () =>
        storeOptimizedSourceImage<string>({
          sourceStorageId: 'missing',
          activeOptimizerVersion: active,
          load: () => Promise.resolve(null),
          lookup: () => Promise.resolve('canonical'),
          optimize: () => Promise.resolve(Buffer.from('out')),
          store: () => Promise.resolve('stored'),
          finalize: () => Promise.resolve('stored'),
          deleteSource: () => Promise.resolve(),
        }),
      /Source image not found in storage/,
    );
  });

  test('finalizer rejection leaves the raw upload, and a later upload hits the published mapping', async () => {
    let published = false;
    await assert.rejects(
      () =>
        storeOptimizedSourceImage<string>({
          sourceStorageId: 'raw-1',
          activeOptimizerVersion: active,
          load: () => Promise.resolve(new Blob([Buffer.from('artwork')])),
          lookup: () => Promise.resolve(null),
          optimize: () => Promise.resolve(Buffer.from('png')),
          store: () => Promise.resolve('candidate'),
          finalize: () =>
            Promise.reject(sourceReuseFailure(STALE_OPTIMIZER_VERSION)),
          deleteSource: () => {
            throw new Error('deleted raw upload');
          },
        }),
      (error: unknown) => {
        assert.ok(error instanceof ConvexError);
        assert.equal(error.data.code, STALE_OPTIMIZER_VERSION);
        return true;
      },
    );

    const calls: string[] = [];
    await assert.rejects(
      () =>
        storeOptimizedSourceImage<string>({
          sourceStorageId: 'raw-1',
          activeOptimizerVersion: active,
          load: () => Promise.resolve(new Blob([Buffer.from('artwork')])),
          lookup: () => Promise.resolve(null),
          optimize: () => Promise.resolve(Buffer.from('png')),
          store: () => Promise.resolve('candidate'),
          finalize: () => {
            published = true;
            return Promise.resolve('canonical');
          },
          deleteSource: () => Promise.reject(new Error('cleanup failed')),
        }),
      /cleanup failed/,
    );
    assert.equal(published, true);

    const retried = await storeOptimizedSourceImage<string>({
      sourceStorageId: 'raw-2',
      activeOptimizerVersion: active,
      load: () => Promise.resolve(new Blob([Buffer.from('artwork')])),
      lookup: (query) => {
        calls.push(query.inputHash);
        return Promise.resolve(published ? 'canonical' : null);
      },
      optimize: () => {
        calls.push('optimize');
        return Promise.resolve(Buffer.from('png'));
      },
      store: () => {
        calls.push('store');
        return Promise.resolve('candidate');
      },
      finalize: () => {
        calls.push('finalize');
        return Promise.resolve('candidate');
      },
      deleteSource: (storageId) => {
        calls.push(`delete:${storageId}`);
        return Promise.resolve();
      },
    });
    assert.equal(retried, 'canonical');
    assert.deepEqual(calls, [
      sha256Hex(Buffer.from('artwork')),
      'delete:raw-2',
    ]);
  });

  test('different loaded bytes cannot share an input mapping', async () => {
    const seen: string[] = [];
    const lookup = (query: { inputHash: string; optimizerVersion: string }) => {
      seen.push(query.inputHash);
      return Promise.resolve(null);
    };
    const run = (bytes: string) =>
      storeOptimizedSourceImage<string>({
        sourceStorageId: `raw-${bytes}`,
        activeOptimizerVersion: active,
        load: () => Promise.resolve(new Blob([Buffer.from(bytes)])),
        lookup,
        optimize: (input) =>
          Promise.resolve(Buffer.from(`out-${input.toString()}`)),
        store: async () => `stored-${bytes}`,
        finalize: (payload) => Promise.resolve(payload.candidateStorageId),
        deleteSource: () => Promise.resolve(),
      });
    assert.equal(await run('one'), 'stored-one');
    assert.equal(await run('two'), 'stored-two');
    assert.equal(seen.length, 2);
    assert.notEqual(seen[0], seen[1]);
    assert.equal(seen[0], sha256Hex(Buffer.from('one')));
    assert.equal(seen[1], sha256Hex(Buffer.from('two')));
  });
});
