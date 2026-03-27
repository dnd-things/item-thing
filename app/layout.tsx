import { fetchQuery } from 'convex/nextjs';
import type { Metadata } from 'next';
import {
  Cormorant_Garamond,
  DM_Sans,
  Geist_Mono,
  Outfit,
} from 'next/font/google';
import { ConvexClientProvider } from '@/app/convex-client-provider';
import { api } from '@/convex/_generated/api';
import './globals.css';
import { Analytics } from '@vercel/analytics/next';
import { serverLogger } from '@/lib/server-logger';
import { cn } from '@/lib/utils';

const dmSans = DM_Sans({ subsets: ['latin'], variable: '--font-sans' });

const outfit = Outfit({
  subsets: ['latin'],
  variable: '--font-display',
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

const cormorantGaramond = Cormorant_Garamond({
  weight: ['400', '600'],
  subsets: ['latin'],
  variable: '--font-cormorant-garamond',
});

export const metadata: Metadata = {
  title: 'Item Thing',
  description: 'Forge beautiful magic item cards for your tabletop adventures',
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Ping health endpoint on each page load
  void fetchQuery(api.health.health, {
    checkDb: true,
  })
    .then((result) => {
      serverLogger.debug({ result }, 'health check succeeded');
    })
    .catch((error) => {
      serverLogger.error({ err: error }, 'health check failed');
    })
    .finally(() => {
      serverLogger.debug('health check completed');
    });

  return (
    <html
      lang="en"
      className={cn(
        'font-sans dark',
        dmSans.variable,
        outfit.variable,
        geistMono.variable,
        cormorantGaramond.variable,
      )}
    >
      <body className="antialiased">
        <ConvexClientProvider>{children}</ConvexClientProvider>
        <Analytics />
      </body>
    </html>
  );
}
