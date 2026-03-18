import { fetchQuery } from 'convex/nextjs';
import type { Metadata } from 'next';
import { Figtree, Geist, Geist_Mono } from 'next/font/google';
import { api } from '@/convex/_generated/api';
import './globals.css';
import { Analytics } from '@vercel/analytics/next';
import { cn } from '@/lib/utils';

const figtree = Figtree({ subsets: ['latin'], variable: '--font-sans' });

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Item thing',
  description: 'Small tool for creating and managing magic item cards',
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
      console.log('Health check succeeded', result);
    })
    .catch((error) => {
      console.error('Health check failed', error);
    })
    .finally(() => {
      console.log('Health check completed');
    });

  return (
    <html lang="en" className={cn('font-sans', figtree.variable)}>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
        <Analytics />
      </body>
    </html>
  );
}
