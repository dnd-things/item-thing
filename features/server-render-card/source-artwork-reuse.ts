import { createHash } from 'node:crypto';
import { ConvexError } from 'convex/values';

export const SOURCE_ARTWORK_REUSE_MAX_ENTRIES = 16;
export const SOURCE_ARTWORK_REUSE_TTL_MS = 10 * 60 * 1000;

export type PreparedSource = {
  storageId: string;
  optimizerVersion: string;
};

export type SourceReuseStatus = {
  optimizerVersion: string;
  reusable: boolean;
};

type ResolvedEntry = {
  kind: 'resolved';
  generation: number;
  storageId: string;
  optimizerVersion: string;
  expiresAt: number;
  lastUsed: number;
};

type PendingEntry = {
  kind: 'pending';
  generation: number;
  promise: Promise<PreparedSource>;
};

type CacheEntry = ResolvedEntry | PendingEntry;

export type SourceArtworkCacheSnapshot = Array<
  | { key: string; kind: 'pending' }
  | {
      key: string;
      kind: 'resolved';
      storageId: string;
      optimizerVersion: string;
    }
>;

export function hashSourceArtwork(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export function sourceArtworkCacheKey(
  convexUrl: string,
  inputHash: string,
): string {
  return `${convexUrl}\0${inputHash}`;
}

export function isRetryableSourceReuseError(error: unknown): boolean {
  if (!(error instanceof ConvexError)) {
    return false;
  }
  const data: unknown = error.data;
  if (typeof data !== 'object' || data === null || !('code' in data)) {
    return false;
  }
  const code = data.code;
  return code === 'stale_optimizer_version' || code === 'stale_source';
}

export function createSourceArtworkReuseCache(options?: {
  maxEntries?: number;
  ttlMs?: number;
  now?: () => number;
}) {
  const maxEntries = options?.maxEntries ?? SOURCE_ARTWORK_REUSE_MAX_ENTRIES;
  const ttlMs = options?.ttlMs ?? SOURCE_ARTWORK_REUSE_TTL_MS;
  const now = options?.now ?? (() => Date.now());
  const entries = new Map<string, CacheEntry>();
  let nextGeneration = 1;

  const evictExpired = (time: number): void => {
    const expired: string[] = [];
    for (const [key, entry] of entries) {
      if (entry.kind === 'resolved' && entry.expiresAt <= time) {
        expired.push(key);
      }
    }
    for (const key of expired) {
      entries.delete(key);
    }
  };

  const evictLeastRecentResolved = (): boolean => {
    let oldestKey: string | undefined;
    let oldestUsed = Number.POSITIVE_INFINITY;
    for (const [key, entry] of entries) {
      if (entry.kind === 'resolved' && entry.lastUsed < oldestUsed) {
        oldestKey = key;
        oldestUsed = entry.lastUsed;
      }
    }
    if (oldestKey === undefined) {
      return false;
    }
    entries.delete(oldestKey);
    return true;
  };

  const canAdmit = (key: string): boolean => {
    evictExpired(now());
    const existing = entries.get(key);
    if (existing?.kind === 'resolved') {
      entries.delete(key);
    }
    if (entries.size < maxEntries) {
      return true;
    }
    evictLeastRecentResolved();
    return entries.size < maxEntries;
  };

  return {
    invalidate(key: string, generation?: number): void {
      if (generation === undefined) {
        entries.delete(key);
        return;
      }
      const current = entries.get(key);
      if (current !== undefined && current.generation === generation) {
        entries.delete(key);
      }
    },
    generationOf(key: string): number | undefined {
      return entries.get(key)?.generation;
    },
    readResolved(key: string): PreparedSource | null {
      const entry = entries.get(key);
      if (entry?.kind !== 'resolved') {
        return null;
      }
      if (entry.expiresAt <= now()) {
        entries.delete(key);
        return null;
      }
      return {
        storageId: entry.storageId,
        optimizerVersion: entry.optimizerVersion,
      };
    },
    touch(key: string): void {
      const entry = entries.get(key);
      if (entry?.kind !== 'resolved') {
        return;
      }
      const time = now();
      if (entry.expiresAt <= time) {
        entries.delete(key);
        return;
      }
      const refreshed: ResolvedEntry = { ...entry, lastUsed: time };
      entries.delete(key);
      entries.set(key, refreshed);
    },
    prepare(
      key: string,
      create: () => Promise<PreparedSource>,
    ): Promise<PreparedSource> {
      const existing = entries.get(key);
      if (existing?.kind === 'pending') {
        return existing.promise;
      }
      const resolved = this.readResolved(key);
      if (resolved !== null) {
        this.touch(key);
        return Promise.resolve(resolved);
      }
      if (!canAdmit(key)) {
        return create();
      }
      const generation = nextGeneration;
      nextGeneration += 1;
      const handle: { promise?: Promise<PreparedSource> } = {};
      handle.promise = create().then(
        (prepared) => {
          const current = entries.get(key);
          if (
            current?.kind === 'pending' &&
            current.promise === handle.promise
          ) {
            const time = now();
            entries.set(key, {
              kind: 'resolved',
              generation,
              storageId: prepared.storageId,
              optimizerVersion: prepared.optimizerVersion,
              expiresAt: time + ttlMs,
              lastUsed: time,
            });
          }
          return prepared;
        },
        (error: unknown) => {
          const current = entries.get(key);
          if (
            current?.kind === 'pending' &&
            current.promise === handle.promise
          ) {
            entries.delete(key);
          }
          throw error;
        },
      );
      const promise = handle.promise;
      entries.set(key, { kind: 'pending', generation, promise });
      return promise;
    },
    snapshot(): SourceArtworkCacheSnapshot {
      return [...entries.entries()].map(([key, entry]) => {
        if (entry.kind === 'pending') {
          return { key, kind: 'pending' as const };
        }
        return {
          key,
          kind: 'resolved' as const,
          storageId: entry.storageId,
          optimizerVersion: entry.optimizerVersion,
        };
      });
    },
  };
}

export type SourceArtworkReuseCache = ReturnType<
  typeof createSourceArtworkReuseCache
>;

export const sourceArtworkReuseCache = createSourceArtworkReuseCache();

async function obtainPreparedArtwork(
  cache: SourceArtworkReuseCache,
  key: string,
  failedGeneration: number | undefined,
  deps: {
    prepare: () => Promise<PreparedSource>;
    validate: (prepared: PreparedSource) => Promise<SourceReuseStatus>;
  },
): Promise<{ source: PreparedSource; generation: number | undefined }> {
  let invalidateGeneration = failedGeneration;
  while (true) {
    if (invalidateGeneration !== undefined) {
      cache.invalidate(key, invalidateGeneration);
      invalidateGeneration = undefined;
    }
    const resolved = cache.readResolved(key);
    const generation = resolved === null ? undefined : cache.generationOf(key);
    if (resolved === null || generation === undefined) {
      const promise = cache.prepare(key, deps.prepare);
      const preparedGeneration = cache.generationOf(key);
      const source = await promise;
      return { source, generation: preparedGeneration };
    }
    const status = await deps.validate(resolved);
    if (cache.generationOf(key) !== generation) {
      continue;
    }
    if (
      status.reusable &&
      status.optimizerVersion === resolved.optimizerVersion
    ) {
      cache.touch(key);
      return { source: resolved, generation };
    }
    invalidateGeneration = generation;
  }
}

export async function persistArtworkExport<TSnapshot>(args: {
  cache: SourceArtworkReuseCache;
  convexUrl: string;
  sourceBytes: Buffer;
  snapshot: TSnapshot;
  exportFormat: 'png' | 'jpg';
  exportPixelRatio: 1 | 2;
  prepare: () => Promise<PreparedSource>;
  validate: (prepared: PreparedSource) => Promise<SourceReuseStatus>;
  insert: (record: {
    snapshot: TSnapshot;
    exportFormat: 'png' | 'jpg';
    exportPixelRatio: 1 | 2;
    sourceImageStorageId: string;
    sourceOptimizerVersion: string;
  }) => Promise<void>;
}): Promise<void> {
  const key = sourceArtworkCacheKey(
    args.convexUrl,
    hashSourceArtwork(args.sourceBytes),
  );
  const deps = {
    prepare: args.prepare,
    validate: args.validate,
  };
  let failedGeneration: number | undefined;
  try {
    const obtained = await obtainPreparedArtwork(
      args.cache,
      key,
      undefined,
      deps,
    );
    failedGeneration = obtained.generation;
    await args.insert({
      snapshot: args.snapshot,
      exportFormat: args.exportFormat,
      exportPixelRatio: args.exportPixelRatio,
      sourceImageStorageId: obtained.source.storageId,
      sourceOptimizerVersion: obtained.source.optimizerVersion,
    });
  } catch (error: unknown) {
    if (!isRetryableSourceReuseError(error)) {
      throw error;
    }
    const obtained = await obtainPreparedArtwork(
      args.cache,
      key,
      failedGeneration,
      deps,
    );
    await args.insert({
      snapshot: args.snapshot,
      exportFormat: args.exportFormat,
      exportPixelRatio: args.exportPixelRatio,
      sourceImageStorageId: obtained.source.storageId,
      sourceOptimizerVersion: obtained.source.optimizerVersion,
    });
  }
}
