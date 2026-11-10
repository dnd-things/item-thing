import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { createFormControl } from 'react-hook-form';
import type {
  WorkbenchArtworkStore,
  WorkbenchCommitInput,
  WorkbenchLoadResult,
  WorkbenchStoreReason,
} from './workbench-artwork-store.ts';
import { bindWorkbenchFormAutosave } from './workbench-form-autosave.ts';
import { workbenchItemDetailsSchema } from './workbench-form-schema.ts';
import {
  defaultMagicItemWorkbenchState,
  type MagicItemWorkbenchState,
} from './workbench-options.ts';
import {
  encodeWorkbenchEnvelopeV7,
  fileFromImageBytes,
  previewDataUrlToBlob,
} from './workbench-persistence.ts';
import {
  createWorkbenchPersistenceSession,
  type WorkbenchClock,
  type WorkbenchHydration,
  workbenchPersistenceCopy,
} from './workbench-persistence-session.ts';
import { toWorkbenchSnapshotForExport } from './workbench-snapshot-for-export.ts';

const pngBytes = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3, 4]);
const otherBytes = Uint8Array.from([
  137, 80, 78, 71, 13, 10, 26, 10, 9, 8, 7, 6,
]);

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

function imageFile(bytes: Uint8Array, name: string): File {
  return fileFromImageBytes(bytes, name, 'image/png');
}

function stateWith(
  patch: Partial<MagicItemWorkbenchState>,
): MagicItemWorkbenchState {
  return {
    ...defaultMagicItemWorkbenchState,
    cardWidthAuto: false,
    cardWidthPx: 432,
    itemName: 'Sunblade',
    classificationAndRarity: 'Weapon, rare',
    requiresAttunement: true,
    flavorDescription: 'Warm.',
    mechanicalDescription: 'Deals damage.',
    imageFileName: 'sword.png',
    ...patch,
  };
}

async function flush(): Promise<void> {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
  }
}

function manualClock(): {
  clock: WorkbenchClock;
  advance: (delayMs: number) => void;
} {
  let now = 0;
  const timers: Array<{
    at: number;
    callback: () => void;
    cancelled: boolean;
  }> = [];
  return {
    clock: {
      setTimeout(callback, delayMs) {
        const timer = { at: now + delayMs, callback, cancelled: false };
        timers.push(timer);
        return {
          cancel() {
            timer.cancelled = true;
          },
        };
      },
    },
    advance(delayMs) {
      now += delayMs;
      const due = timers.filter((timer) => !timer.cancelled && timer.at <= now);
      for (const timer of due) {
        timer.cancelled = true;
        timer.callback();
      }
    },
  };
}

function memoryStore() {
  let json: string | null = null;
  const blobs = new Map<string, Blob>();
  let gate: Promise<void> = Promise.resolve();
  let commitGate: Promise<void> = Promise.resolve();
  let loadFailure: WorkbenchStoreReason | null = null;
  let commitFailure: WorkbenchStoreReason | null = null;
  let active: { aborted: boolean } | null = null;
  const calls = {
    load: 0,
    metadata: 0,
    replace: 0,
    blobPuts: 0,
    aborts: 0,
    closes: 0,
  };
  const store: WorkbenchArtworkStore = {
    async load(): Promise<WorkbenchLoadResult> {
      calls.load += 1;
      await gate;
      if (loadFailure) {
        return { ok: false, reason: loadFailure };
      }
      if (json === null) {
        return { ok: true, record: null };
      }
      const parsed = JSON.parse(json) as { assetKey?: unknown };
      const assetKey = parsed.assetKey;
      const blob =
        typeof assetKey === 'string' ? (blobs.get(assetKey) ?? null) : null;
      return { ok: true, record: { json, blob } };
    },
    async commit(input: WorkbenchCommitInput) {
      if (input.kind === 'metadata') {
        calls.metadata += 1;
      } else {
        calls.replace += 1;
      }
      const token = { aborted: false };
      active = token;
      await gate;
      await commitGate;
      if (token.aborted) {
        return { ok: false as const, reason: 'aborted' as const };
      }
      if (commitFailure) {
        return { ok: false as const, reason: commitFailure };
      }
      if (input.kind === 'metadata') {
        if (input.assetKey !== null && !blobs.has(input.assetKey)) {
          return { ok: false as const, reason: 'conflict' as const };
        }
        json = input.json;
        return { ok: true as const };
      }
      const next = new Map(blobs);
      if (input.newBlob && input.assetKey) {
        next.set(input.assetKey, input.newBlob);
        calls.blobPuts += 1;
      }
      if (input.previousAssetKey && input.previousAssetKey !== input.assetKey) {
        next.delete(input.previousAssetKey);
      }
      blobs.clear();
      for (const [key, blob] of next) {
        blobs.set(key, blob);
      }
      json = input.json;
      return { ok: true as const };
    },
    abortActive() {
      calls.aborts += 1;
      if (active) {
        active.aborted = true;
      }
    },
    close() {
      calls.closes += 1;
    },
  };
  return {
    store,
    calls,
    blobs,
    hold() {
      let release: () => void = () => undefined;
      gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      return () => {
        gate = Promise.resolve();
        release();
      };
    },
    holdCommit() {
      let release: () => void = () => undefined;
      commitGate = new Promise<void>((resolve) => {
        release = resolve;
      });
      return () => {
        commitGate = Promise.resolve();
        release();
      };
    },
    failLoad(reason: WorkbenchStoreReason | null) {
      loadFailure = reason;
    },
    failCommit(reason: WorkbenchStoreReason | null) {
      commitFailure = reason;
    },
    record() {
      return { json, blobs };
    },
    seed(nextJson: string, seeded?: Array<[string, Blob]>) {
      json = nextJson;
      blobs.clear();
      for (const [key, blob] of seeded ?? []) {
        blobs.set(key, blob);
      }
    },
  };
}

function harness(options?: {
  raw?: string | null;
  decode?: (dataUrl: string) => boolean;
  failConvert?: boolean;
}) {
  const backing = memoryStore();
  const legacy = {
    raw: options?.raw ?? null,
    reads: 0,
    removed: [] as string[],
    throwOnRead: false,
    throwOnRemove: false,
  };
  const warnings: string[] = [];
  const converts: string[] = [];
  const decodes: string[] = [];
  const convertGate: Promise<void> = Promise.resolve();
  let rejectConvert = false;
  let manualConverts = false;
  const queuedConverts: Array<{
    dataUrl: string;
    resolve: (blob: Blob) => void;
    reject: (error: Error) => void;
  }> = [];
  const clock = manualClock();
  let assetCount = 0;
  const applied: WorkbenchHydration[] = [];
  const session = createWorkbenchPersistenceSession({
    store: backing.store,
    legacy: {
      read() {
        legacy.reads += 1;
        if (legacy.throwOnRead) {
          throw new Error('legacy denied');
        }
        return legacy.raw;
      },
      removeIfUnchanged(captured) {
        if (legacy.throwOnRemove) {
          throw new Error('cleanup failed');
        }
        if (legacy.raw === captured) {
          legacy.removed.push(captured);
          legacy.raw = null;
        }
      },
    },
    async convertPreviewToBlob(dataUrl) {
      converts.push(dataUrl);
      if (manualConverts) {
        return await new Promise<Blob>((resolve, reject) => {
          queuedConverts.push({ dataUrl, resolve, reject });
        });
      }
      await convertGate;
      if (rejectConvert || options?.failConvert) {
        throw new Error('convert failed');
      }
      return previewDataUrlToBlob(dataUrl);
    },
    async blobToDataUrl(blob) {
      const bytes = new Uint8Array(await blob.arrayBuffer());
      return dataUrlFrom(bytes, blob.type || 'image/png');
    },
    async decodeImageDataUrl(dataUrl) {
      decodes.push(dataUrl);
      return options?.decode?.(dataUrl) ?? true;
    },
    clock: clock.clock,
    createAssetKey() {
      assetCount += 1;
      return `asset-${assetCount}`;
    },
    warn(message) {
      warnings.push(message);
    },
  });
  session.subscribe(() => {
    const hydration = session.takeHydration();
    if (hydration) {
      applied.push(hydration);
    }
  });
  return {
    session,
    backing,
    legacy,
    warnings,
    converts,
    decodes,
    clock,
    applied,
    holdConvert() {
      manualConverts = true;
      return (failed = false) => {
        manualConverts = false;
        rejectConvert = failed;
        const pending = queuedConverts.splice(0, queuedConverts.length);
        for (const item of pending) {
          if (failed) {
            item.reject(new Error('convert failed'));
            continue;
          }
          item.resolve(previewDataUrlToBlob(item.dataUrl));
        }
      };
    },
    finishConvert(dataUrl: string, failed = false) {
      manualConverts = true;
      const index = queuedConverts.findIndex(
        (item) => item.dataUrl === dataUrl,
      );
      const item = queuedConverts[index];
      if (!item) {
        throw new Error(`No pending conversion for ${dataUrl}`);
      }
      queuedConverts.splice(index, 1);
      if (failed) {
        item.reject(new Error('convert failed'));
        return;
      }
      item.resolve(previewDataUrlToBlob(item.dataUrl));
    },
  };
}

async function settledHarness(options?: {
  raw?: string | null;
  decode?: (dataUrl: string) => boolean;
}) {
  const env = harness(options);
  env.session.start();
  await flush();
  return env;
}

describe('workbench persistence session counts and roundtrip', () => {
  test('one source converts and stores one blob; later edits write JSON only', async () => {
    const env = await settledHarness();
    const preview = dataUrlFrom(pngBytes);
    const file = imageFile(pngBytes, 'sword.png');
    const watch = env.session.beginImageWatch(file);
    assert.equal(watch.kind, 'prepare');
    assert.equal(
      env.session.acceptPreview(watch.id, {
        file,
        previewUrl: preview,
        aspectRatio: 1.5,
      }),
      true,
    );
    await flush();
    assert.equal(env.converts.length, 1);
    assert.equal(env.backing.calls.blobPuts, 1);
    const stored = env.backing.record().json ?? '';
    assert.equal(stored.includes(preview), false);
    assert.equal(stored.includes(encodeBase64(pngBytes)), false);
    for (const name of ['One', 'Two', 'Three', 'Four']) {
      env.session.scheduleSnapshot(
        stateWith({
          itemName: name,
          imageFileName: 'sword.png',
          imagePreviewUrl: preview,
          resolvedImageAspectRatio: 1.5,
        }),
      );
      env.clock.advance(400);
      await flush();
    }
    assert.equal(env.converts.length, 1);
    assert.equal(env.backing.calls.blobPuts, 1);
    assert.equal(env.backing.calls.metadata, 4);
    assert.equal(env.backing.record().json?.includes('Four'), true);
  });

  test('hydration restores every field and does not crop or rewrite the blob', async () => {
    const preview = dataUrlFrom(pngBytes);
    const source = stateWith({
      cardLayout: 'image-right',
      sideLayoutFlow: 'fluid',
      cardStyle: 'classic',
      cardBorderRadius: 'none',
      cardWidthPx: 612,
      imageSize: 80,
      imageAspectRatio: 'portrait',
      resolvedImageAspectRatio: 0.8,
      imageBorderRadius: 20,
      imageBorderWidthPx: 4,
      imageRightVerticalPosition: 12,
      imageRotationDegrees: 90,
      imageFlipHorizontal: true,
      artworkColorSource: 'custom',
      artworkCustomColor: '#aabbcc',
      imagePreviewUrl: preview,
    });
    const env = harness();
    const blob = new Blob([pngBytes], { type: 'image/png' });
    env.backing.seed(encodeWorkbenchEnvelopeV7(source, 'kept'), [
      ['kept', blob],
    ]);
    env.session.start();
    await flush();
    assert.equal(env.converts.length, 0);
    assert.equal(env.backing.calls.blobPuts, 0);
    assert.equal(env.backing.calls.replace, 0);
    assert.equal(env.decodes.length, 1);
    const hydration = env.applied[0];
    assert.ok(hydration?.imageFile);
    assert.equal(hydration?.state.imagePreviewUrl, preview);
    assert.deepEqual(
      { ...hydration?.state, imagePreviewUrl: preview },
      { ...source, imagePreviewUrl: preview },
    );
    assert.equal(
      env.session.shouldSkipImageProcessing(hydration?.imageFile),
      true,
    );
    assert.equal(
      env.session.beginImageWatch(hydration?.imageFile).kind,
      'skip',
    );
    const file = hydration?.imageFile;
    assert.ok(file);
    assert.deepEqual(new Uint8Array(await file.arrayBuffer()), pngBytes);
    assert.equal(file.type, 'image/png');
    assert.equal(file.name, 'sword.png');
    assert.equal(
      workbenchItemDetailsSchema.safeParse({
        itemName: source.itemName,
        imageFile: file,
        classificationAndRarity: source.classificationAndRarity,
        requiresAttunement: source.requiresAttunement,
        flavorDescription: source.flavorDescription,
        mechanicalDescription: source.mechanicalDescription,
      }).success,
      true,
    );
    const snapshot = toWorkbenchSnapshotForExport(hydration.state);
    assert.equal('imagePreviewUrl' in snapshot, false);
    assert.equal(snapshot.artworkCustomColor, '#aabbcc');
    assert.equal(snapshot.imageRotationDegrees, 90);
    env.session.scheduleSnapshot(hydration.state);
    env.clock.advance(400);
    await flush();
    assert.equal(env.backing.calls.metadata, 0);
    assert.equal(env.backing.calls.blobPuts, 0);
  });
});

describe('workbench persistence session races', () => {
  test('a slow save cannot outlive a newer edit', async () => {
    const env = await settledHarness();
    const release = env.backing.hold();
    env.session.scheduleSnapshot(stateWith({ itemName: 'Alpha' }));
    env.clock.advance(400);
    await flush();
    env.session.scheduleSnapshot(stateWith({ itemName: 'Beta' }));
    env.clock.advance(400);
    release();
    await flush();
    assert.equal(env.backing.record().json?.includes('Beta'), true);
    assert.equal(
      env.backing.record().json?.includes('"itemName":"Alpha"'),
      false,
    );
  });

  test('only the last of A B C is published and committed', async () => {
    const env = await settledHarness();
    const files = [pngBytes, otherBytes, Uint8Array.from([9, 9, 9])].map(
      (bytes, index) => imageFile(bytes, `f${index}.png`),
    );
    const watches = files.map((file) => env.session.beginImageWatch(file));
    assert.equal(watches[2]?.kind, 'prepare');
    const previewBytes = [pngBytes, otherBytes, Uint8Array.from([9, 9, 9])];
    const previews = previewBytes.map((bytes) => dataUrlFrom(bytes));
    assert.equal(
      env.session.acceptPreview(watches[0]?.id ?? -1, {
        file: files[0] as File,
        previewUrl: previews[0] as string,
        aspectRatio: 1,
      }),
      false,
    );
    assert.equal(
      env.session.acceptPreview(watches[1]?.id ?? -1, {
        file: files[1] as File,
        previewUrl: previews[1] as string,
        aspectRatio: 1,
      }),
      false,
    );
    assert.equal(
      env.session.acceptPreview(watches[2]?.id ?? -1, {
        file: files[2] as File,
        previewUrl: previews[2] as string,
        aspectRatio: 2,
      }),
      true,
    );
    await flush();
    assert.equal(env.converts.length, 1);
    assert.equal(env.converts[0], previews[2]);
    assert.equal(env.backing.calls.blobPuts, 1);
    const blob = [...env.backing.blobs.values()][0];
    assert.ok(blob);
    assert.deepEqual(
      new Uint8Array(await blob.arrayBuffer()),
      Uint8Array.from([9, 9, 9]),
    );
  });

  test('clear during conversion and replacement during save keep one durable record', async () => {
    const env = await settledHarness();
    const releaseConvert = env.holdConvert();
    const file = imageFile(pngBytes, 'sword.png');
    const prepare = env.session.beginImageWatch(file);
    assert.equal(
      env.session.acceptPreview(prepare.id, {
        file,
        previewUrl: dataUrlFrom(pngBytes),
        aspectRatio: 1,
      }),
      true,
    );
    await flush();
    const clear = env.session.beginImageWatch(undefined);
    assert.equal(clear.kind, 'clear');
    env.session.commitClear(stateWith({ itemName: 'Cleared' }));
    releaseConvert(false);
    await flush();
    assert.equal(env.backing.calls.blobPuts, 0);
    assert.equal(env.backing.record().json?.includes('"assetKey":null'), true);
    assert.equal(env.backing.record().json?.includes('Cleared'), true);

    const releaseStore = env.backing.hold();
    env.session.scheduleSnapshot(stateWith({ itemName: 'While saving' }));
    env.clock.advance(400);
    await flush();
    const next = imageFile(otherBytes, 'next.png');
    const replacement = env.session.beginImageWatch(next);
    assert.equal(
      env.session.acceptPreview(replacement.id, {
        file: next,
        previewUrl: dataUrlFrom(otherBytes),
        aspectRatio: 2,
      }),
      true,
    );
    releaseStore();
    await flush();
    const record = env.backing.record();
    assert.equal(record.json?.includes('next.png'), true);
    assert.equal(record.json?.includes('"assetKey":null'), false);
    assert.equal(env.backing.calls.blobPuts, 1);
    const stored = [...record.blobs.values()][0];
    assert.ok(stored);
    assert.deepEqual(new Uint8Array(await stored.arrayBuffer()), otherBytes);
  });

  test('dispose and a second mount ignore a late hydration', async () => {
    const first = harness();
    const release = first.backing.hold();
    first.session.start();
    await flush();
    first.session.dispose();
    release();
    await flush();
    assert.equal(first.applied.length, 0);

    const preview = dataUrlFrom(pngBytes);
    const source = stateWith({ imagePreviewUrl: preview });
    const second = harness();
    second.backing.seed(encodeWorkbenchEnvelopeV7(source, 'kept'), [
      ['kept', new Blob([pngBytes], { type: 'image/png' })],
    ]);
    second.session.start();
    second.session.dispose();
    const replay = harness();
    replay.backing.seed(encodeWorkbenchEnvelopeV7(source, 'kept'), [
      ['kept', new Blob([pngBytes], { type: 'image/png' })],
    ]);
    replay.session.start();
    await flush();
    assert.equal(replay.applied.length, 1);
    assert.equal(replay.applied[0]?.state.itemName, 'Sunblade');
    assert.equal(second.applied.length, 0);
  });

  test('an obsolete conversion failure does not undo a newer success', async () => {
    const env = await settledHarness();
    env.holdConvert();
    const firstPreview = dataUrlFrom(pngBytes);
    const secondPreview = dataUrlFrom(otherBytes);
    const first = imageFile(pngBytes, 'a.png');
    const firstWatch = env.session.beginImageWatch(first);
    env.session.acceptPreview(firstWatch.id, {
      file: first,
      previewUrl: firstPreview,
      aspectRatio: 1,
    });
    await flush();
    const second = imageFile(otherBytes, 'b.png');
    const secondWatch = env.session.beginImageWatch(second);
    env.session.acceptPreview(secondWatch.id, {
      file: second,
      previewUrl: secondPreview,
      aspectRatio: 1,
    });
    await flush();
    env.finishConvert(secondPreview, false);
    await flush();
    env.finishConvert(firstPreview, true);
    await flush();
    assert.equal(env.backing.calls.blobPuts, 1);
    const stored = [...env.backing.blobs.values()][0];
    assert.ok(stored);
    assert.deepEqual(new Uint8Array(await stored.arrayBuffer()), otherBytes);
    env.session.scheduleSnapshot(stateWith({ itemName: 'After' }));
    env.clock.advance(400);
    await flush();
    assert.equal(env.backing.record().json?.includes('After'), true);
    assert.equal(env.warnings.length, 0);
  });
});

describe('workbench persistence migration', () => {
  test('migrates supported legacy versions once, including an empty image', async () => {
    for (const version of [1, 2, 3, 5, 6]) {
      const raw = JSON.stringify({
        version,
        state: {
          itemName: `v${version}`,
          imageRightVerticalPosition: version === 1 ? 4 : 3,
          imagePreviewUrl: version === 3 ? '' : dataUrlFrom(pngBytes),
          imageFileName: version === 3 ? '' : 'sword.png',
          minimalArtworkThemeSource: 'triad-left',
          minimalArtworkThemeCustomColor: '#123456',
        },
      });
      const env = await settledHarness({ raw });
      assert.equal(env.legacy.raw, null);
      assert.equal(env.legacy.removed.length, 1);
      assert.equal(env.converts.length, 0);
      assert.equal(env.backing.calls.blobPuts, version === 3 ? 0 : 1);
      assert.equal(env.decodes.length, version === 3 ? 0 : 1);
      const hydration = env.applied[0];
      assert.equal(hydration?.state.itemName, `v${version}`);
      assert.equal(hydration?.state.artworkColorSource, 'triad-left');
      assert.equal(hydration?.state.artworkCustomColor, '#123456');
      if (version === 1) {
        assert.equal(hydration?.state.imageRightVerticalPosition, 8);
      }
      if (version === 3) {
        assert.equal(hydration?.imageFile, undefined);
        assert.equal(env.session.beginImageWatch(undefined).kind, 'skip');
      } else {
        assert.equal(
          env.session.shouldSkipImageProcessing(hydration?.imageFile),
          true,
        );
        assert.equal(hydration?.state.imagePreviewUrl, dataUrlFrom(pngBytes));
      }
    }
  });

  test('invalid legacy artwork and envelopes do not overwrite storage', async () => {
    const cases = [
      'https://example.test/a.png',
      'blob:https://example.test/a',
      'data:text/plain;base64,SGVsbG8=',
      'data:image/png;base64,****',
      'data:image/png;base64,',
      'data:image/png,abcd',
    ];
    for (const imagePreviewUrl of cases) {
      const raw = JSON.stringify({
        version: 6,
        state: { itemName: 'Kept', imagePreviewUrl, imageFileName: 'bad.png' },
      });
      const env = await settledHarness({ raw });
      assert.equal(env.legacy.raw, raw);
      assert.equal(env.backing.calls.replace, 0);
      assert.equal(env.converts.length, 0);
      assert.equal(env.applied[0]?.state.itemName, 'Kept');
      assert.equal(env.applied[0]?.state.imagePreviewUrl, '');
      assert.equal(env.applied[0]?.imageFile, undefined);
      assert.equal(env.session.getNotice(), workbenchPersistenceCopy.corrupt);
      env.session.scheduleSnapshot(stateWith({ itemName: 'Edited' }));
      env.clock.advance(400);
      await flush();
      assert.equal(env.backing.calls.metadata, 0);
      assert.equal(env.legacy.raw, raw);
    }

    const malformed = await settledHarness({ raw: '{' });
    assert.equal(malformed.backing.calls.replace, 0);
    assert.equal(malformed.legacy.raw, '{');
    assert.equal(
      malformed.session.getNotice(),
      workbenchPersistenceCopy.corrupt,
    );

    const brokenField = await settledHarness({
      raw: JSON.stringify({
        version: 6,
        state: { itemName: 4, flavorDescription: 'Salvaged' },
      }),
    });
    assert.equal(brokenField.applied[0]?.state.flavorDescription, 'Salvaged');
    assert.equal(brokenField.backing.record().json, null);

    const future = await settledHarness({
      raw: JSON.stringify({
        version: 4,
        state: { itemName: 'Later', imagePreviewUrl: dataUrlFrom(pngBytes) },
      }),
    });
    assert.equal(future.applied[0]?.state.itemName, 'Later');
    assert.equal(future.applied[0]?.state.imagePreviewUrl, '');
    assert.equal(future.backing.calls.replace, 0);
    assert.equal(future.legacy.raw?.includes('"version":4'), true);
  });

  test('failed migration keeps legacy bytes; cleanup failure does not remigrate', async () => {
    const raw = JSON.stringify({
      version: 6,
      state: {
        itemName: 'Migrate',
        imagePreviewUrl: dataUrlFrom(pngBytes),
        imageFileName: 'sword.png',
      },
    });
    const failed = harness({ raw });
    failed.backing.failCommit('quota');
    failed.session.start();
    await flush();
    assert.equal(failed.legacy.raw, raw);
    assert.equal(failed.legacy.removed.length, 0);
    assert.equal(failed.converts.length, 0);
    assert.equal(
      failed.applied[0]?.state.imagePreviewUrl,
      dataUrlFrom(pngBytes),
    );
    assert.equal(failed.backing.calls.blobPuts, 0);
    failed.session.scheduleSnapshot(stateWith({ itemName: 'Again' }));
    failed.clock.advance(400);
    await flush();
    assert.equal(failed.backing.calls.replace, 1);
    assert.equal(failed.decodes.length, 1);

    const cleanup = harness({ raw });
    cleanup.legacy.throwOnRemove = true;
    cleanup.session.start();
    await flush();
    assert.equal(cleanup.backing.calls.blobPuts, 1);
    assert.equal(cleanup.legacy.raw, raw);
    const stored = cleanup.backing.record().json;
    assert.ok(stored);
    const reloaded = harness();
    const blob = [...cleanup.backing.blobs.values()][0];
    assert.ok(blob);
    reloaded.backing.seed(stored, [['asset-1', blob]]);
    reloaded.legacy.raw = raw;
    reloaded.session.start();
    await flush();
    assert.equal(reloaded.legacy.reads, 0);
    assert.equal(reloaded.backing.calls.replace, 0);
    assert.equal(reloaded.converts.length, 0);
    assert.equal(reloaded.decodes.length, 1);
    assert.equal(
      reloaded.session.shouldSkipImageProcessing(
        reloaded.applied[0]?.imageFile,
      ),
      true,
    );
  });

  test('a failed image decode does not migrate', async () => {
    const raw = JSON.stringify({
      version: 5,
      state: { itemName: 'Blur', imagePreviewUrl: dataUrlFrom(pngBytes) },
    });
    const env = await settledHarness({
      raw,
      decode: () => false,
    });
    assert.equal(env.backing.calls.replace, 0);
    assert.equal(env.legacy.raw, raw);
    assert.equal(env.applied[0]?.state.imagePreviewUrl, '');
    assert.equal(env.applied[0]?.state.itemName, 'Blur');
  });
});

describe('workbench persistence failures', () => {
  test('storage failures settle once, keep the last good record, and do not retry', async () => {
    const denied = harness();
    denied.legacy.throwOnRead = true;
    denied.session.start();
    await flush();
    assert.equal(denied.session.getPhase(), 'settled');
    assert.equal(
      denied.session.getNotice(),
      workbenchPersistenceCopy.unavailable,
    );
    denied.session.scheduleSnapshot(stateWith({ itemName: 'Nope' }));
    denied.clock.advance(4000);
    await flush();
    assert.equal(denied.backing.calls.metadata, 0);
    assert.equal(denied.warnings.length, 1);

    const blocked = harness();
    blocked.backing.failLoad('blocked');
    blocked.session.start();
    await flush();
    assert.equal(blocked.session.getNotice(), workbenchPersistenceCopy.blocked);
    assert.equal(blocked.backing.calls.closes >= 1, true);
    assert.equal(blocked.backing.record().json, null);

    const quota = await settledHarness();
    quota.backing.failCommit('quota');
    quota.session.scheduleSnapshot(stateWith({ itemName: 'Full' }));
    quota.clock.advance(400);
    await flush();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      quota.session.scheduleSnapshot(
        stateWith({ itemName: `Full ${attempt}` }),
      );
      quota.clock.advance(400);
    }
    await flush();
    assert.equal(quota.backing.calls.metadata, 1);
    assert.equal(quota.backing.record().json, null);
    assert.equal(quota.warnings.length, 1);

    const timeout = harness();
    const release = timeout.backing.hold();
    timeout.backing.seed(
      encodeWorkbenchEnvelopeV7(stateWith({ itemName: 'Slow' }), null),
    );
    timeout.session.start();
    await flush();
    timeout.clock.advance(5000);
    await flush();
    release();
    await flush();
    assert.equal(timeout.applied.length, 1);
    assert.equal(timeout.applied[0]?.state.itemName, '');
    assert.equal(timeout.session.getNotice(), workbenchPersistenceCopy.timeout);
    assert.equal(timeout.backing.calls.closes >= 1, true);
    timeout.session.scheduleSnapshot(stateWith({ itemName: 'Late' }));
    timeout.clock.advance(400);
    await flush();
    assert.equal(timeout.backing.calls.metadata, 0);

    const disconnected = await settledHarness();
    disconnected.session.notifyStoreDisconnected();
    disconnected.session.scheduleSnapshot(
      stateWith({ itemName: 'Disconnected' }),
    );
    disconnected.clock.advance(400);
    await flush();
    assert.equal(disconnected.backing.calls.metadata, 0);
    assert.equal(
      disconnected.session.getNotice(),
      workbenchPersistenceCopy.unavailable,
    );
  });

  test('corrupt artwork can be replaced explicitly and a stale key cannot overwrite it', async () => {
    const corrupt = harness();
    corrupt.backing.seed(
      encodeWorkbenchEnvelopeV7(stateWith({ itemName: 'Partial' }), 'gone'),
    );
    corrupt.session.start();
    await flush();
    assert.equal(corrupt.applied[0]?.state.itemName, 'Partial');
    assert.equal(corrupt.applied[0]?.state.imagePreviewUrl, '');
    assert.equal(corrupt.backing.calls.replace, 0);
    corrupt.session.scheduleSnapshot(stateWith({ itemName: 'Do not save' }));
    corrupt.clock.advance(400);
    await flush();
    assert.equal(corrupt.backing.calls.metadata, 0);
    const replacement = imageFile(pngBytes, 'fresh.png');
    const watch = corrupt.session.beginImageWatch(replacement);
    assert.equal(
      corrupt.session.acceptPreview(watch.id, {
        file: replacement,
        previewUrl: dataUrlFrom(pngBytes),
        aspectRatio: 1,
      }),
      true,
    );
    await flush();
    assert.equal(corrupt.backing.calls.blobPuts, 1);
    assert.equal(corrupt.session.getNotice(), null);
    corrupt.session.scheduleSnapshot(
      stateWith({ itemName: 'Recovered', imageFileName: 'fresh.png' }),
    );
    corrupt.clock.advance(400);
    await flush();
    assert.equal(corrupt.backing.record().json?.includes('Recovered'), true);

    const stale = harness();
    const blob = new Blob([pngBytes], { type: 'image/png' });
    stale.backing.seed(encodeWorkbenchEnvelopeV7(stateWith({}), 'asset-a'), [
      ['asset-a', blob],
    ]);
    stale.session.start();
    await flush();
    stale.backing.blobs.delete('asset-a');
    const before = stale.backing.record().json;
    stale.session.scheduleSnapshot(stateWith({ itemName: 'Stale tab' }));
    stale.clock.advance(400);
    await flush();
    assert.equal(stale.backing.record().json, before);
    assert.equal(stale.session.getNotice(), workbenchPersistenceCopy.conflict);
    stale.session.scheduleSnapshot(stateWith({ itemName: 'Still stale' }));
    stale.clock.advance(400);
    await flush();
    assert.equal(stale.backing.calls.metadata, 1);
  });

  test('failed clear leaves the previous record and does not loop', async () => {
    const env = harness();
    const blob = new Blob([pngBytes], { type: 'image/png' });
    env.backing.seed(
      encodeWorkbenchEnvelopeV7(stateWith({ itemName: 'Safe' }), 'asset-a'),
      [['asset-a', blob]],
    );
    env.session.start();
    await flush();
    env.backing.failCommit('unknown');
    const watch = env.session.beginImageWatch(undefined);
    assert.equal(watch.kind, 'clear');
    env.session.commitClear(stateWith({ itemName: 'Safe' }));
    await flush();
    assert.equal(env.backing.record().json?.includes('Safe'), true);
    assert.equal(env.backing.blobs.has('asset-a'), true);
    assert.equal(env.session.getNotice(), workbenchPersistenceCopy.clearFailed);
    env.session.scheduleSnapshot(stateWith({ itemName: 'After failure' }));
    env.clock.advance(400);
    await flush();
    assert.equal(env.backing.calls.replace, 1);
    assert.equal(env.warnings.length, 1);
  });

  test('commit paths do not surface an unhandled rejection', async () => {
    const rejections: unknown[] = [];
    const onRejection = (reason: unknown) => {
      rejections.push(reason);
    };
    process.on('unhandledRejection', onRejection);
    try {
      const env = await settledHarness();
      env.backing.failCommit('quota');
      env.session.scheduleSnapshot(stateWith({ itemName: 'Quota' }));
      env.clock.advance(400);
      const file = imageFile(pngBytes, 'sword.png');
      const watch = env.session.beginImageWatch(file);
      env.session.acceptPreview(watch.id, {
        file,
        previewUrl: 'not-an-image',
        aspectRatio: 1,
      });
      await flush();
      env.session.dispose();
      await flush();
    } finally {
      process.off('unhandledRejection', onRejection);
    }
    assert.deepEqual(rejections, []);
  });
});

describe('workbench form autosave', () => {
  test('one real form edit settles and reloads the new value', async () => {
    const preview = dataUrlFrom(pngBytes);
    const source = stateWith({
      itemName: 'Before',
      imagePreviewUrl: preview,
      requiresAttunement: true,
    });
    const env = harness();
    const blob = new Blob([pngBytes], { type: 'image/png' });
    env.backing.seed(encodeWorkbenchEnvelopeV7(source, 'asset-a'), [
      ['asset-a', blob],
    ]);
    env.session.start();
    await flush();
    const hydrated = env.applied[0]?.state;
    assert.ok(hydrated);
    assert.equal(hydrated.itemName, 'Before');
    let rendered = hydrated;
    const form = createFormControl({
      defaultValues: {
        itemName: hydrated.itemName,
        classificationAndRarity: hydrated.classificationAndRarity,
        requiresAttunement: hydrated.requiresAttunement,
        flavorDescription: hydrated.flavorDescription,
        mechanicalDescription: hydrated.mechanicalDescription,
      },
    });
    const autosave = bindWorkbenchFormAutosave({
      watch: (callback) => form.watch(callback),
      getRenderedState: () => rendered,
      scheduleSnapshot: (state) => {
        env.session.scheduleSnapshot(state);
      },
    });
    autosave.scheduleRendered();
    env.clock.advance(400);
    await flush();
    assert.equal(env.backing.calls.metadata, 0);

    const nameInput = { name: 'itemName', type: 'text', value: 'Before' };
    const nameField = form.register('itemName');
    nameField.ref(nameInput as unknown as HTMLInputElement);
    nameInput.value = 'After';
    await nameField.onChange({ target: nameInput, type: 'change' });
    rendered = { ...rendered, itemName: 'After' };
    env.clock.advance(400);
    await flush();
    assert.equal(env.backing.calls.metadata, 1);
    assert.equal(env.backing.calls.blobPuts, 0);
    assert.equal(
      env.backing.record().json?.includes('"itemName":"After"'),
      true,
    );
    assert.equal(
      env.backing.record().json?.includes('"itemName":"Before"'),
      false,
    );

    const box = {
      name: 'requiresAttunement',
      type: 'checkbox',
      checked: true,
    };
    const boxField = form.register('requiresAttunement');
    boxField.ref(box as unknown as HTMLInputElement);
    box.checked = false;
    await boxField.onChange({ target: box, type: 'change' });
    rendered = { ...rendered, requiresAttunement: false };
    env.clock.advance(400);
    await flush();
    assert.equal(env.backing.calls.metadata, 2);
    assert.equal(
      env.backing.record().json?.includes('"requiresAttunement":false'),
      true,
    );

    const stored = env.backing.record().json;
    assert.ok(stored);
    const reloaded = harness();
    reloaded.backing.seed(stored, [['asset-a', blob]]);
    reloaded.session.start();
    await flush();
    assert.equal(reloaded.applied[0]?.state.itemName, 'After');
    assert.equal(reloaded.applied[0]?.state.requiresAttunement, false);
    assert.equal(reloaded.backing.calls.metadata, 0);
    assert.equal(reloaded.backing.calls.blobPuts, 0);
    autosave.unsubscribe();
  });
});

describe('workbench recovery and abort', () => {
  test('edits during a pending recovery replacement and clear are saved', async () => {
    const bad = new Blob([Uint8Array.from([9, 9, 9])], { type: 'image/png' });
    const replacement = harness({ decode: () => false });
    replacement.backing.seed(
      encodeWorkbenchEnvelopeV7(stateWith({ itemName: 'Before' }), 'bad-asset'),
      [['bad-asset', bad]],
    );
    replacement.session.start();
    await flush();
    assert.equal(
      replacement.session.getNotice(),
      workbenchPersistenceCopy.corrupt,
    );
    const releaseReplace = replacement.backing.hold();
    const file = imageFile(pngBytes, 'fresh.png');
    const watch = replacement.session.beginImageWatch(file);
    const preview = dataUrlFrom(pngBytes);
    assert.equal(
      replacement.session.acceptPreview(watch.id, {
        file,
        previewUrl: preview,
        aspectRatio: 1,
      }),
      true,
    );
    await flush();
    assert.equal(replacement.backing.calls.replace, 1);
    assert.equal(replacement.backing.record().json?.includes('Before'), true);
    replacement.session.scheduleSnapshot(
      stateWith({
        itemName: 'Edited during recovery',
        imageFileName: 'fresh.png',
        imagePreviewUrl: preview,
        resolvedImageAspectRatio: 1,
      }),
    );
    releaseReplace();
    await flush();
    replacement.clock.advance(400);
    await flush();
    assert.equal(replacement.session.getNotice(), null);
    assert.equal(replacement.backing.calls.replace, 1);
    assert.equal(replacement.backing.calls.metadata, 1);
    assert.equal(
      replacement.backing.record().json?.includes('Edited during recovery'),
      true,
    );
    assert.equal(
      replacement.backing.record().json?.includes('"itemName":"Before"'),
      false,
    );

    const clearing = harness({ decode: () => false });
    clearing.backing.seed(
      encodeWorkbenchEnvelopeV7(stateWith({ itemName: 'Before' }), 'bad-asset'),
      [['bad-asset', bad]],
    );
    clearing.session.start();
    await flush();
    const releaseClear = clearing.backing.hold();
    clearing.session.commitClear(
      stateWith({
        itemName: 'Before',
        imageFileName: '',
        imagePreviewUrl: '',
      }),
    );
    await flush();
    assert.equal(clearing.backing.calls.replace, 1);
    assert.equal(
      clearing.backing.record().json?.includes('"itemName":"Before"'),
      true,
    );
    clearing.session.scheduleSnapshot(
      stateWith({
        itemName: 'Edited during recovery',
        imageFileName: '',
        imagePreviewUrl: '',
      }),
    );
    releaseClear();
    await flush();
    clearing.clock.advance(400);
    await flush();
    assert.equal(clearing.session.getNotice(), null);
    assert.equal(clearing.backing.calls.replace, 1);
    assert.equal(clearing.backing.calls.metadata, 1);
    assert.equal(
      clearing.backing.record().json?.includes('Edited during recovery'),
      true,
    );
    assert.equal(clearing.backing.blobs.size, 0);
  });

  test('a current abort latches and an intentional abort does not', async () => {
    const current = harness();
    current.backing.seed(
      encodeWorkbenchEnvelopeV7(stateWith({ itemName: 'Before' }), null),
    );
    current.session.start();
    await flush();
    current.backing.failCommit('aborted');
    current.session.scheduleSnapshot(stateWith({ itemName: 'After' }));
    current.clock.advance(400);
    await flush();
    assert.equal(
      current.session.getNotice(),
      workbenchPersistenceCopy.saveFailed,
    );
    assert.equal(
      current.backing.record().json?.includes('"itemName":"Before"'),
      true,
    );
    assert.equal(current.backing.calls.metadata, 1);
    current.session.scheduleSnapshot(stateWith({ itemName: 'Second' }));
    current.clock.advance(400);
    await flush();
    current.session.scheduleSnapshot(stateWith({ itemName: 'Third' }));
    current.clock.advance(400);
    await flush();
    assert.equal(current.backing.calls.metadata, 1);
    assert.equal(current.warnings.length, 1);

    const intentional = await settledHarness();
    const release = intentional.backing.hold();
    intentional.session.scheduleSnapshot(stateWith({ itemName: 'Alpha' }));
    intentional.clock.advance(400);
    await flush();
    assert.equal(intentional.backing.calls.metadata, 1);
    const file = imageFile(pngBytes, 'sword.png');
    const watch = intentional.session.beginImageWatch(file);
    assert.equal(
      intentional.session.acceptPreview(watch.id, {
        file,
        previewUrl: dataUrlFrom(pngBytes),
        aspectRatio: 1,
      }),
      true,
    );
    release();
    await flush();
    assert.equal(intentional.session.getNotice(), null);
    assert.equal(
      intentional.backing.record().json?.includes('sword.png'),
      true,
    );
    assert.equal(intentional.backing.calls.blobPuts, 1);
    assert.equal(intentional.warnings.length, 0);

    const raw = JSON.stringify({
      version: 6,
      state: {
        itemName: 'Legacy',
        imagePreviewUrl: dataUrlFrom(pngBytes),
        imageFileName: 'sword.png',
      },
    });
    const migration = harness({ raw });
    migration.backing.failCommit('aborted');
    migration.session.start();
    await flush();
    assert.equal(migration.session.getPhase(), 'settled');
    assert.equal(migration.applied[0]?.state.itemName, 'Legacy');
    assert.equal(
      migration.applied[0]?.state.imagePreviewUrl,
      dataUrlFrom(pngBytes),
    );
    assert.ok(migration.applied[0]?.imageFile);
    assert.equal(
      migration.session.getNotice(),
      workbenchPersistenceCopy.saveFailed,
    );
    assert.equal(migration.legacy.raw, raw);
    assert.equal(migration.backing.record().json, null);
    migration.session.scheduleSnapshot(stateWith({ itemName: 'Edited' }));
    migration.clock.advance(400);
    await flush();
    assert.equal(migration.backing.calls.replace, 1);
    assert.equal(migration.backing.record().json, null);

    const disposed = harness({ raw });
    const releaseMigration = disposed.backing.holdCommit();
    disposed.session.start();
    await flush();
    assert.equal(disposed.backing.calls.replace, 1);
    assert.equal(disposed.applied.length, 0);
    disposed.session.dispose();
    releaseMigration();
    await flush();
    assert.equal(disposed.applied.length, 0);
    assert.equal(disposed.legacy.raw, raw);
    assert.equal(disposed.session.getNotice(), null);
    assert.equal(disposed.backing.record().json, null);
  });

  for (const invalidState of [false, true]) {
    test(`an existing blob with ${invalidState ? 'invalid metadata' : 'undecodable bytes'} is deleted only after successful recovery`, async () => {
      const bad = new Blob([Uint8Array.from([9, 9, 9])], { type: 'image/png' });
      const open = () => {
        const env = harness({ decode: () => false });
        const envelope = JSON.parse(
          encodeWorkbenchEnvelopeV7(
            stateWith({ itemName: 'Before' }),
            'bad-asset',
          ),
        );
        if (invalidState) {
          envelope.state.requiresAttunement = 'broken';
        }
        env.backing.seed(JSON.stringify(envelope), [['bad-asset', bad]]);
        return env;
      };

      const kept = open();
      kept.session.start();
      await flush();
      assert.equal(kept.backing.blobs.has('bad-asset'), true);
      assert.equal(kept.backing.calls.replace, 0);
      assert.equal(kept.applied[0]?.state.imagePreviewUrl, '');
      assert.equal(kept.applied[0]?.state.itemName, 'Before');
      kept.session.scheduleSnapshot(stateWith({ itemName: 'Do not save' }));
      kept.clock.advance(400);
      await flush();
      assert.equal(kept.backing.calls.metadata, 0);
      assert.equal(kept.backing.blobs.has('bad-asset'), true);

      const failedReplace = open();
      failedReplace.session.start();
      await flush();
      failedReplace.backing.failCommit('unknown');
      const failedFile = imageFile(pngBytes, 'fresh.png');
      const failedWatch = failedReplace.session.beginImageWatch(failedFile);
      failedReplace.session.acceptPreview(failedWatch.id, {
        file: failedFile,
        previewUrl: dataUrlFrom(pngBytes),
        aspectRatio: 1,
      });
      await flush();
      assert.equal(failedReplace.backing.blobs.has('bad-asset'), true);
      assert.equal(failedReplace.backing.blobs.size, 1);
      assert.equal(
        failedReplace.backing.record().json?.includes('bad-asset'),
        true,
      );
      assert.equal(
        failedReplace.session.getNotice(),
        workbenchPersistenceCopy.saveFailed,
      );

      const replaced = open();
      replaced.session.start();
      await flush();
      const file = imageFile(pngBytes, 'fresh.png');
      const watch = replaced.session.beginImageWatch(file);
      replaced.session.acceptPreview(watch.id, {
        file,
        previewUrl: dataUrlFrom(pngBytes),
        aspectRatio: 1,
      });
      await flush();
      assert.equal(replaced.backing.blobs.has('bad-asset'), false);
      assert.equal(replaced.backing.blobs.has('asset-1'), true);
      assert.equal(replaced.backing.blobs.size, 1);
      assert.equal(
        replaced.backing.record().json?.includes('bad-asset'),
        false,
      );
      assert.equal(replaced.backing.record().json?.includes('asset-1'), true);
      assert.equal(replaced.session.getNotice(), null);

      const cleared = open();
      cleared.session.start();
      await flush();
      cleared.session.commitClear(
        stateWith({
          itemName: 'Before',
          imageFileName: '',
          imagePreviewUrl: '',
        }),
      );
      await flush();
      assert.equal(cleared.backing.blobs.size, 0);
      assert.equal(cleared.backing.record().json?.includes('bad-asset'), false);
      assert.equal(
        cleared.backing.record().json?.includes('"assetKey":null'),
        true,
      );
      assert.equal(cleared.session.getNotice(), null);

      const failedClear = open();
      failedClear.session.start();
      await flush();
      failedClear.backing.failCommit('unknown');
      failedClear.session.commitClear(
        stateWith({
          itemName: 'Before',
          imageFileName: '',
          imagePreviewUrl: '',
        }),
      );
      await flush();
      assert.equal(failedClear.backing.blobs.has('bad-asset'), true);
      assert.equal(failedClear.backing.blobs.size, 1);
      assert.equal(
        failedClear.backing.record().json?.includes('bad-asset'),
        true,
      );
      assert.equal(
        failedClear.session.getNotice(),
        workbenchPersistenceCopy.clearFailed,
      );
    });
  }
});
