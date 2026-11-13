import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { describe, test } from 'node:test';
import { defineSchema, defineTable } from 'convex/server';
import { ConvexError, v } from 'convex/values';
import { convexTest } from 'convex-test';
import { isRetryableSourceReuseError } from '../features/card-export/lib/persist-card-export.ts';
import type { Id } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { SOURCE_OPTIMIZER_VERSION } from './lib/sourceOptimizerVersion.ts';
import {
  createItemExportRecord,
  finalizeCandidateStorageRecords,
  liveCachedStorageId,
  lookupLiveSourceOptimization,
  STALE_OPTIMIZER_VERSION,
  STALE_SOURCE,
  sourceReuseFailure,
  sourceReuseStatus,
} from './lib/sourceReuse.ts';
import { storeOptimizedSourceImage } from './optimizeSourcePng.ts';

const schema = defineSchema({
  storageByContentHash: defineTable({
    contentHash: v.string(),
    storageId: v.id('_storage'),
  }).index('by_contentHash', ['contentHash']),

  sourceOptimizationCache: defineTable({
    inputHash: v.string(),
    optimizerVersion: v.string(),
    storageId: v.id('_storage'),
  }).index('by_inputHash_optimizerVersion', ['inputHash', 'optimizerVersion']),
});

const ACTIVE = SOURCE_OPTIMIZER_VERSION;

const modules: Record<string, () => Promise<unknown>> = {
  './convex/_generated/server.js': () => import('./_generated/server.js'),
};

type TestConvex = ReturnType<typeof convexTest>;

function createTest(): TestConvex {
  return convexTest(schema, modules);
}

function sha256Hex(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

async function storeBlob(
  t: TestConvex,
  label: string,
): Promise<Id<'_storage'>> {
  return t.run(async (ctx) =>
    ctx.storage.store(new Blob([Buffer.from(label)])),
  );
}

async function storageExists(
  t: TestConvex,
  storageId: Id<'_storage'>,
): Promise<boolean> {
  return t.run(
    async (ctx) => (await ctx.db.system.get('_storage', storageId)) !== null,
  );
}

async function seedDeadContentHash(
  t: TestConvex,
  contentHash: string,
): Promise<Id<'_storage'>> {
  return t.run(async (ctx) => {
    const storageId = await ctx.storage.store(new Blob([Buffer.from('dead')]));
    await ctx.db.insert('storageByContentHash', { contentHash, storageId });
    await ctx.storage.delete(storageId);
    return storageId;
  });
}

async function seedDeadInputMapping(
  t: TestConvex,
  inputHash: string,
  optimizerVersion: string,
): Promise<Id<'_storage'>> {
  return t.run(async (ctx) => {
    const storageId = await ctx.storage.store(new Blob([Buffer.from('dead')]));
    await ctx.db.insert('sourceOptimizationCache', {
      inputHash,
      optimizerVersion,
      storageId,
    });
    await ctx.storage.delete(storageId);
    return storageId;
  });
}

async function contentRowStorage(
  t: TestConvex,
  contentHash: string,
): Promise<Id<'_storage'> | undefined> {
  const row = await t.run(async (ctx) => {
    const db = (ctx as unknown as MutationCtx).db;
    return db
      .query('storageByContentHash')
      .withIndex('by_contentHash', (q) => q.eq('contentHash', contentHash))
      .first();
  });
  return row?.storageId;
}

async function inputRowStorage(
  t: TestConvex,
  inputHash: string,
  optimizerVersion: string,
): Promise<Id<'_storage'> | undefined> {
  const row = await t.run(async (ctx) => {
    const db = (ctx as unknown as MutationCtx).db;
    return db
      .query('sourceOptimizationCache')
      .withIndex('by_inputHash_optimizerVersion', (q) =>
        q.eq('inputHash', inputHash).eq('optimizerVersion', optimizerVersion),
      )
      .unique();
  });
  return row?.storageId;
}

async function contentRowCount(t: TestConvex): Promise<number> {
  return t.run(
    async (ctx) =>
      (await ctx.db.query('storageByContentHash').collect()).length,
  );
}

async function inputRowCount(t: TestConvex): Promise<number> {
  return t.run(
    async (ctx) =>
      (await ctx.db.query('sourceOptimizationCache').collect()).length,
  );
}

async function finalize(
  t: TestConvex,
  args: {
    candidateStorageId: Id<'_storage'>;
    contentHash: string;
    inputHash?: string;
    optimizerVersion?: string;
  },
): Promise<Id<'_storage'>> {
  return t.mutation(async (ctx) =>
    finalizeCandidateStorageRecords(ctx as unknown as MutationCtx, args),
  );
}

async function lookup(
  t: TestConvex,
  inputHash: string,
  optimizerVersion: string,
): Promise<Id<'_storage'> | null> {
  return t.query(async (ctx) =>
    lookupLiveSourceOptimization(ctx as unknown as QueryCtx, {
      inputHash,
      optimizerVersion,
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
      isRetryableSourceReuseError(sourceReuseFailure(STALE_OPTIMIZER_VERSION)),
      true,
    );
    assert.equal(
      isRetryableSourceReuseError(sourceReuseFailure(STALE_SOURCE)),
      true,
    );
    assert.equal(
      isRetryableSourceReuseError(new Error('socket hang up')),
      false,
    );
    assert.equal(
      isRetryableSourceReuseError(
        new ConvexError({ code: 'not-a-reuse-error' }),
      ),
      false,
    );
  });
});

describe('durable finalization', () => {
  test('version fence rejects before any cache write or candidate delete', async () => {
    const t = createTest();
    const candidate = await storeBlob(t, 'candidate');
    const kept = await storeBlob(t, 'kept');
    await t.run(async (ctx) => {
      await ctx.db.insert('storageByContentHash', {
        contentHash: 'kept-hash',
        storageId: kept,
      });
    });
    await assert.rejects(
      () =>
        finalize(t, {
          candidateStorageId: candidate,
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
    assert.equal(await storageExists(t, candidate), true);
    assert.equal(await contentRowStorage(t, 'new-hash'), undefined);
    assert.equal(await contentRowStorage(t, 'kept-hash'), kept);
    assert.equal(await inputRowCount(t), 0);
  });

  test('legacy output dedup repairs a dead hash row and keeps a live one', async () => {
    const repaired = createTest();
    const candidate = await storeBlob(repaired, 'candidate');
    await seedDeadContentHash(repaired, 'hash');
    assert.equal(
      await finalize(repaired, {
        candidateStorageId: candidate,
        contentHash: 'hash',
      }),
      candidate,
    );
    assert.equal(await contentRowStorage(repaired, 'hash'), candidate);
    assert.equal(await inputRowCount(repaired), 0);
    assert.equal(await storageExists(repaired, candidate), true);

    const deduped = createTest();
    const loser = await storeBlob(deduped, 'candidate');
    const canonical = await storeBlob(deduped, 'canonical');
    await deduped.run(async (ctx) => {
      await ctx.db.insert('storageByContentHash', {
        contentHash: 'hash',
        storageId: canonical,
      });
    });
    assert.equal(
      await finalize(deduped, {
        candidateStorageId: loser,
        contentHash: 'hash',
      }),
      canonical,
    );
    assert.equal(await storageExists(deduped, loser), false);
    assert.equal(await storageExists(deduped, canonical), true);
    assert.equal(await contentRowStorage(deduped, 'hash'), canonical);

    const same = createTest();
    const only = await storeBlob(same, 'canonical');
    await same.run(async (ctx) => {
      await ctx.db.insert('storageByContentHash', {
        contentHash: 'hash',
        storageId: only,
      });
    });
    assert.equal(
      await finalize(same, {
        candidateStorageId: only,
        contentHash: 'hash',
      }),
      only,
    );
    assert.equal(await storageExists(same, only), true);
  });

  test('stale input and output mappings are replaced by a live candidate', async () => {
    const t = createTest();
    const candidate = await storeBlob(t, 'candidate');
    await seedDeadInputMapping(t, 'input', ACTIVE);
    await seedDeadContentHash(t, 'hash');
    assert.equal(
      await finalize(t, {
        candidateStorageId: candidate,
        contentHash: 'hash',
        inputHash: 'input',
        optimizerVersion: ACTIVE,
      }),
      candidate,
    );
    assert.equal(await inputRowStorage(t, 'input', ACTIVE), candidate);
    assert.equal(await contentRowStorage(t, 'hash'), candidate);
    assert.equal(await storageExists(t, candidate), true);
  });

  test('a missing candidate fails and the rolled-back rows stay until a later repair', async () => {
    const t = createTest();
    const deadInputId = await seedDeadInputMapping(t, 'input', ACTIVE);
    const deadContentId = await seedDeadContentHash(t, 'hash');
    const missing = await t.run(async (ctx) => {
      const ephemeral = await ctx.storage.store(
        new Blob([Buffer.from('gone')]),
      );
      await ctx.storage.delete(ephemeral);
      return ephemeral;
    });
    await assert.rejects(
      () =>
        finalize(t, {
          candidateStorageId: missing,
          contentHash: 'hash',
          inputHash: 'input',
          optimizerVersion: ACTIVE,
        }),
      /Candidate storage not found/,
    );
    assert.equal(await inputRowStorage(t, 'input', ACTIVE), deadInputId);
    assert.equal(await contentRowStorage(t, 'hash'), deadContentId);

    const fresh = await storeBlob(t, 'fresh');
    assert.equal(
      await finalize(t, {
        candidateStorageId: fresh,
        contentHash: 'hash',
        inputHash: 'input',
        optimizerVersion: ACTIVE,
      }),
      fresh,
    );
    assert.equal(await inputRowStorage(t, 'input', ACTIVE), fresh);
    assert.equal(await contentRowStorage(t, 'hash'), fresh);
  });

  test('concurrent different outputs keep the first live input mapping', async () => {
    const t = createTest();
    const outputA = await storeBlob(t, 'output-a');
    const outputB = await storeBlob(t, 'output-b');
    const [first, second] = await Promise.all([
      finalize(t, {
        candidateStorageId: outputA,
        contentHash: 'hash-a',
        inputHash: 'same-input',
        optimizerVersion: ACTIVE,
      }),
      finalize(t, {
        candidateStorageId: outputB,
        contentHash: 'hash-b',
        inputHash: 'same-input',
        optimizerVersion: ACTIVE,
      }),
    ]);
    assert.equal(first, outputA);
    assert.equal(second, outputA);
    assert.equal(await storageExists(t, outputA), true);
    assert.equal(await storageExists(t, outputB), false);
    assert.equal(await contentRowStorage(t, 'hash-a'), outputA);
    assert.equal(await contentRowStorage(t, 'hash-b'), undefined);
    assert.equal(await inputRowStorage(t, 'same-input', ACTIVE), outputA);
    assert.equal(await contentRowCount(t), 1);
    assert.equal(await inputRowCount(t), 1);
  });

  test('different input hashes do not alias, and a mapped candidate is not deleted', async () => {
    const t = createTest();
    const alpha = await storeBlob(t, 'alpha');
    const beta = await storeBlob(t, 'beta');
    assert.equal(
      await finalize(t, {
        candidateStorageId: alpha,
        contentHash: 'hash-alpha',
        inputHash: 'bytes-alpha',
        optimizerVersion: ACTIVE,
      }),
      alpha,
    );
    assert.equal(
      await finalize(t, {
        candidateStorageId: beta,
        contentHash: 'hash-beta',
        inputHash: 'bytes-beta',
        optimizerVersion: ACTIVE,
      }),
      beta,
    );
    assert.equal(await inputRowStorage(t, 'bytes-alpha', ACTIVE), alpha);
    assert.equal(await inputRowStorage(t, 'bytes-beta', ACTIVE), beta);

    const guarded = createTest();
    const inputCanonical = await storeBlob(guarded, 'input-canonical');
    const outputCanonical = await storeBlob(guarded, 'output-canonical');
    await guarded.run(async (ctx) => {
      await ctx.db.insert('sourceOptimizationCache', {
        inputHash: 'input',
        optimizerVersion: ACTIVE,
        storageId: inputCanonical,
      });
      await ctx.db.insert('storageByContentHash', {
        contentHash: 'candidate-hash',
        storageId: outputCanonical,
      });
    });
    assert.equal(
      await finalize(guarded, {
        candidateStorageId: outputCanonical,
        contentHash: 'candidate-hash',
        inputHash: 'input',
        optimizerVersion: ACTIVE,
      }),
      inputCanonical,
    );
    assert.equal(await storageExists(guarded, outputCanonical), true);
    assert.equal(await storageExists(guarded, inputCanonical), true);
    assert.equal(
      await contentRowStorage(guarded, 'candidate-hash'),
      outputCanonical,
    );
  });

  test('lookup returns the id finalize wrote, and a deleted blob yields null', async () => {
    const t = createTest();
    const candidate = await storeBlob(t, 'lookup-candidate');
    const contentHash = 'lookup-hash';
    const inputHash = 'lookup-input';
    const id = await finalize(t, {
      candidateStorageId: candidate,
      contentHash,
      inputHash,
      optimizerVersion: ACTIVE,
    });
    assert.equal(await lookup(t, inputHash, ACTIVE), id);
    await t.run(async (ctx) => {
      await ctx.storage.delete(id);
    });
    assert.equal(await lookup(t, inputHash, ACTIVE), null);
    assert.equal(await inputRowStorage(t, inputHash, ACTIVE), id);
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
