'use client';

import Image from 'next/image';
import { useMemo } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';
import {
  getCardSurfaceBorderRadius,
  type MagicItemCardRendererProps,
} from '../lib/card-renderer-options';

const MINIMAL_CARD_MAX_WIDTH_PX = 430;
const MINIMAL_BANNER_HEIGHT_PX = 52;
const MINIMAL_BANNER_WIDTH = 'clamp(244px, 64%, 292px)';
const MINIMAL_PANEL_BACKGROUND = '#f2f2f2';
const MINIMAL_FLAVOR_FONT_FAMILY =
  '"Segoe Script", "Snell Roundhand", "Brush Script MT", cursive';

function normalizeMechanicalDescriptionForMinimal(value: string): string {
  return value.replace(
    /^(?![-*#>|`])([A-Z][A-Za-z0-9\s'/(),+-]{0,40}):(?=\s+)/gm,
    '**$1:**',
  );
}

interface MinimalMagicItemCardProps extends MagicItemCardRendererProps {
  className?: string;
}

export function MinimalMagicItemCard({
  className,
  cardBorderRadius,
  imagePreviewUrl,
  imageFileName,
  itemName,
  classificationAndRarity,
  requiresAttunement,
  flavorDescription,
  mechanicalDescription,
}: MinimalMagicItemCardProps) {
  const surfaceBorderRadius = getCardSurfaceBorderRadius(cardBorderRadius);
  const normalizedMechanicalDescription = useMemo(
    () => normalizeMechanicalDescriptionForMinimal(mechanicalDescription),
    [mechanicalDescription],
  );

  const bannerLabel = classificationAndRarity.trim() || 'Magic item';
  const footerLabel = requiresAttunement ? 'Requires attunement' : bannerLabel;
  const artworkAltText = itemName || imageFileName || 'Magic item artwork';
  const hasFlavorDescription = flavorDescription.trim().length > 0;

  return (
    <div
      className={cn(
        'relative isolate w-full overflow-hidden bg-[#f2f2f2] text-slate-950 shadow-[0_22px_70px_rgba(15,23,42,0.24)]',
        className,
      )}
      style={{
        maxWidth: MINIMAL_CARD_MAX_WIDTH_PX,
        aspectRatio: '2 / 3',
        borderRadius: surfaceBorderRadius,
      }}
    >
      <div className="flex h-full flex-col">
        <section className="relative flex-[1_1_62%] overflow-hidden bg-[#292c4d]">
          <div className="absolute inset-0 bg-[linear-gradient(160deg,#1f2240_0%,#2f315a_28%,#5a4f8a_60%,#3b3566_100%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_22%_18%,rgba(255,255,255,0.12),transparent_34%),radial-gradient(circle_at_76%_24%,rgba(168,148,255,0.18),transparent_30%),radial-gradient(circle_at_54%_78%,rgba(12,15,35,0.28),transparent_38%),radial-gradient(circle_at_34%_60%,rgba(243,245,255,0.08),transparent_32%)]" />
          <div className="absolute inset-0 opacity-30 mix-blend-screen [background-image:radial-gradient(rgba(255,255,255,0.12)_0.8px,transparent_0.8px)] [background-position:0_0,9px_9px] [background-size:18px_18px]" />
          <div className="absolute inset-x-0 bottom-0 top-0 flex items-center justify-center px-8 pb-8 pt-10">
            {imagePreviewUrl.trim() !== '' ? (
              <div className="relative h-full w-full max-w-[84%]">
                <Image
                  alt={artworkAltText}
                  className="object-contain drop-shadow-[0_22px_34px_rgba(7,10,22,0.34)]"
                  fill
                  sizes="(max-width: 768px) 80vw, 360px"
                  src={imagePreviewUrl}
                  unoptimized
                />
              </div>
            ) : (
              <div className="flex h-full w-full max-w-[84%] items-center justify-center rounded-[2rem] border border-white/14 bg-white/6 px-8 text-center text-sm font-medium tracking-[0.18em] uppercase text-white/70 backdrop-blur-sm">
                Add artwork
              </div>
            )}
          </div>
        </section>

        <section
          className="relative flex min-h-0 flex-[1_1_38%] flex-col px-7 pb-4 pt-14"
          style={{ backgroundColor: MINIMAL_PANEL_BACKGROUND }}
        >
          <div
            aria-hidden
            className="absolute inset-x-0 top-0 h-9"
            style={{
              backgroundColor: MINIMAL_PANEL_BACKGROUND,
              clipPath:
                'polygon(0 100%, 0 44%, calc(50% - 118px) 44%, calc(50% - 84px) 0, calc(50% + 84px) 0, calc(50% + 118px) 44%, 100% 44%, 100% 100%)',
            }}
          />

          <div className="relative z-10 flex min-h-0 flex-1 flex-col">
            <h3 className="text-center text-[1.95rem] leading-[1.02] font-bold tracking-[0.08em] text-balance uppercase text-slate-950">
              {itemName || 'Untitled item'}
            </h3>

            {hasFlavorDescription ? (
              <p
                className="mt-3 text-center text-[1.02rem] leading-6 text-slate-700"
                style={{ fontFamily: MINIMAL_FLAVOR_FONT_FAMILY }}
              >
                {flavorDescription}
              </p>
            ) : null}

            <div className="mt-4 min-h-0 flex-1 text-left text-[0.93rem] leading-[1.45] text-slate-800 [&_p]:mb-2 [&_p:last-child]:mb-0 [&_ul]:mb-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:mb-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-0.5 [&_strong]:font-semibold [&_em]:italic [&_code]:rounded [&_code]:bg-slate-200/70 [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[0.78rem] [&_table]:my-3 [&_table]:w-full [&_table]:border-collapse [&_thead]:text-slate-600 [&_tbody_tr:not(:last-child)]:border-b [&_tbody_tr:not(:last-child)]:border-slate-300/60 [&_th]:px-2 [&_th]:py-1.5 [&_th]:text-left [&_th]:text-[0.72rem] [&_th]:font-semibold [&_th]:tracking-[0.12em] [&_th]:uppercase [&_td]:px-2 [&_td]:py-1.5 [&_td]:align-top">
              <Markdown remarkPlugins={[remarkGfm]}>
                {normalizedMechanicalDescription}
              </Markdown>
            </div>

            <footer className="mt-3 flex items-end justify-between gap-4 border-t border-slate-400/25 pt-3 text-[0.68rem] text-slate-500 uppercase">
              <div className="flex min-w-0 items-center gap-2">
                <span
                  aria-hidden
                  className="inline-flex size-4 shrink-0 items-center justify-center rounded-full border border-slate-500/55"
                >
                  <span className="size-1.5 rounded-full bg-slate-500/70" />
                </span>
                <span className="truncate tracking-[0.14em]">
                  {footerLabel}
                </span>
              </div>

              <div className="flex shrink-0 items-center gap-2 text-right tracking-[0.22em]">
                <span
                  aria-hidden
                  className="grid size-4 grid-cols-2 gap-[2px] rounded-[4px] border border-slate-500/45 p-[2px]"
                >
                  <span className="rounded-[1px] bg-slate-500/70" />
                  <span className="rounded-[1px] bg-slate-500/45" />
                  <span className="rounded-[1px] bg-slate-500/45" />
                  <span className="rounded-[1px] bg-slate-500/70" />
                </span>
                <span>Item Thing</span>
              </div>
            </footer>
          </div>
        </section>
      </div>

      <div
        className="absolute left-1/2 z-20 flex -translate-x-1/2 items-center justify-center px-4 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.55),inset_0_-2px_0_rgba(131,91,4,0.18),0_10px_16px_rgba(26,18,1,0.22)]"
        style={{
          top: 'calc(62% - 26px)',
          width: MINIMAL_BANNER_WIDTH,
          height: MINIMAL_BANNER_HEIGHT_PX,
          background:
            'linear-gradient(180deg, #f6d365 0%, #f1c232 56%, #d4a017 100%)',
          border: '1px solid #b89010',
          borderRadius: 18,
          clipPath:
            'polygon(8% 0%, 92% 0%, 100% 50%, 92% 100%, 8% 100%, 0% 50%)',
        }}
      >
        <span className="line-clamp-2 text-[0.68rem] leading-4 font-bold tracking-[0.18em] uppercase text-black">
          {bannerLabel}
        </span>
      </div>
    </div>
  );
}
