import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import {
  isApiRequestAuthorizedBySecret,
  isInternalRequestAuthorizedBySecret,
} from '@/features/server-render-card/render-card-secret-auth';

interface ApiRequestLogPayload {
  method: string;
  pathname: string;
  search: string;
  headers: Record<string, string>;
}

function headersToRecord(headers: Headers): Record<string, string> {
  return Object.fromEntries(headers.entries());
}

export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  if (pathname.startsWith('/api/') && request.method !== 'OPTIONS') {
    const payload: ApiRequestLogPayload = {
      method: request.method,
      pathname,
      search: request.nextUrl.search,
      headers: headersToRecord(request.headers),
    };
    console.log('[api]', JSON.stringify(payload));
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
      console.log('[api/render-card]', { error: 'unauthorized' });
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
    return NextResponse.next();
  }

  if (pathname.startsWith('/internal')) {
    console.log('[internal]', request.headers.get('x-internal-secret'));
    const secret = process.env.INTERNAL_SECRET;
    if (secret === undefined || secret.length === 0) {
      return NextResponse.json({ error: 'unconfigured' }, { status: 503 });
    }
    if (!isInternalRequestAuthorizedBySecret(request, secret)) {
      console.log('[internal]', { error: 'unauthorized' });
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/internal/:path*', '/api/:path*'],
};
