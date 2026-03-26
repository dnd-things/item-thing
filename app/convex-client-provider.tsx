'use client';

import { ConvexProvider, ConvexReactClient } from 'convex/react';
import type { ReactNode } from 'react';
import { clientEnv } from '@/lib/client-env';

const convexReactClient = new ConvexReactClient(
  clientEnv.NEXT_PUBLIC_CONVEX_URL,
);

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  return <ConvexProvider client={convexReactClient}>{children}</ConvexProvider>;
}
