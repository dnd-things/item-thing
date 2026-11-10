import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { ConvexError } from 'convex/values';
import {
  STALE_OPTIMIZER_VERSION,
  STALE_SOURCE,
} from '../../../convex/lib/sourceReuse.ts';
import {
  capturePreviewReuseOwnership,
  isRetryableSourceReuseError,
  type PreviewReuseSlot,
  persistExportWithPreviewReuse,
  releasePreviewReuseSlot,
  syncPreviewReuseSlotOnArtworkChange,
} from './persist-item-export-with-source-reuse.ts';

type Insert = {
  workbenchSnapshot: string;
  exportFormat: 'png' | 'jpg';
  exportPixelRatio: 1 | 2;
  sourceImageStorageId?: string;
  sourceOptimizerVersion?: string;
};

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

function slot(): { current: PreviewReuseSlot } {
  return { current: null };
}

async function flush(): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

describe('browser preview source reuse', () => {
  test('sequential and overlapping identical previews prepare once and insert twice', async () => {
    const holder = slot();
    let prepares = 0;
    let validates = 0;
    const inserted: Insert[] = [];
    const deps = {
      prepare: (dataUrl: string) => {
        prepares += 1;
        assert.equal(dataUrl, 'preview-a');
        return Promise.resolve({
          storageId: 'source-a',
          optimizerVersion: 'v1',
        });
      },
      validate: async () => {
        validates += 1;
        return { optimizerVersion: 'v1', reusable: true };
      },
      insert: async (record: Insert) => {
        inserted.push(record);
      },
    };
    await persistExportWithPreviewReuse(
      holder,
      {
        workbenchSnapshot: 'snap-1',
        sourceImagePreviewDataUrl: 'preview-a',
        exportFormat: 'png',
        exportPixelRatio: 1,
      },
      deps,
    );
    await persistExportWithPreviewReuse(
      holder,
      {
        workbenchSnapshot: 'snap-2',
        sourceImagePreviewDataUrl: 'preview-a',
        exportFormat: 'jpg',
        exportPixelRatio: 2,
      },
      deps,
    );
    assert.equal(prepares, 1);
    assert.equal(validates, 1);
    assert.deepEqual(
      inserted.map((record) => record.workbenchSnapshot),
      ['snap-1', 'snap-2'],
    );
    assert.equal(inserted[1]?.exportFormat, 'jpg');
    assert.equal(inserted[1]?.sourceImageStorageId, 'source-a');

    const overlap = slot();
    const gate = deferred<{ storageId: string; optimizerVersion: string }>();
    let overlapPrepares = 0;
    const overlapInserts: Array<ReturnType<typeof deferred<void>>> = [];
    const overlapDeps = {
      prepare: () => {
        overlapPrepares += 1;
        return gate.promise;
      },
      validate: async () => ({ optimizerVersion: 'v1', reusable: true }),
      insert: () => {
        const pending = deferred<void>();
        overlapInserts.push(pending);
        return pending.promise;
      },
    };
    const first = persistExportWithPreviewReuse(
      overlap,
      {
        workbenchSnapshot: 'left',
        sourceImagePreviewDataUrl: 'preview-a',
        exportFormat: 'png',
        exportPixelRatio: 1,
      },
      overlapDeps,
    );
    const second = persistExportWithPreviewReuse(
      overlap,
      {
        workbenchSnapshot: 'right',
        sourceImagePreviewDataUrl: 'preview-a',
        exportFormat: 'png',
        exportPixelRatio: 1,
      },
      overlapDeps,
    );
    assert.equal(overlapPrepares, 1);
    gate.resolve({ storageId: 'shared', optimizerVersion: 'v1' });
    await flush();
    assert.equal(overlapInserts.length, 2);
    overlapInserts[0]?.resolve();
    overlapInserts[1]?.resolve();
    await Promise.all([first, second]);
  });

  test('empty, distinct, and superseded previews keep one slot', async () => {
    const holder = slot();
    const prepared: string[] = [];
    const inserted: Insert[] = [];
    const gates: Array<{
      dataUrl: string;
      gate: ReturnType<
        typeof deferred<{ storageId: string; optimizerVersion: string }>
      >;
    }> = [];
    const deps = {
      prepare: (dataUrl: string) => {
        prepared.push(dataUrl);
        const gate = deferred<{
          storageId: string;
          optimizerVersion: string;
        }>();
        gates.push({ dataUrl, gate });
        return gate.promise;
      },
      validate: async () => ({ optimizerVersion: 'v', reusable: true }),
      insert: async (record: Insert) => {
        inserted.push(record);
      },
    };

    await persistExportWithPreviewReuse(
      holder,
      {
        workbenchSnapshot: 'empty',
        sourceImagePreviewDataUrl: '   ',
        exportFormat: 'png',
        exportPixelRatio: 1,
      },
      deps,
    );
    assert.deepEqual(prepared, []);
    assert.equal(inserted[0]?.sourceImageStorageId, undefined);
    assert.equal(holder.current === null, true);

    const first = persistExportWithPreviewReuse(
      holder,
      {
        workbenchSnapshot: 'a',
        sourceImagePreviewDataUrl: 'A',
        exportFormat: 'png',
        exportPixelRatio: 1,
      },
      deps,
    );
    const second = persistExportWithPreviewReuse(
      holder,
      {
        workbenchSnapshot: 'b',
        sourceImagePreviewDataUrl: 'B',
        exportFormat: 'jpg',
        exportPixelRatio: 2,
      },
      deps,
    );
    const third = persistExportWithPreviewReuse(
      holder,
      {
        workbenchSnapshot: 'a2',
        sourceImagePreviewDataUrl: 'A',
        exportFormat: 'png',
        exportPixelRatio: 1,
      },
      deps,
    );
    assert.deepEqual(prepared, ['A', 'B', 'A']);
    assert.equal(holder.current?.dataUrl, 'A');
    gates[0]?.gate.resolve({ storageId: 'id-a1', optimizerVersion: 'v' });
    gates[1]?.gate.resolve({ storageId: 'id-b', optimizerVersion: 'v' });
    gates[2]?.gate.resolve({ storageId: 'id-a2', optimizerVersion: 'v' });
    await Promise.all([first, second, third]);
    assert.equal(holder.current?.dataUrl, 'A');
    assert.deepEqual(
      inserted
        .slice(1)
        .map((record) => [
          record.workbenchSnapshot,
          record.sourceImageStorageId,
          record.exportFormat,
        ]),
      [
        ['a', 'id-a1', 'png'],
        ['b', 'id-b', 'jpg'],
        ['a2', 'id-a2', 'png'],
      ],
    );

    const replaced = slot();
    const late = new Map<
      string,
      ReturnType<
        typeof deferred<{
          storageId: string;
          optimizerVersion: string;
        }>
      >
    >();
    const lateDeps = {
      prepare: (dataUrl: string) => {
        const gate = deferred<{
          storageId: string;
          optimizerVersion: string;
        }>();
        late.set(dataUrl, gate);
        return gate.promise;
      },
      validate: async () => ({ optimizerVersion: 'v', reusable: true }),
      insert: async () => undefined,
    };
    const oldExport = persistExportWithPreviewReuse(
      replaced,
      {
        workbenchSnapshot: 'old',
        sourceImagePreviewDataUrl: 'A',
        exportFormat: 'png',
        exportPixelRatio: 1,
      },
      lateDeps,
    );
    const newExport = persistExportWithPreviewReuse(
      replaced,
      {
        workbenchSnapshot: 'new',
        sourceImagePreviewDataUrl: 'B',
        exportFormat: 'png',
        exportPixelRatio: 1,
      },
      lateDeps,
    );
    assert.equal(replaced.current?.dataUrl, 'B');
    late.get('A')?.reject(new Error('old preview failed'));
    late.get('B')?.resolve({ storageId: 'id-b', optimizerVersion: 'v' });
    await assert.rejects(oldExport, /old preview failed/);
    await newExport;
    assert.equal(replaced.current?.dataUrl, 'B');
  });

  test('failures evict only the matching promise, and release drops the slot', async () => {
    const holder = slot();
    let prepares = 0;
    const deps: {
      prepare: () => Promise<{ storageId: string; optimizerVersion: string }>;
      validate: () => Promise<{ optimizerVersion: string; reusable: boolean }>;
      insert: () => Promise<void>;
    } = {
      prepare: () => {
        prepares += 1;
        return Promise.reject(new Error('upload failed'));
      },
      validate: async () => ({ optimizerVersion: 'v', reusable: true }),
      insert: async () => undefined,
    };
    await assert.rejects(
      () =>
        persistExportWithPreviewReuse(
          holder,
          {
            workbenchSnapshot: 'x',
            sourceImagePreviewDataUrl: 'preview',
            exportFormat: 'png',
            exportPixelRatio: 1,
          },
          deps,
        ),
      /upload failed/,
    );
    assert.equal(holder.current === null, true);
    assert.equal(prepares, 1);

    deps.prepare = () => {
      prepares += 1;
      return Promise.resolve({ storageId: 'kept', optimizerVersion: 'v' });
    };
    await persistExportWithPreviewReuse(
      holder,
      {
        workbenchSnapshot: 'y',
        sourceImagePreviewDataUrl: 'preview',
        exportFormat: 'png',
        exportPixelRatio: 1,
      },
      deps,
    );
    assert.equal(prepares, 2);
    releasePreviewReuseSlot(holder);
    assert.equal(holder.current === null, true);
    await persistExportWithPreviewReuse(
      holder,
      {
        workbenchSnapshot: 'z',
        sourceImagePreviewDataUrl: 'preview',
        exportFormat: 'png',
        exportPixelRatio: 1,
      },
      deps,
    );
    assert.equal(prepares, 3);
  });

  test('stale validation and one typed recovery reprepare; network errors do not', async () => {
    const holder = slot();
    let prepares = 0;
    let validates = 0;
    const inserted: string[] = [];
    await persistExportWithPreviewReuse(
      holder,
      {
        workbenchSnapshot: 'first',
        sourceImagePreviewDataUrl: 'preview',
        exportFormat: 'png',
        exportPixelRatio: 1,
      },
      {
        prepare: () => {
          prepares += 1;
          return Promise.resolve({
            storageId: `id-${prepares}`,
            optimizerVersion: 'v1',
          });
        },
        validate: async () => {
          validates += 1;
          return { optimizerVersion: 'v2', reusable: false };
        },
        insert: async (record) => {
          inserted.push(record.sourceImageStorageId ?? '');
        },
      },
    );
    await persistExportWithPreviewReuse(
      holder,
      {
        workbenchSnapshot: 'second',
        sourceImagePreviewDataUrl: 'preview',
        exportFormat: 'png',
        exportPixelRatio: 1,
      },
      {
        prepare: () => {
          prepares += 1;
          return Promise.resolve({
            storageId: `id-${prepares}`,
            optimizerVersion: 'v2',
          });
        },
        validate: async () => {
          validates += 1;
          return { optimizerVersion: 'v2', reusable: true };
        },
        insert: async (record) => {
          inserted.push(record.sourceImageStorageId ?? '');
        },
      },
    );
    assert.equal(prepares, 2);
    assert.equal(validates, 1);
    assert.deepEqual(inserted, ['id-1', 'id-2']);

    const retryHolder = slot();
    let retryPrepares = 0;
    let retryInserts = 0;
    const committed: string[] = [];
    await persistExportWithPreviewReuse(
      retryHolder,
      {
        workbenchSnapshot: 'retry',
        sourceImagePreviewDataUrl: 'preview',
        exportFormat: 'png',
        exportPixelRatio: 1,
      },
      {
        prepare: () => {
          retryPrepares += 1;
          return Promise.resolve({
            storageId: `retry-${retryPrepares}`,
            optimizerVersion: retryPrepares === 1 ? 'old' : 'new',
          });
        },
        validate: async () => ({ optimizerVersion: 'new', reusable: true }),
        insert: async (record) => {
          retryInserts += 1;
          if (retryInserts === 1) {
            throw new ConvexError({ code: STALE_SOURCE });
          }
          committed.push(
            `${record.workbenchSnapshot}:${record.sourceImageStorageId}:${record.sourceOptimizerVersion}`,
          );
        },
      },
    );
    assert.equal(retryPrepares, 2);
    assert.equal(retryInserts, 2);
    assert.deepEqual(committed, ['retry:retry-2:new']);

    const exhausted = slot();
    let exhaustedPrepares = 0;
    let exhaustedInserts = 0;
    await assert.rejects(
      () =>
        persistExportWithPreviewReuse(
          exhausted,
          {
            workbenchSnapshot: 'stop',
            sourceImagePreviewDataUrl: 'preview',
            exportFormat: 'png',
            exportPixelRatio: 1,
          },
          {
            prepare: () => {
              exhaustedPrepares += 1;
              return Promise.reject(
                new ConvexError({ code: STALE_OPTIMIZER_VERSION }),
              );
            },
            validate: async () => ({ optimizerVersion: 'v', reusable: true }),
            insert: async () => {
              exhaustedInserts += 1;
            },
          },
        ),
      (error: unknown) => {
        assert.equal(isRetryableSourceReuseError(error), true);
        return true;
      },
    );
    assert.equal(exhaustedPrepares, 2);
    assert.equal(exhaustedInserts, 0);

    const network = slot();
    let networkPrepares = 0;
    let networkInserts = 0;
    await assert.rejects(
      () =>
        persistExportWithPreviewReuse(
          network,
          {
            workbenchSnapshot: 'lost',
            sourceImagePreviewDataUrl: 'preview',
            exportFormat: 'png',
            exportPixelRatio: 1,
          },
          {
            prepare: () => {
              networkPrepares += 1;
              return Promise.resolve({
                storageId: 'kept',
                optimizerVersion: 'v',
              });
            },
            validate: async () => ({ optimizerVersion: 'v', reusable: true }),
            insert: async () => {
              networkInserts += 1;
              throw new Error('socket hang up');
            },
          },
        ),
      /socket hang up/,
    );
    assert.equal(networkPrepares, 1);
    assert.equal(networkInserts, 1);
    assert.equal(network.current?.dataUrl, 'preview');
    await persistExportWithPreviewReuse(
      network,
      {
        workbenchSnapshot: 'again',
        sourceImagePreviewDataUrl: 'preview',
        exportFormat: 'jpg',
        exportPixelRatio: 2,
      },
      {
        prepare: () => {
          networkPrepares += 1;
          return Promise.resolve({
            storageId: 'should-not',
            optimizerVersion: 'v',
          });
        },
        validate: async () => ({ optimizerVersion: 'v', reusable: true }),
        insert: async (record) => {
          networkInserts += 1;
          assert.equal(record.workbenchSnapshot, 'again');
          assert.equal(record.sourceImageStorageId, 'kept');
          assert.equal(record.exportFormat, 'jpg');
        },
      },
    );
    assert.equal(networkPrepares, 1);
    assert.equal(networkInserts, 2);
  });

  test('concurrent typed insert rejections share one preview recovery', async () => {
    const holder = slot();
    const gates: Array<
      ReturnType<
        typeof deferred<{ storageId: string; optimizerVersion: string }>
      >
    > = [];
    let prepares = 0;
    let staleInserts = 0;
    const bothStale = deferred<void>();
    const rejectStale = deferred<void>();
    const inserted: string[] = [];
    const persist = (snapshot: string, exportFormat: 'png' | 'jpg') =>
      persistExportWithPreviewReuse(
        holder,
        {
          workbenchSnapshot: snapshot,
          sourceImagePreviewDataUrl: 'preview-same',
          exportFormat,
          exportPixelRatio: snapshot === 'left' ? 1 : 2,
        },
        {
          prepare: () => {
            prepares += 1;
            const gate = deferred<{
              storageId: string;
              optimizerVersion: string;
            }>();
            gates.push(gate);
            return gate.promise;
          },
          validate: async (prepared: {
            storageId: string;
            optimizerVersion: string;
          }) => ({
            optimizerVersion: prepared.optimizerVersion,
            reusable: true,
          }),
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
              `${record.workbenchSnapshot}:${record.exportFormat}:${record.exportPixelRatio}:${record.sourceImageStorageId}`,
            );
          },
        },
      );
    const first = persist('left', 'png');
    const second = persist('right', 'jpg');
    assert.equal(prepares, 1);
    gates[0]?.resolve({ storageId: 'initial', optimizerVersion: 'v1' });
    await bothStale.promise;
    assert.equal(prepares, 1);
    assert.equal(staleInserts, 2);
    rejectStale.resolve();
    await flush();
    assert.equal(prepares, 2);
    assert.equal(holder.current?.dataUrl, 'preview-same');
    gates[1]?.resolve({ storageId: 'recovered', optimizerVersion: 'v2' });
    await Promise.all([first, second]);
    assert.equal(prepares, 2);
    assert.deepEqual(inserted, [
      'left:png:1:recovered',
      'right:jpg:2:recovered',
    ]);
    assert.equal(holder.current?.dataUrl, 'preview-same');
  });

  test('a late typed retry does not replace a newer preview', async () => {
    const holder = slot();
    const gates: Array<{
      dataUrl: string;
      gate: ReturnType<
        typeof deferred<{ storageId: string; optimizerVersion: string }>
      >;
    }> = [];
    const aInsert = deferred<void>();
    const aWaiting = deferred<void>();
    let aInserts = 0;
    const inserted: string[] = [];
    const deps = {
      prepare: (dataUrl: string) => {
        const gate = deferred<{
          storageId: string;
          optimizerVersion: string;
        }>();
        gates.push({ dataUrl, gate });
        return gate.promise;
      },
      validate: async () => ({ optimizerVersion: 'v', reusable: true }),
      insert: async (record: Insert) => {
        if (record.workbenchSnapshot === 'A') {
          aInserts += 1;
          if (aInserts === 1) {
            aWaiting.resolve();
            await aInsert.promise;
            throw new ConvexError({ code: STALE_SOURCE });
          }
        }
        inserted.push(
          `${record.workbenchSnapshot}:${record.sourceImageStorageId}`,
        );
      },
    };
    const first = persistExportWithPreviewReuse(
      holder,
      {
        workbenchSnapshot: 'A',
        sourceImagePreviewDataUrl: 'preview-a',
        exportFormat: 'png',
        exportPixelRatio: 1,
      },
      deps,
    );
    gates[0]?.gate.resolve({ storageId: 'a-initial', optimizerVersion: 'v1' });
    await aWaiting.promise;
    const second = persistExportWithPreviewReuse(
      holder,
      {
        workbenchSnapshot: 'B',
        sourceImagePreviewDataUrl: 'preview-b',
        exportFormat: 'jpg',
        exportPixelRatio: 2,
      },
      deps,
    );
    assert.equal(holder.current?.dataUrl, 'preview-b');
    aInsert.resolve();
    await flush();
    assert.deepEqual(
      gates.map((entry) => entry.dataUrl),
      ['preview-a', 'preview-b', 'preview-a'],
    );
    assert.equal(holder.current?.dataUrl, 'preview-b');
    gates[1]?.gate.resolve({ storageId: 'b-id', optimizerVersion: 'v' });
    gates[2]?.gate.resolve({ storageId: 'a-retry', optimizerVersion: 'v2' });
    await Promise.all([first, second]);
    assert.deepEqual(inserted.sort(), ['A:a-retry', 'B:b-id']);
    assert.equal(holder.current?.dataUrl, 'preview-b');
  });

  test('an empty export drops a retained preview data url', async () => {
    const holder = slot();
    const dataUrl = 'data:image/png;base64,RETAINED';
    let prepares = 0;
    const inserted: Insert[] = [];
    const deps = {
      prepare: (preview: string) => {
        prepares += 1;
        assert.equal(preview, dataUrl);
        return Promise.resolve({ storageId: 'id-a', optimizerVersion: 'v' });
      },
      validate: async () => ({ optimizerVersion: 'v', reusable: true }),
      insert: async (record: Insert) => {
        inserted.push(record);
      },
    };
    await persistExportWithPreviewReuse(
      holder,
      {
        workbenchSnapshot: 'resolved-a',
        sourceImagePreviewDataUrl: dataUrl,
        exportFormat: 'png',
        exportPixelRatio: 1,
      },
      deps,
    );
    assert.equal(holder.current?.dataUrl, dataUrl);
    await persistExportWithPreviewReuse(
      holder,
      {
        workbenchSnapshot: 'empty',
        sourceImagePreviewDataUrl: '   ',
        exportFormat: 'jpg',
        exportPixelRatio: 2,
      },
      deps,
    );
    assert.equal(prepares, 1);
    assert.equal(holder.current, null);
    assert.equal(inserted[0]?.sourceImageStorageId, 'id-a');
    assert.equal(inserted[1]?.workbenchSnapshot, 'empty');
    assert.equal(inserted[1]?.sourceImageStorageId, undefined);
    assert.equal(inserted[1]?.exportFormat, 'jpg');
  });

  test('clearing artwork releases the retained preview without another export', async () => {
    const holder = slot();
    const artwork = { current: false };
    const dataUrl = 'data:image/png;base64,CLEARED';
    await persistExportWithPreviewReuse(
      holder,
      {
        workbenchSnapshot: 'kept',
        sourceImagePreviewDataUrl: dataUrl,
        exportFormat: 'png',
        exportPixelRatio: 1,
      },
      {
        prepare: async () => ({ storageId: 'id-a', optimizerVersion: 'v' }),
        validate: async () => ({ optimizerVersion: 'v', reusable: true }),
        insert: async () => undefined,
      },
    );
    assert.equal(holder.current?.dataUrl, dataUrl);
    syncPreviewReuseSlotOnArtworkChange(holder, artwork, dataUrl);
    assert.equal(holder.current?.dataUrl, dataUrl);
    syncPreviewReuseSlotOnArtworkChange(holder, artwork, '');
    assert.equal(holder.current, null);
  });

  test('pending artwork stays uncached after clear and an empty export', async () => {
    const holder = slot();
    const artwork = { current: false };
    const dataUrl = 'data:image/png;base64,PENDING';
    const gate = deferred<{ storageId: string; optimizerVersion: string }>();
    let prepares = 0;
    const inserted: Insert[] = [];
    const deps = {
      prepare: () => {
        prepares += 1;
        return gate.promise;
      },
      validate: async () => ({ optimizerVersion: 'v', reusable: true }),
      insert: async (record: Insert) => {
        inserted.push(record);
      },
    };
    const pending = persistExportWithPreviewReuse(
      holder,
      {
        workbenchSnapshot: 'pending-a',
        sourceImagePreviewDataUrl: dataUrl,
        exportFormat: 'png',
        exportPixelRatio: 1,
      },
      deps,
    );
    syncPreviewReuseSlotOnArtworkChange(holder, artwork, dataUrl);
    assert.equal(holder.current?.dataUrl, dataUrl);
    syncPreviewReuseSlotOnArtworkChange(holder, artwork, '   ');
    assert.equal(holder.current, null);
    await persistExportWithPreviewReuse(
      holder,
      {
        workbenchSnapshot: 'empty',
        sourceImagePreviewDataUrl: '',
        exportFormat: 'png',
        exportPixelRatio: 1,
      },
      deps,
    );
    assert.equal(prepares, 1);
    assert.equal(holder.current, null);
    gate.resolve({ storageId: 'late-a', optimizerVersion: 'v' });
    await pending;
    assert.equal(prepares, 1);
    assert.equal(holder.current, null);
    assert.equal(
      inserted.find((record) => record.workbenchSnapshot === 'empty')
        ?.sourceImageStorageId,
      undefined,
    );
    assert.equal(
      inserted.find((record) => record.workbenchSnapshot === 'pending-a')
        ?.sourceImageStorageId,
      'late-a',
    );
  });

  test('a late typed retry after clear does not repopulate the slot', async () => {
    const holder = slot();
    const artwork = { current: false };
    const dataUrl = 'data:image/png;base64,RETRY';
    const gates: Array<
      ReturnType<
        typeof deferred<{ storageId: string; optimizerVersion: string }>
      >
    > = [];
    let prepares = 0;
    const inserted: Insert[] = [];
    const insertGate = deferred<void>();
    const insertWaiting = deferred<void>();
    const deps = {
      prepare: () => {
        prepares += 1;
        const gate = deferred<{
          storageId: string;
          optimizerVersion: string;
        }>();
        gates.push(gate);
        return gate.promise;
      },
      validate: async () => ({ optimizerVersion: 'v2', reusable: true }),
      insert: async (record: Insert) => {
        if (record.sourceImageStorageId === 'initial') {
          insertWaiting.resolve();
          await insertGate.promise;
          throw new ConvexError({ code: STALE_SOURCE });
        }
        inserted.push(record);
      },
    };
    const pending = persistExportWithPreviewReuse(
      holder,
      {
        workbenchSnapshot: 'retry-a',
        sourceImagePreviewDataUrl: dataUrl,
        exportFormat: 'png',
        exportPixelRatio: 1,
      },
      deps,
    );
    syncPreviewReuseSlotOnArtworkChange(holder, artwork, dataUrl);
    gates[0]?.resolve({ storageId: 'initial', optimizerVersion: 'v1' });
    await insertWaiting.promise;
    syncPreviewReuseSlotOnArtworkChange(holder, artwork, '');
    assert.equal(holder.current, null);
    await persistExportWithPreviewReuse(
      holder,
      {
        workbenchSnapshot: 'empty',
        sourceImagePreviewDataUrl: ' ',
        exportFormat: 'jpg',
        exportPixelRatio: 2,
      },
      deps,
    );
    assert.equal(prepares, 1);
    assert.equal(holder.current, null);
    insertGate.resolve();
    await flush();
    assert.equal(prepares, 2);
    assert.equal(holder.current, null);
    gates[1]?.resolve({ storageId: 'retried', optimizerVersion: 'v2' });
    await pending;
    assert.equal(prepares, 2);
    assert.equal(holder.current, null);
    assert.equal(
      inserted.find((record) => record.workbenchSnapshot === 'empty')
        ?.sourceImageStorageId,
      undefined,
    );
    assert.equal(
      inserted.find((record) => record.workbenchSnapshot === 'retry-a')
        ?.sourceImageStorageId,
      'retried',
    );
  });

  test('ownership captured before clear does not install or evict a later generation', async () => {
    const holder = slot();
    const artwork = { current: false };
    const canonical = 'data:image/jpeg;base64,SAME';
    syncPreviewReuseSlotOnArtworkChange(holder, artwork, 'preview-a');
    const capturedEpoch = capturePreviewReuseOwnership(holder);
    syncPreviewReuseSlotOnArtworkChange(holder, artwork, '');
    syncPreviewReuseSlotOnArtworkChange(holder, artwork, 'preview-a');
    const replacement = persistExportWithPreviewReuse(
      holder,
      {
        workbenchSnapshot: 'B',
        sourceImagePreviewDataUrl: canonical,
        exportFormat: 'jpg',
        exportPixelRatio: 2,
        reuseEpoch: capturePreviewReuseOwnership(holder),
      },
      {
        prepare: () =>
          Promise.resolve({ storageId: 'newer-b', optimizerVersion: 'v' }),
        validate: async () => ({ optimizerVersion: 'v', reusable: true }),
        insert: async () => undefined,
      },
    );
    await replacement;
    assert.equal(holder.current?.dataUrl, canonical);
    const retained = holder.current?.promise;
    let prepares = 0;
    let inserts = 0;
    await persistExportWithPreviewReuse(
      holder,
      {
        workbenchSnapshot: 'A',
        sourceImagePreviewDataUrl: canonical,
        exportFormat: 'png',
        exportPixelRatio: 1,
        reuseEpoch: capturedEpoch,
      },
      {
        prepare: () => {
          prepares += 1;
          return Promise.resolve({
            storageId: `stale-${prepares}`,
            optimizerVersion: prepares === 1 ? 'old' : 'new',
          });
        },
        validate: async () => ({ optimizerVersion: 'new', reusable: true }),
        insert: async () => {
          inserts += 1;
          if (inserts === 1) {
            throw new ConvexError({ code: STALE_SOURCE });
          }
        },
      },
    );
    assert.equal(prepares, 2);
    assert.equal(inserts, 2);
    assert.equal(holder.current?.dataUrl, canonical);
    assert.equal(holder.current?.promise, retained);
    assert.equal((await retained)?.storageId, 'newer-b');

    const reused = slot();
    let reusePrepares = 0;
    const firstEpoch = capturePreviewReuseOwnership(reused);
    await persistExportWithPreviewReuse(
      reused,
      {
        workbenchSnapshot: 'first',
        sourceImagePreviewDataUrl: canonical,
        exportFormat: 'png',
        exportPixelRatio: 1,
        reuseEpoch: firstEpoch,
      },
      {
        prepare: () => {
          reusePrepares += 1;
          return Promise.resolve({ storageId: 'kept', optimizerVersion: 'v' });
        },
        validate: async () => ({ optimizerVersion: 'v', reusable: true }),
        insert: async () => undefined,
      },
    );
    await persistExportWithPreviewReuse(
      reused,
      {
        workbenchSnapshot: 'second',
        sourceImagePreviewDataUrl: canonical,
        exportFormat: 'jpg',
        exportPixelRatio: 2,
        reuseEpoch: capturePreviewReuseOwnership(reused),
      },
      {
        prepare: () => {
          reusePrepares += 1;
          return Promise.resolve({
            storageId: 'should-not',
            optimizerVersion: 'v',
          });
        },
        validate: async () => ({ optimizerVersion: 'v', reusable: true }),
        insert: async () => undefined,
      },
    );
    assert.equal(reusePrepares, 1);
    assert.equal(reused.current?.dataUrl, canonical);

    const emptied = slot();
    const emptiedArtwork = { current: false };
    const earlyEpoch = capturePreviewReuseOwnership(emptied);
    syncPreviewReuseSlotOnArtworkChange(emptied, emptiedArtwork, 'preview-a');
    syncPreviewReuseSlotOnArtworkChange(emptied, emptiedArtwork, '');
    syncPreviewReuseSlotOnArtworkChange(emptied, emptiedArtwork, 'preview-b');
    await persistExportWithPreviewReuse(
      emptied,
      {
        workbenchSnapshot: 'kept-b',
        sourceImagePreviewDataUrl: canonical,
        exportFormat: 'png',
        exportPixelRatio: 1,
        reuseEpoch: capturePreviewReuseOwnership(emptied),
      },
      {
        prepare: async () => ({ storageId: 'live-b', optimizerVersion: 'v' }),
        validate: async () => ({ optimizerVersion: 'v', reusable: true }),
        insert: async () => undefined,
      },
    );
    const live = emptied.current;
    await persistExportWithPreviewReuse(
      emptied,
      {
        workbenchSnapshot: 'stale-empty',
        sourceImagePreviewDataUrl: ' ',
        exportFormat: 'jpg',
        exportPixelRatio: 1,
        reuseEpoch: earlyEpoch,
      },
      {
        prepare: async () => {
          throw new Error('stale empty export should not prepare');
        },
        validate: async () => ({ optimizerVersion: 'v', reusable: true }),
        insert: async (record) => {
          assert.equal(record.sourceImageStorageId, undefined);
        },
      },
    );
    assert.equal(emptied.current, live);
  });
});
