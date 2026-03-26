'use client';

import { toJpeg, toPng } from 'html-to-image';
import type { RefObject } from 'react';
import { useEffect, useRef, useState } from 'react';
import { CardRenderer } from '@/features/card-renderer/card-renderer';
import { isCardStyleSupported } from '@/features/card-renderer/lib/card-renderer-options';
import type { CardExportBrowserPayload } from '@/features/server-render-card/card-export-payload';

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

async function waitForImagesInNode(node: HTMLElement): Promise<void> {
  const imgs = node.querySelectorAll('img');
  await Promise.all(
    [...imgs].map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete) {
            resolve();
            return;
          }
          img.onload = () => resolve();
          img.onerror = () => resolve();
        }),
    ),
  );
}

async function runHtmlToImageExport(params: {
  node: HTMLElement;
  format: 'png' | 'jpg';
  pixelRatio: 1 | 2;
}): Promise<string> {
  if (params.format === 'png') {
    return await toPng(params.node, { pixelRatio: params.pixelRatio });
  }
  return await toJpeg(params.node, {
    pixelRatio: params.pixelRatio,
    quality: 0.92,
  });
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
  if (!isCardStyleSupported(payload.state.cardStyle)) {
    globals.__CARD_EXPORT_STATUS__ = 'error';
    globals.__CARD_EXPORT_ERROR__ = 'unsupported_card_style';
    return;
  }
  await waitForImagesInNode(node);
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 200);
  });
  const dataUrl = await runHtmlToImageExport({
    node,
    format: payload.format,
    pixelRatio: payload.pixelRatio,
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
        globals.__CARD_EXPORT_ERROR__ =
          error instanceof Error ? error.message : String(error);
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
        <CardRenderer {...payload.state} />
      </div>
    </div>
  );
}
