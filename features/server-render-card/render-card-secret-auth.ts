const API_SECRET_HEADER = 'x-api-secret';
const INTERNAL_SECRET_HEADER = 'x-internal-secret';

function getBearerToken(request: Pick<Request, 'headers'>): string | null {
  const authorization = request.headers.get('authorization');
  return authorization?.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length)
    : null;
}

export function isApiRequestAuthorizedBySecret(
  request: Pick<Request, 'headers'>,
  secret: string,
): boolean {
  const bearer = getBearerToken(request);
  const headerSecret = request.headers.get(API_SECRET_HEADER);
  return bearer === secret || headerSecret === secret;
}

export function isInternalRequestAuthorizedBySecret(
  request: Pick<Request, 'headers'>,
  secret: string,
): boolean {
  const bearer = getBearerToken(request);
  const headerSecret = request.headers.get(INTERNAL_SECRET_HEADER);

  console.log('[isInternalRequestAuthorizedBySecret]', {
    bearer,
    headerSecret,
    secret,
  });

  return bearer === secret || headerSecret === secret;
}

export function getApiSecretOrThrow(): string {
  const secret = process.env.API_SECRET;
  if (secret === undefined || secret.length === 0) {
    throw new Error('API_SECRET is not configured');
  }
  return secret;
}

export function getInternalSecretOrThrow(): string {
  const secret = process.env.INTERNAL_SECRET;
  if (secret === undefined || secret.length === 0) {
    throw new Error('INTERNAL_SECRET is not configured');
  }
  return secret;
}
