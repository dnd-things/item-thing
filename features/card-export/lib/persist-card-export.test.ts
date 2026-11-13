import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ConvexError } from 'convex/values';
import {
  STALE_OPTIMIZER_VERSION,
  STALE_SOURCE,
} from '../../../convex/lib/sourceReuse.ts';
import {
  type CardExportCandidate,
  isRetryableSourceReuseError,
  persistCardExport,
} from './persist-card-export.ts';

type Hold = number;

function absent(): CardExportCandidate<Hold> {
  return { kind: 'absent' };
}

function fresh(
  storageId: string,
  optimizerVersion: string,
  hold: Hold,
): CardExportCandidate<Hold> {
  return {
    kind: 'fresh',
    source: { storageId, optimizerVersion },
    hold,
  };
}

function cached(
  storageId: string,
  optimizerVersion: string,
  hold: Hold,
): CardExportCandidate<Hold> {
  return {
    kind: 'cached',
    source: { storageId, optimizerVersion },
    hold,
  };
}

test('fresh insert once without validate', async () => {
  let validates = 0;
  let inserts = 0;
  await persistCardExport({
    read: async () => fresh('a', 'v1', 1),
    replace: async () => fresh('x', 'v1', 2),
    isCurrent: () => true,
    validate: async () => {
      validates += 1;
      return { optimizerVersion: 'v1', reusable: true };
    },
    insert: async (source) => {
      inserts += 1;
      assert.equal(source?.storageId, 'a');
    },
  });
  assert.equal(validates, 0);
  assert.equal(inserts, 1);
});

test('cached accept when reusable and versions match', async () => {
  let replaces = 0;
  let inserts = 0;
  await persistCardExport({
    read: async () => cached('cached', 'v1', 1),
    replace: async () => {
      replaces += 1;
      return fresh('x', 'v1', 2);
    },
    isCurrent: () => true,
    validate: async () => ({ optimizerVersion: 'v1', reusable: true }),
    insert: async (source) => {
      inserts += 1;
      assert.equal(source?.storageId, 'cached');
    },
  });
  assert.equal(replaces, 0);
  assert.equal(inserts, 1);
});

test('cached reject when not reusable inserts replacement without validating fresh', async () => {
  let validates = 0;
  let replaces = 0;
  const inserted: string[] = [];
  await persistCardExport({
    read: async () => cached('old', 'v1', 1),
    replace: async () => {
      replaces += 1;
      return fresh('new', 'v1', 2);
    },
    isCurrent: () => true,
    validate: async () => {
      validates += 1;
      return { optimizerVersion: 'v1', reusable: false };
    },
    insert: async (source) => {
      inserted.push(source?.storageId ?? '');
    },
  });
  assert.equal(validates, 1);
  assert.equal(replaces, 1);
  assert.deepEqual(inserted, ['new']);
});

test('cached reject when versions differ even if reusable', async () => {
  let validates = 0;
  const inserted: string[] = [];
  await persistCardExport({
    read: async () => cached('old', 'v1', 1),
    replace: async () => fresh('new', 'v2', 2),
    isCurrent: () => true,
    validate: async () => {
      validates += 1;
      return { optimizerVersion: 'v2', reusable: true };
    },
    insert: async (source) => {
      inserted.push(`${source?.storageId}:${source?.optimizerVersion}`);
    },
  });
  assert.equal(validates, 1);
  assert.deepEqual(inserted, ['new:v2']);
});

test('hold change during validate re-reads without replace', async () => {
  let replaces = 0;
  let reads = 0;
  const inserted: string[] = [];
  await persistCardExport({
    read: async ({ attempt, discard }) => {
      reads += 1;
      assert.equal(discard, null);
      if (reads === 1) {
        assert.equal(attempt, 1);
        return cached('stale', 'v1', 1);
      }
      assert.equal(attempt, 2);
      return cached('live', 'v1', 2);
    },
    replace: async () => {
      replaces += 1;
      return fresh('x', 'v1', 3);
    },
    isCurrent: (hold) => hold !== 1,
    validate: async () => ({ optimizerVersion: 'v1', reusable: true }),
    insert: async (source) => {
      inserted.push(source?.storageId ?? '');
    },
  });
  assert.equal(replaces, 0);
  assert.equal(reads, 2);
  assert.deepEqual(inserted, ['live']);
});

test('stale error from insert retries once with hold as discard', async () => {
  const discards: Array<Hold | null> = [];
  let inserts = 0;
  await persistCardExport({
    read: async ({ discard }) => {
      discards.push(discard);
      return cached('src', 'v1', 42);
    },
    replace: async () => fresh('x', 'v1', 99),
    isCurrent: () => true,
    validate: async () => ({ optimizerVersion: 'v1', reusable: true }),
    insert: async () => {
      inserts += 1;
      if (inserts === 1) {
        throw new ConvexError({ code: STALE_SOURCE });
      }
    },
  });
  assert.equal(inserts, 2);
  assert.deepEqual(discards, [null, 42]);
});

test('stale error from read before candidate retries with null discard then rejects', async () => {
  let reads = 0;
  await assert.rejects(
    () =>
      persistCardExport({
        read: async ({ attempt, discard }) => {
          reads += 1;
          if (attempt === 2) {
            assert.equal(discard, null);
          }
          throw new ConvexError({ code: STALE_OPTIMIZER_VERSION });
        },
        replace: async () => fresh('x', 'v1', 1),
        isCurrent: () => true,
        validate: async () => ({ optimizerVersion: 'v1', reusable: true }),
        insert: async () => undefined,
      }),
    (error: unknown) => isRetryableSourceReuseError(error),
  );
  assert.equal(reads, 2);
});

test('non-stale error runs one attempt without discard', async () => {
  let reads = 0;
  const discards: Array<Hold | null> = [];
  await assert.rejects(
    () =>
      persistCardExport({
        read: async ({ discard }) => {
          reads += 1;
          discards.push(discard);
          return fresh('a', 'v1', 1);
        },
        replace: async () => fresh('x', 'v1', 2),
        isCurrent: () => true,
        validate: async () => ({ optimizerVersion: 'v1', reusable: true }),
        insert: async () => {
          throw new Error('network');
        },
      }),
    /network/,
  );
  assert.equal(reads, 1);
  assert.deepEqual(discards, [null]);
});

test('absent inserts null without validate and stale insert retries once', async () => {
  let validates = 0;
  let inserts = 0;
  const discards: Array<Hold | null> = [];
  await persistCardExport({
    read: async ({ discard }) => {
      discards.push(discard);
      return absent();
    },
    replace: async () => fresh('x', 'v1', 1),
    isCurrent: () => true,
    validate: async () => {
      validates += 1;
      return { optimizerVersion: 'v1', reusable: true };
    },
    insert: async (source) => {
      inserts += 1;
      assert.equal(source, null);
      if (inserts === 1) {
        throw new ConvexError({ code: STALE_SOURCE });
      }
    },
  });
  assert.equal(validates, 0);
  assert.equal(inserts, 2);
  assert.deepEqual(discards, [null, null]);
});
