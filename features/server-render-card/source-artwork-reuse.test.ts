import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { describe, test } from 'node:test';
import { ConvexError } from 'convex/values';
import {
  STALE_OPTIMIZER_VERSION,
  STALE_SOURCE,
} from '../../convex/lib/sourceReuse.ts';
import {
  createSourceArtworkReuseCache,
  hashSourceArtwork,
  persistArtworkExport,
  SOURCE_ARTWORK_REUSE_MAX_ENTRIES,
  SOURCE_ARTWORK_REUSE_TTL_MS,
  type SourceArtworkReuseCache,
  sourceArtworkCacheKey,
} from './source-artwork-reuse.ts';

function deferred<T>() {
  let resolve: (value: T) => void = () => {
    throw new Error('deferred resolve was not installed');
  };
  let reject: (error: unknown) => void = () => {
    throw new Error('deferred reject was not installed');
  };
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function flush(): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

function exportArgs(args: {
  cache: SourceArtworkReuseCache;
  convexUrl?: string;
  sourceBytes: Buffer;
  snapshot: string;
  exportFormat?: 'png' | 'jpg';
  exportPixelRatio?: 1 | 2;
  prepare: () => Promise<{ storageId: string; optimizerVersion: string }>;
  validate?: (prepared: {
    storageId: string;
    optimizerVersion: string;
  }) => Promise<{ optimizerVersion: string; reusable: boolean }>;
  insert: (record: {
    snapshot: string;
    exportFormat: 'png' | 'jpg';
    exportPixelRatio: 1 | 2;
    sourceImageStorageId: string;
    sourceOptimizerVersion: string;
  }) => Promise<void>;
}) {
  return {
    cache: args.cache,
    convexUrl: args.convexUrl ?? 'https://convex.example',
    sourceBytes: args.sourceBytes,
    snapshot: args.snapshot,
    exportFormat: args.exportFormat ?? 'png',
    exportPixelRatio: args.exportPixelRatio ?? 1,
    prepare: args.prepare,
    validate:
      args.validate ??
      (async () => ({ optimizerVersion: 'v1', reusable: true })),
    insert: args.insert,
  };
}

describe('api source artwork reuse', () => {
  test('hashes actual bytes and ignores deployment-separated callers', () => {
    const bytes = Buffer.from('artwork');
    assert.equal(
      hashSourceArtwork(bytes),
      createHash('sha256').update(bytes).digest('hex'),
    );
    assert.notEqual(
      hashSourceArtwork(bytes),
      hashSourceArtwork(Buffer.from('artwork-2')),
    );
    assert.notEqual(
      sourceArtworkCacheKey('https://a.example', hashSourceArtwork(bytes)),
      sourceArtworkCacheKey('https://b.example', hashSourceArtwork(bytes)),
    );
  });

  test('warm and concurrent calls share preparation and insert independently', async () => {
    const cache = createSourceArtworkReuseCache();
    const bytes = Buffer.from('same-artwork');
    let prepares = 0;
    let validates = 0;
    const inserted: string[] = [];
    const run = (snapshot: string, format: 'png' | 'jpg') =>
      persistArtworkExport(
        exportArgs({
          cache,
          sourceBytes: bytes,
          snapshot,
          exportFormat: format,
          prepare: async () => {
            prepares += 1;
            return { storageId: 'source', optimizerVersion: 'v1' };
          },
          validate: async () => {
            validates += 1;
            return { optimizerVersion: 'v1', reusable: true };
          },
          insert: async (record) => {
            inserted.push(
              `${record.snapshot}:${record.exportFormat}:${record.sourceImageStorageId}`,
            );
          },
        }),
      );
    await run('snap-1', 'png');
    await run('snap-2', 'jpg');
    assert.equal(prepares, 1);
    assert.equal(validates, 1);
    assert.deepEqual(inserted, ['snap-1:png:source', 'snap-2:jpg:source']);
    assert.equal(
      JSON.stringify(cache.snapshot()).includes('same-artwork'),
      false,
    );
    assert.deepEqual(cache.snapshot(), [
      {
        key: sourceArtworkCacheKey(
          'https://convex.example',
          hashSourceArtwork(bytes),
        ),
        kind: 'resolved',
        storageId: 'source',
        optimizerVersion: 'v1',
      },
    ]);

    const overlap = createSourceArtworkReuseCache();
    const gate = deferred<{ storageId: string; optimizerVersion: string }>();
    let overlapPrepares = 0;
    const overlapInserts: Array<ReturnType<typeof deferred<void>>> = [];
    const start = (snapshot: string) =>
      persistArtworkExport(
        exportArgs({
          cache: overlap,
          sourceBytes: bytes,
          snapshot,
          prepare: () => {
            overlapPrepares += 1;
            return gate.promise;
          },
          insert: () => {
            const pending = deferred<void>();
            overlapInserts.push(pending);
            return pending.promise;
          },
        }),
      );
    const first = start('left');
    const second = start('right');
    assert.equal(overlapPrepares, 1);
    gate.resolve({ storageId: 'shared', optimizerVersion: 'v1' });
    await flush();
    assert.equal(overlapInserts.length, 2);
    overlapInserts[0]?.resolve();
    overlapInserts[1]?.resolve();
    await Promise.all([first, second]);
  });

  test('bytes, deployment, version, expiry, and failure do not reuse incorrectly', async () => {
    let time = 0;
    const cache = createSourceArtworkReuseCache({ now: () => time });
    const prepares: string[] = [];
    const run = (sourceBytes: Buffer, convexUrl: string, version = 'v1') =>
      persistArtworkExport(
        exportArgs({
          cache,
          convexUrl,
          sourceBytes,
          snapshot: sourceBytes.toString(),
          prepare: async () => {
            prepares.push(`${convexUrl}:${sourceBytes.toString()}:${version}`);
            return {
              storageId: prepares.at(-1) ?? '',
              optimizerVersion: version,
            };
          },
          validate: async (prepared) => ({
            optimizerVersion: prepared.optimizerVersion,
            reusable: prepared.optimizerVersion === 'v1',
          }),
          insert: async () => undefined,
        }),
      );

    await run(Buffer.from('alpha'), 'https://a.example');
    await run(Buffer.from('alpha'), 'https://a.example');
    await run(Buffer.from('beta'), 'https://a.example');
    await run(Buffer.from('alpha'), 'https://b.example');
    assert.deepEqual(prepares, [
      'https://a.example:alpha:v1',
      'https://a.example:beta:v1',
      'https://b.example:alpha:v1',
    ]);

    time = SOURCE_ARTWORK_REUSE_TTL_MS - 1;
    await run(Buffer.from('alpha'), 'https://a.example');
    assert.equal(prepares.length, 3);
    time = SOURCE_ARTWORK_REUSE_TTL_MS;
    await run(Buffer.from('alpha'), 'https://a.example');
    assert.equal(prepares.length, 4);

    const stale = createSourceArtworkReuseCache();
    let stalePrepares = 0;
    const persistStale = () =>
      persistArtworkExport(
        exportArgs({
          cache: stale,
          sourceBytes: Buffer.from('alpha'),
          snapshot: 'card',
          prepare: async () => {
            stalePrepares += 1;
            return {
              storageId: `id-${stalePrepares}`,
              optimizerVersion: stalePrepares === 1 ? 'v1' : 'v2',
            };
          },
          validate: async () => ({ optimizerVersion: 'v2', reusable: false }),
          insert: async () => undefined,
        }),
      );
    await persistStale();
    await persistStale();
    assert.equal(stalePrepares, 2);

    const failing = createSourceArtworkReuseCache();
    let failures = 0;
    await assert.rejects(
      () =>
        persistArtworkExport(
          exportArgs({
            cache: failing,
            sourceBytes: Buffer.from('alpha'),
            snapshot: 'card',
            prepare: async () => {
              failures += 1;
              throw new Error('optimize failed');
            },
            insert: async () => undefined,
          }),
        ),
      /optimize failed/,
    );
    assert.deepEqual(failing.snapshot(), []);
    await persistArtworkExport(
      exportArgs({
        cache: failing,
        sourceBytes: Buffer.from('alpha'),
        snapshot: 'card',
        prepare: async () => {
          failures += 1;
          return { storageId: 'recovered', optimizerVersion: 'v1' };
        },
        insert: async () => undefined,
      }),
    );
    assert.equal(failures, 2);
    assert.equal(failing.snapshot()[0]?.kind, 'resolved');
  });

  test('capacity keeps pending work and evicts the least recent resolved entry', async () => {
    let time = 0;
    const cache = createSourceArtworkReuseCache({ now: () => time });
    const prepared = new Set<string>();
    const remember = async (label: string) => {
      await persistArtworkExport(
        exportArgs({
          cache,
          sourceBytes: Buffer.from(label),
          snapshot: label,
          prepare: async () => {
            prepared.add(label);
            return { storageId: label, optimizerVersion: 'v1' };
          },
          insert: async () => undefined,
        }),
      );
      time += 1;
    };
    for (let index = 0; index < SOURCE_ARTWORK_REUSE_MAX_ENTRIES; index += 1) {
      await remember(`img-${index}`);
    }
    time = 1_000;
    await persistArtworkExport(
      exportArgs({
        cache,
        sourceBytes: Buffer.from('img-0'),
        snapshot: 'touch',
        prepare: async () => {
          throw new Error('recent entry was evicted');
        },
        insert: async () => undefined,
      }),
    );
    await remember('img-new');
    assert.equal(prepared.has('img-1'), true);
    prepared.delete('img-1');
    await remember('img-1');
    assert.equal(prepared.has('img-1'), true);
    await persistArtworkExport(
      exportArgs({
        cache,
        sourceBytes: Buffer.from('img-0'),
        snapshot: 'still-warm',
        prepare: async () => {
          throw new Error('touched entry was evicted');
        },
        insert: async () => undefined,
      }),
    );
    assert.equal(cache.snapshot().length, SOURCE_ARTWORK_REUSE_MAX_ENTRIES);

    const pendingCache = createSourceArtworkReuseCache();
    const gates: Array<
      ReturnType<
        typeof deferred<{
          storageId: string;
          optimizerVersion: string;
        }>
      >
    > = [];
    let pendingPrepares = 0;
    const jobs = [];
    for (let index = 0; index < SOURCE_ARTWORK_REUSE_MAX_ENTRIES; index += 1) {
      jobs.push(
        persistArtworkExport(
          exportArgs({
            cache: pendingCache,
            sourceBytes: Buffer.from(`pending-${index}`),
            snapshot: `pending-${index}`,
            prepare: () => {
              pendingPrepares += 1;
              const gate = deferred<{
                storageId: string;
                optimizerVersion: string;
              }>();
              gates.push(gate);
              return gate.promise;
            },
            insert: async () => undefined,
          }),
        ),
      );
    }
    const extra = persistArtworkExport(
      exportArgs({
        cache: pendingCache,
        sourceBytes: Buffer.from('extra'),
        snapshot: 'extra',
        prepare: async () => {
          pendingPrepares += 1;
          return { storageId: 'extra', optimizerVersion: 'v1' };
        },
        insert: async () => undefined,
      }),
    );
    const extraKey = sourceArtworkCacheKey(
      'https://convex.example',
      hashSourceArtwork(Buffer.from('extra')),
    );
    assert.equal(pendingPrepares, SOURCE_ARTWORK_REUSE_MAX_ENTRIES + 1);
    assert.equal(
      pendingCache.snapshot().length,
      SOURCE_ARTWORK_REUSE_MAX_ENTRIES,
    );
    assert.equal(
      pendingCache.snapshot().every((entry) => entry.kind === 'pending'),
      true,
    );
    assert.equal(
      pendingCache.snapshot().some((entry) => entry.key === extraKey),
      false,
    );
    await extra;
    assert.equal(
      pendingCache.snapshot().length,
      SOURCE_ARTWORK_REUSE_MAX_ENTRIES,
    );
    for (const gate of gates) {
      gate.resolve({ storageId: 'pending', optimizerVersion: 'v1' });
    }
    await Promise.all(jobs);
    const extraAgain = persistArtworkExport(
      exportArgs({
        cache: pendingCache,
        sourceBytes: Buffer.from('extra'),
        snapshot: 'extra-again',
        prepare: async () => {
          pendingPrepares += 1;
          return { storageId: 'extra-2', optimizerVersion: 'v1' };
        },
        insert: async () => undefined,
      }),
    );
    await extraAgain;
    assert.equal(pendingPrepares, SOURCE_ARTWORK_REUSE_MAX_ENTRIES + 2);
  });

  test('typed recovery runs once, and a late result cannot replace a newer entry', async () => {
    const versionCache = createSourceArtworkReuseCache();
    let versionPrepares = 0;
    await persistArtworkExport(
      exportArgs({
        cache: versionCache,
        sourceBytes: Buffer.from('artwork'),
        snapshot: 'card',
        prepare: async () => {
          versionPrepares += 1;
          if (versionPrepares === 1) {
            throw new ConvexError({ code: STALE_OPTIMIZER_VERSION });
          }
          return { storageId: 'fresh', optimizerVersion: 'v2' };
        },
        insert: async (record) => {
          assert.equal(record.sourceOptimizerVersion, 'v2');
        },
      }),
    );
    assert.equal(versionPrepares, 2);

    const insertCache = createSourceArtworkReuseCache();
    let insertPrepares = 0;
    let inserts = 0;
    await persistArtworkExport(
      exportArgs({
        cache: insertCache,
        sourceBytes: Buffer.from('artwork'),
        snapshot: 'card',
        prepare: async () => {
          insertPrepares += 1;
          return {
            storageId: `id-${insertPrepares}`,
            optimizerVersion: insertPrepares === 1 ? 'v1' : 'v2',
          };
        },
        insert: async (record) => {
          inserts += 1;
          if (inserts === 1) {
            throw new ConvexError({ code: STALE_SOURCE });
          }
          assert.equal(record.sourceImageStorageId, 'id-2');
          assert.equal(record.sourceOptimizerVersion, 'v2');
        },
      }),
    );
    assert.equal(insertPrepares, 2);
    assert.equal(inserts, 2);

    const network = createSourceArtworkReuseCache();
    let networkPrepares = 0;
    await assert.rejects(
      () =>
        persistArtworkExport(
          exportArgs({
            cache: network,
            sourceBytes: Buffer.from('artwork'),
            snapshot: 'lost',
            prepare: async () => {
              networkPrepares += 1;
              return { storageId: 'kept', optimizerVersion: 'v1' };
            },
            insert: async () => {
              throw new Error('socket hang up');
            },
          }),
        ),
      /socket hang up/,
    );
    await persistArtworkExport(
      exportArgs({
        cache: network,
        sourceBytes: Buffer.from('artwork'),
        snapshot: 'again',
        prepare: async () => {
          networkPrepares += 1;
          return { storageId: 'should-not', optimizerVersion: 'v1' };
        },
        insert: async (record) => {
          assert.equal(record.sourceImageStorageId, 'kept');
          assert.equal(record.snapshot, 'again');
        },
      }),
    );
    assert.equal(networkPrepares, 1);

    const raced = createSourceArtworkReuseCache();
    const key = sourceArtworkCacheKey(
      'https://convex.example',
      hashSourceArtwork(Buffer.from('artwork')),
    );
    const firstGate = deferred<{
      storageId: string;
      optimizerVersion: string;
    }>();
    const first = raced.prepare(key, () => firstGate.promise);
    raced.invalidate(key);
    const second = raced.prepare(key, async () => ({
      storageId: 'new',
      optimizerVersion: 'v2',
    }));
    firstGate.resolve({ storageId: 'old', optimizerVersion: 'v1' });
    assert.equal((await first).storageId, 'old');
    assert.equal((await second).storageId, 'new');
    assert.equal(
      (
        await raced.prepare(key, async () => ({
          storageId: 'newer',
          optimizerVersion: 'v3',
        }))
      ).storageId,
      'new',
    );
  });

  test('concurrent stale validations share one recovery preparation', async () => {
    const cache = createSourceArtworkReuseCache();
    const bytes = Buffer.from('stale-artwork');
    await persistArtworkExport(
      exportArgs({
        cache,
        sourceBytes: bytes,
        snapshot: 'seed',
        prepare: async () => ({
          storageId: 'stale-id',
          optimizerVersion: 'v1',
        }),
        insert: async () => undefined,
      }),
    );
    const validation = deferred<{
      optimizerVersion: string;
      reusable: boolean;
    }>();
    const recovery = deferred<{
      storageId: string;
      optimizerVersion: string;
    }>();
    let validations = 0;
    let recoveryPrepares = 0;
    const inserted: string[] = [];
    const start = (snapshot: string, exportFormat: 'png' | 'jpg') =>
      persistArtworkExport(
        exportArgs({
          cache,
          sourceBytes: bytes,
          snapshot,
          exportFormat,
          prepare: () => {
            recoveryPrepares += 1;
            return recovery.promise;
          },
          validate: () => {
            validations += 1;
            return validation.promise;
          },
          insert: async (record) => {
            inserted.push(
              `${record.snapshot}:${record.exportFormat}:${record.sourceImageStorageId}`,
            );
          },
        }),
      );
    const first = start('left', 'png');
    const second = start('right', 'jpg');
    await flush();
    assert.equal(validations, 2);
    assert.equal(recoveryPrepares, 0);
    validation.resolve({ optimizerVersion: 'v2', reusable: false });
    await flush();
    assert.equal(recoveryPrepares, 1);
    assert.equal(cache.snapshot().length, 1);
    assert.equal(cache.snapshot()[0]?.kind, 'pending');
    recovery.resolve({ storageId: 'recovered', optimizerVersion: 'v2' });
    await Promise.all([first, second]);
    assert.equal(recoveryPrepares, 1);
    assert.deepEqual(inserted, ['left:png:recovered', 'right:jpg:recovered']);
    assert.equal(cache.snapshot()[0]?.kind, 'resolved');
  });

  test('concurrent typed insert rejections share one recovery preparation', async () => {
    const cache = createSourceArtworkReuseCache();
    const bytes = Buffer.from('insert-artwork');
    const initial = deferred<{
      storageId: string;
      optimizerVersion: string;
    }>();
    const recovery = deferred<{
      storageId: string;
      optimizerVersion: string;
    }>();
    let prepares = 0;
    let staleInserts = 0;
    const bothStale = deferred<void>();
    const rejectStale = deferred<void>();
    const inserted: string[] = [];
    const start = (snapshot: string, exportFormat: 'png' | 'jpg') =>
      persistArtworkExport(
        exportArgs({
          cache,
          sourceBytes: bytes,
          snapshot,
          exportFormat,
          prepare: () => {
            prepares += 1;
            return prepares === 1 ? initial.promise : recovery.promise;
          },
          insert: async (record) => {
            if (record.sourceOptimizerVersion === 'v1') {
              staleInserts += 1;
              if (staleInserts === 2) {
                bothStale.resolve();
              }
              await rejectStale.promise;
              throw new ConvexError({ code: STALE_SOURCE });
            }
            inserted.push(
              `${record.snapshot}:${record.exportFormat}:${record.exportPixelRatio}:${record.sourceImageStorageId}`,
            );
          },
        }),
      );
    const first = start('left', 'png');
    const second = start('right', 'jpg');
    assert.equal(prepares, 1);
    initial.resolve({ storageId: 'initial', optimizerVersion: 'v1' });
    await bothStale.promise;
    assert.equal(prepares, 1);
    assert.equal(staleInserts, 2);
    rejectStale.resolve();
    await flush();
    assert.equal(prepares, 2);
    assert.equal(cache.snapshot()[0]?.kind, 'pending');
    recovery.resolve({ storageId: 'recovered', optimizerVersion: 'v2' });
    await Promise.all([first, second]);
    assert.equal(prepares, 2);
    assert.deepEqual(inserted, [
      'left:png:1:recovered',
      'right:jpg:1:recovered',
    ]);
  });
});
