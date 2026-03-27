import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import {
  isApiRequestAuthorizedBySecret,
  isInternalRequestAuthorizedBySecret,
} from '@/features/server-render-card/render-card-secret-auth';
import { serverLogger } from '@/lib/server-logger';

interface SafeApiRequestLogPayload {
  method: string;
  pathname: string;
  search: string;
  hasAuthorizationHeader: boolean;
  hasCookieHeader: boolean;
  hasApiSecretHeader: boolean;
  hasInternalSecretHeader: boolean;
}

function buildSafeApiRequestLogPayload(
  request: NextRequest,
): SafeApiRequestLogPayload {
  const headers = request.headers;
  return {
    method: request.method,
    pathname: request.nextUrl.pathname,
    search: request.nextUrl.search,
    hasAuthorizationHeader: headers.has('authorization'),
    hasCookieHeader: headers.has('cookie'),
    hasApiSecretHeader: headers.has('x-api-secret'),
    hasInternalSecretHeader: headers.has('x-internal-secret'),
  };
}

export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  if (pathname.startsWith('/api/') && request.method !== 'OPTIONS') {
    serverLogger.debug(
      { request: buildSafeApiRequestLogPayload(request) },
      '[api] request',
    );
  }

  if (request.method === 'OPTIONS') {
    return NextResponse.next();
  }

  if (pathname.startsWith('/api/render-card')) {
    const secret = process.env.API_SECRET;
    if (secret === undefined || secret.length === 0) {
      return NextResponse.json({ error: 'unconfigured' }, { status: 503 });
    }
    if (!isApiRequestAuthorizedBySecret(request, secret)) {
      serverLogger.info({ route: 'api/render-card' }, 'unauthorized');
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
    return NextResponse.next();
  }

  if (pathname.startsWith('/internal')) {
    const secret = process.env.INTERNAL_SECRET;
    if (secret === undefined || secret.length === 0) {
      return NextResponse.json({ error: 'unconfigured' }, { status: 503 });
    }
    if (!isInternalRequestAuthorizedBySecret(request, secret)) {
      serverLogger.info({ route: 'internal' }, 'unauthorized');
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/internal/:path*', '/api/:path*'],
};
