import { ConvexError } from 'convex/values';
import {
  STALE_OPTIMIZER_VERSION,
  STALE_SOURCE,
} from '../../../convex/lib/sourceReuse.ts';

export type PreparedSource = {
  storageId: string;
  optimizerVersion: string;
};

export type SourceReuseStatus = {
  optimizerVersion: string;
  reusable: boolean;
};

export type CardExportCandidate<THold> =
  | { kind: 'absent' }
  | { kind: 'fresh'; source: PreparedSource; hold: THold }
  | { kind: 'cached'; source: PreparedSource; hold: THold };

export type PersistCardExportOperations<THold> = {
  read: (args: {
    attempt: 1 | 2;
    discard: THold | null;
  }) => Promise<CardExportCandidate<THold>>;
  replace: (hold: THold) => Promise<CardExportCandidate<THold>>;
  isCurrent: (hold: THold) => boolean;
  validate: (prepared: PreparedSource) => Promise<SourceReuseStatus>;
  insert: (source: PreparedSource | null) => Promise<void>;
};

export function isRetryableSourceReuseError(error: unknown): boolean {
  if (!(error instanceof ConvexError)) {
    return false;
  }
  const data: unknown = error.data;
  if (typeof data !== 'object' || data === null || !('code' in data)) {
    return false;
  }
  const code = data.code;
  return code === STALE_OPTIMIZER_VERSION || code === STALE_SOURCE;
}

async function persistCardExportAttempt<THold>(
  ops: PersistCardExportOperations<THold>,
  attempt: 1 | 2,
  discard: THold | null,
  lastInsertHold: { current: THold | null },
): Promise<void> {
  let candidate = await ops.read({ attempt, discard });
  while (true) {
    if (candidate.kind === 'absent') {
      lastInsertHold.current = null;
      await ops.insert(null);
      return;
    }
    if (candidate.kind === 'fresh') {
      lastInsertHold.current = candidate.hold;
      await ops.insert(candidate.source);
      return;
    }
    const status = await ops.validate(candidate.source);
    if (!ops.isCurrent(candidate.hold)) {
      candidate = await ops.read({ attempt: 2, discard: null });
      continue;
    }
    if (
      status.reusable &&
      status.optimizerVersion === candidate.source.optimizerVersion
    ) {
      lastInsertHold.current = candidate.hold;
      await ops.insert(candidate.source);
      return;
    }
    candidate = await ops.replace(candidate.hold);
  }
}

export async function persistCardExport<THold>(
  ops: PersistCardExportOperations<THold>,
): Promise<void> {
  const lastInsertHold: { current: THold | null } = { current: null };
  try {
    await persistCardExportAttempt(ops, 1, null, lastInsertHold);
  } catch (error: unknown) {
    if (!isRetryableSourceReuseError(error)) {
      throw error;
    }
    await persistCardExportAttempt(
      ops,
      2,
      lastInsertHold.current,
      lastInsertHold,
    );
  }
}
