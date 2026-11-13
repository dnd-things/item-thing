import {
  artworkLimitCopy,
  assertDecodedArtworkDimensions,
  assertEncodedArtworkBytes,
  fitsDisplayBudget,
  type IntegerCrop,
  identityCrop,
  isIdentityCrop,
  isPositiveIntegerDimension,
} from './artwork-geometry';

export const ARTWORK_BUNDLE_VERSION = 1 as const;

const preparedFiles = new WeakSet<File>();

export interface ArtworkBundle {
  version: typeof ARTWORK_BUNDLE_VERSION;
  preview: Blob;
  source: Blob;
  sourceWidth: number;
  sourceHeight: number;
  crop: IntegerCrop;
}

export interface CanonicalArtwork {
  blob: Blob;
  mimeType: string;
  dataUrl: string;
}

export interface PreparedArtwork {
  previewBlob: Blob;
  sourceBlob: Blob;
  sourceWidth: number;
  sourceHeight: number;
  crop: IntegerCrop;
  aspectRatio: number;
}

const canonicalCache = new WeakMap<ArtworkBundle, Promise<CanonicalArtwork>>();

export function markPreparedFile(file: File): File {
  preparedFiles.add(file);
  return file;
}

export function isPreparedFile(file: File): boolean {
  return preparedFiles.has(file);
}

export function createArtworkBundle(input: {
  preview: Blob;
  source: Blob;
  sourceWidth: number;
  sourceHeight: number;
  crop: IntegerCrop;
}): ArtworkBundle {
  return {
    version: ARTWORK_BUNDLE_VERSION,
    preview: input.preview,
    source: input.source,
    sourceWidth: input.sourceWidth,
    sourceHeight: input.sourceHeight,
    crop: input.crop,
  };
}

function isImageMime(type: string): boolean {
  return type === '' || type.toLowerCase().startsWith('image/');
}

export function readArtworkBundle(value: unknown): ArtworkBundle | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const record = value as Partial<ArtworkBundle>;
  if (record.version !== ARTWORK_BUNDLE_VERSION) {
    return null;
  }
  if (!(record.preview instanceof Blob) || !(record.source instanceof Blob)) {
    return null;
  }
  if (record.preview.size <= 0 || record.source.size <= 0) {
    return null;
  }
  try {
    assertEncodedArtworkBytes(record.preview.size);
    assertEncodedArtworkBytes(record.source.size);
  } catch {
    return null;
  }
  if (!isImageMime(record.preview.type) || !isImageMime(record.source.type)) {
    return null;
  }
  const sourceWidth = record.sourceWidth;
  const sourceHeight = record.sourceHeight;
  if (typeof sourceWidth !== 'number' || typeof sourceHeight !== 'number') {
    return null;
  }
  try {
    assertDecodedArtworkDimensions(sourceWidth, sourceHeight);
  } catch {
    return null;
  }
  const crop = record.crop;
  if (!crop || typeof crop !== 'object') {
    return null;
  }
  const { left, top, width, height } = crop;
  if (
    !isPositiveIntegerDimension(width) ||
    !isPositiveIntegerDimension(height) ||
    !Number.isInteger(left) ||
    !Number.isInteger(top) ||
    left < 0 ||
    top < 0 ||
    left + width > sourceWidth ||
    top + height > sourceHeight
  ) {
    return null;
  }
  return {
    version: ARTWORK_BUNDLE_VERSION,
    preview: record.preview,
    source: record.source,
    sourceWidth,
    sourceHeight,
    crop: { left, top, width, height },
  };
}

export function bundleFromLegacyBlob(
  blob: Blob,
  width: number,
  height: number,
  preview: Blob = blob,
): ArtworkBundle {
  assertEncodedArtworkBytes(blob.size);
  assertDecodedArtworkDimensions(width, height);
  return createArtworkBundle({
    preview,
    source: blob,
    sourceWidth: width,
    sourceHeight: height,
    crop: identityCrop(width, height),
  });
}

export function legacyBlobNeedsResize(width: number, height: number): boolean {
  return !fitsDisplayBudget(width, height);
}

export interface CanonicalArtworkDeps {
  readDataUrl: (blob: Blob) => Promise<string>;
  decodeDimensions: (
    blob: Blob,
  ) => Promise<{ width: number; height: number } | null>;
  rasterizeCrop: (bundle: ArtworkBundle) => Promise<Blob>;
}

async function createCanonicalArtwork(
  bundle: ArtworkBundle,
  deps: CanonicalArtworkDeps,
): Promise<CanonicalArtwork> {
  const decoded = await deps.decodeDimensions(bundle.source);
  if (
    !decoded ||
    decoded.width !== bundle.sourceWidth ||
    decoded.height !== bundle.sourceHeight
  ) {
    throw new Error(artworkLimitCopy.sourceMismatch);
  }
  if (isIdentityCrop(bundle.crop, bundle.sourceWidth, bundle.sourceHeight)) {
    const mimeType =
      bundle.source.type.trim() !== '' ? bundle.source.type : 'image/png';
    return {
      blob: bundle.source,
      mimeType,
      dataUrl: await deps.readDataUrl(bundle.source),
    };
  }
  const cropped = await deps.rasterizeCrop(bundle);
  return {
    blob: cropped,
    mimeType: 'image/png',
    dataUrl: await deps.readDataUrl(cropped),
  };
}

export function materializeCanonicalArtwork(
  bundle: ArtworkBundle,
  deps: CanonicalArtworkDeps,
): Promise<CanonicalArtwork> {
  const cached = canonicalCache.get(bundle);
  if (cached) {
    return cached;
  }
  const pending = createCanonicalArtwork(bundle, deps).catch(
    (error: unknown) => {
      canonicalCache.delete(bundle);
      throw error;
    },
  );
  canonicalCache.set(bundle, pending);
  return pending;
}

export function dropCanonicalArtwork(bundle: ArtworkBundle): void {
  canonicalCache.delete(bundle);
}

export function createArtworkReadGate<T>(
  read: (file: File, isCancelled: () => boolean) => Promise<T>,
): {
  submit: (file: File, isCancelled: () => boolean) => Promise<T>;
} {
  let active: Promise<void> | null = null;
  let latest: {
    file: File;
    isCancelled: () => boolean;
    resolve: (value: T) => void;
    reject: (reason: unknown) => void;
  } | null = null;

  const abortError = () =>
    new DOMException('The operation was aborted.', 'AbortError');

  const pump = () => {
    if (active) {
      return;
    }
    const job = latest;
    latest = null;
    if (!job) {
      return;
    }
    const execute = async () => {
      try {
        if (job.isCancelled()) {
          job.reject(abortError());
          return;
        }
        const result = await read(job.file, job.isCancelled);
        if (job.isCancelled()) {
          job.reject(abortError());
          return;
        }
        job.resolve(result);
      } catch (error) {
        job.reject(error);
      } finally {
        active = null;
        pump();
      }
    };
    active = Promise.resolve().then(execute);
  };

  return {
    submit(file, isCancelled) {
      const previous = latest;
      if (previous) {
        previous.reject(abortError());
      }
      return new Promise<T>((resolve, reject) => {
        latest = { file, isCancelled, resolve, reject };
        pump();
      });
    },
  };
}

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}
