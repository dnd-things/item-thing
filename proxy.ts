import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import {
  isApiRequestAuthorizedBySecret,
  isInternalRequestAuthorizedBySecret,
} from '@/features/server-render-card/render-card-secret-auth';

export function proxy(request: NextRequest) {
  if (request.method === 'OPTIONS') {
    return NextResponse.next();
  }

  const pathname = request.nextUrl.pathname;

  if (pathname.startsWith('/api/render-card')) {
    const secret = process.env.API_SECRET;
    if (secret === undefined || secret.length === 0) {
      return NextResponse.json({ error: 'unconfigured' }, { status: 503 });
    }
    if (!isApiRequestAuthorizedBySecret(request, secret)) {
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
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/internal/:path*', '/api/render-card'],
};
