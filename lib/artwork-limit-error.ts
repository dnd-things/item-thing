export type ArtworkLimitCode =
  | 'encoded_bytes'
  | 'source_dimensions'
  | 'card_output';

export class ArtworkLimitError extends Error {
  readonly kind = 'artwork-limit' as const;
  readonly code: ArtworkLimitCode;

  constructor(code: ArtworkLimitCode, message: string) {
    super(message);
    this.name = 'ArtworkLimitError';
    this.code = code;
  }
}

export function readArtworkLimitError(
  error: unknown,
): { code: ArtworkLimitCode; message: string } | null {
  if (!error || typeof error !== 'object') {
    return null;
  }
  const record = error as {
    kind?: unknown;
    name?: unknown;
    code?: unknown;
    message?: unknown;
  };
  const typed =
    error instanceof ArtworkLimitError ||
    record.kind === 'artwork-limit' ||
    record.name === 'ArtworkLimitError';
  if (!typed) {
    return null;
  }
  if (
    record.code !== 'encoded_bytes' &&
    record.code !== 'source_dimensions' &&
    record.code !== 'card_output'
  ) {
    return null;
  }
  if (typeof record.message !== 'string' || record.message.trim() === '') {
    return null;
  }
  return { code: record.code, message: record.message };
}

export function artworkLimitHttpResponse(error: unknown): {
  status: 422;
  body: {
    error: 'artwork_too_large' | 'card_output_too_large';
    message: string;
  };
} | null {
  const limit = readArtworkLimitError(error);
  if (!limit) {
    return null;
  }
  return {
    status: 422,
    body: {
      error:
        limit.code === 'card_output'
          ? 'card_output_too_large'
          : 'artwork_too_large',
      message: limit.message,
    },
  };
}

export function serializeArtworkLimitError(error: unknown): string | null {
  const limit = readArtworkLimitError(error);
  if (!limit) {
    return null;
  }
  return JSON.stringify({
    kind: 'artwork-limit',
    code: limit.code,
    message: limit.message,
  });
}

export function artworkLimitErrorFromSerialized(
  value: string | undefined,
): ArtworkLimitError | null {
  if (!value || !value.startsWith('{')) {
    return null;
  }
  try {
    const limit = readArtworkLimitError(JSON.parse(value) as unknown);
    if (!limit) {
      return null;
    }
    return new ArtworkLimitError(limit.code, limit.message);
  } catch {
    return null;
  }
}
