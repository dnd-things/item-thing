'use client';

import { toJpeg, toPng } from 'html-to-image';
import type { RefObject } from 'react';
import { useEffect, useRef, useState } from 'react';
import { CardRenderer } from '@/features/card-renderer/card-renderer';
import { resolveCardStyle } from '@/features/card-renderer/lib/card-style';
import type { CardExportBrowserPayload } from '@/features/server-render-card/card-export-payload';
import { executeCardRasterExport } from '@/features/workbench/lib/execute-card-raster-export';
import { waitForStableElementBox } from '@/features/workbench/lib/export-card-artwork';
import { serializeArtworkLimitError } from '@/lib/artwork-limit-error';

interface CardExportWindowGlobals {
  __MAGIC_ITEM_CARD_EXPORT__?: CardExportBrowserPayload;
  __CARD_EXPORT_STATUS__?: 'ok' | 'error';
  __CARD_EXPORT_RESULT__?: string;
  __CARD_EXPORT_ERROR__?: string;
}

function getCardExportGlobals(): CardExportWindowGlobals {
  return window as unknown as CardExportWindowGlobals;
}

function readInitialPayload(): CardExportBrowserPayload | null {
  if (typeof window === 'undefined') {
    return null;
  }
  const payload = getCardExportGlobals().__MAGIC_ITEM_CARD_EXPORT__;
  return payload ?? null;
}

async function rafOnce(): Promise<void> {
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

async function waitForNextAnimationFrames(count: number): Promise<void> {
  for (let i = 0; i < count; i++) {
    await rafOnce();
  }
}

const CARD_EXPORT_GENERATION = 1;

function exportFailureText(error: unknown): string {
  return (
    serializeArtworkLimitError(error) ??
    (error instanceof Error ? error.message : String(error))
  );
}

async function runExportPipeline(
  payload: CardExportBrowserPayload,
  cardRef: RefObject<HTMLDivElement | null>,
): Promise<void> {
  const globals = getCardExportGlobals();
  await document.fonts.ready;
  await waitForNextAnimationFrames(3);
  const node = cardRef.current;
  if (!node) {
    globals.__CARD_EXPORT_STATUS__ = 'error';
    globals.__CARD_EXPORT_ERROR__ = 'missing_card_node';
    return;
  }
  if (resolveCardStyle(payload.state.cardStyle).layout === 'pending') {
    globals.__CARD_EXPORT_STATUS__ = 'error';
    globals.__CARD_EXPORT_ERROR__ = 'unsupported_card_style';
    return;
  }
  const dataUrl = await executeCardRasterExport({
    node,
    format: payload.format,
    pixelRatio: payload.pixelRatio,
    generation: CARD_EXPORT_GENERATION,
    rasterizer: {
      toPng: (target, options) => toPng(target as HTMLElement, options),
      toJpeg: (target, options) => toJpeg(target as HTMLElement, options),
    },
    settleSize: waitForStableElementBox,
  });
  globals.__CARD_EXPORT_RESULT__ = dataUrl;
  globals.__CARD_EXPORT_STATUS__ = 'ok';
}

export function CardExportClient() {
  const cardRef = useRef<HTMLDivElement>(null);
  const [payload, setPayload] = useState<CardExportBrowserPayload | null>(null);

  useEffect(() => {
    const payloadFromWindow = readInitialPayload();
    if (payloadFromWindow === null) {
      const globals = getCardExportGlobals();
      globals.__CARD_EXPORT_STATUS__ = 'error';
      globals.__CARD_EXPORT_ERROR__ = 'missing_payload';
      return;
    }
    setPayload(payloadFromWindow);
  }, []);

  useEffect(() => {
    if (payload === null) {
      return;
    }

    const globals = getCardExportGlobals();
    const run = async () => {
      try {
        await runExportPipeline(payload, cardRef);
      } catch (error) {
        globals.__CARD_EXPORT_STATUS__ = 'error';
        globals.__CARD_EXPORT_ERROR__ = exportFailureText(error);
      }
    };

    void run();
  }, [payload]);

  if (payload === null) {
    return null;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-900 p-8">
      <div data-print-card ref={cardRef} className="relative">
        <CardRenderer
          {...payload.state}
          artworkDrawPolicy="export"
          exportGeneration={CARD_EXPORT_GENERATION}
        />
      </div>
    </div>
  );
}
