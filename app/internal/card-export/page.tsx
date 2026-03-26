'use client';

import dynamic from 'next/dynamic';

const CardExportClient = dynamic(
  () =>
    import('./card-export-client').then((module) => module.CardExportClient),
  { ssr: false },
);

export default function InternalCardExportPage() {
  return <CardExportClient />;
}
