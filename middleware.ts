import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

interface ApiRequestLogPayload {
  method: string;
  pathname: string;
  search: string;
  headers: Record<string, string>;
}

function headersToRecord(headers: Headers): Record<string, string> {
  return Object.fromEntries(headers.entries());
}

export function middleware(request: NextRequest): NextResponse {
  const payload: ApiRequestLogPayload = {
    method: request.method,
    pathname: request.nextUrl.pathname,
    search: request.nextUrl.search,
    headers: headersToRecord(request.headers),
  };
  console.log('[api]', JSON.stringify(payload));
  return NextResponse.next();
}

export const config = {
  matcher: '/api/:path*',
};
