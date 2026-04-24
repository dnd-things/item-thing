'use client';

import Image from 'next/image';
import { type CSSProperties, useMemo } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';
import {
  getCardImageDimensions,
  getResolvedCardWidthPx,
  type MagicItemCardRendererProps,
} from '../lib/card-renderer-options';
import { useFlippedImagePreviewUrl } from '../lib/use-flipped-image-preview-url';
import { useMinimalArtworkTheme } from '../lib/use-minimal-artwork-theme';
import styles from './minimal-magic-item-card.module.css';

const MINIMAL_BANNER_WIDTH = 'clamp(244px, 64%, 292px)';
const MINIMAL_PANEL_BACKGROUND = '#f2f2f2';
const MINIMAL_FLAVOR_FONT_FAMILY =
  '"Segoe Script", "Snell Roundhand", "Brush Script MT", cursive';
const MINIMAL_ARTWORK_ASPECT_RATIO_FALLBACK = 1;
const MINIMAL_ARTWORK_ASPECT_RATIO_MIN = 0.72;
const MINIMAL_ARTWORK_ASPECT_RATIO_MAX = 1.9;

function clampMinimalArtworkAspectRatio(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return MINIMAL_ARTWORK_ASPECT_RATIO_FALLBACK;
  }
  return Math.min(
    MINIMAL_ARTWORK_ASPECT_RATIO_MAX,
    Math.max(MINIMAL_ARTWORK_ASPECT_RATIO_MIN, value),
  );
}

function getMinimalArtworkFrameWidth(aspectRatio: number): string {
  if (aspectRatio >= 1.45) {
    return '84%';
  }
  if (aspectRatio >= 1.05) {
    return '76%';
  }
  return '64%';
}

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
  cardWidthAuto,
  cardWidthPx,
  imageSize,
  imagePreviewUrl,
  imageFileName,
  resolvedImageAspectRatio,
  imageRotationDegrees,
  imageFlipHorizontal,
  imageFlipVertical,
  artworkColorSource,
  artworkCustomColor,
  itemName,
  classificationAndRarity,
  requiresAttunement,
  flavorDescription,
  mechanicalDescription,
}: MinimalMagicItemCardProps) {
  const normalizedMechanicalDescription = useMemo(
    () => normalizeMechanicalDescriptionForMinimal(mechanicalDescription),
    [mechanicalDescription],
  );

  const bannerLabel = classificationAndRarity.trim() || 'Magic item';
  const artworkAltText = itemName || imageFileName || 'Magic item artwork';
  const hasFlavorDescription = flavorDescription.trim().length > 0;
  const artworkAspectRatio = clampMinimalArtworkAspectRatio(
    resolvedImageAspectRatio,
  );
  const decoBannerClassName = styles.decoBanner;
  const decoBannerCapClassName = styles.decoBannerCap;
  const decoBannerCapLeftClassName = styles.decoBannerCapLeft;
  const decoBannerCapRightClassName = styles.decoBannerCapRight;
  const decoBannerLabelClassName = styles.decoBannerLabel;
  const renderImageUrl = useFlippedImagePreviewUrl(
    imagePreviewUrl,
    imageRotationDegrees,
    imageFlipHorizontal,
    imageFlipVertical,
  );
  const { theme: artworkTheme } = useMinimalArtworkTheme(
    renderImageUrl,
    artworkColorSource,
    artworkCustomColor,
  );
  const resolvedCardWidthPx = getResolvedCardWidthPx(
    'vertical',
    cardWidthAuto,
    cardWidthPx,
  );
  const cardImageDimensions = getCardImageDimensions(
    imageSize,
    'based-on-image',
    artworkAspectRatio,
    0,
  );
  const minimalCardStyle = {
    maxWidth: resolvedCardWidthPx,
    borderRadius: 0,
    ['--minimal-hero-base' as string]: artworkTheme.base,
    ['--minimal-hero-highlight' as string]: artworkTheme.highlight,
    ['--minimal-hero-shadow' as string]: artworkTheme.shadow,
    ['--minimal-hero-grid' as string]: artworkTheme.grid,
    ['--minimal-hero-glow' as string]: artworkTheme.glow,
    ['--minimal-hero-accent-glow' as string]: artworkTheme.accentGlow,
  } satisfies CSSProperties;

  return (
    <div
      className={cn(
        styles.minimalCard,
        'relative isolate w-full overflow-hidden bg-[#f2f2f2] text-slate-950 shadow-[0_22px_70px_rgba(15,23,42,0.24)]',
        className,
      )}
      style={minimalCardStyle}
    >
      <div aria-hidden className={styles.artDecoCardBorder}>
        <span
          className={cn(
            styles.artDecoCardCorner,
            styles.artDecoCardCornerTopLeft,
          )}
        />
        <span
          className={cn(
            styles.artDecoCardCorner,
            styles.artDecoCardCornerTopRight,
          )}
        />
        <span
          className={cn(
            styles.artDecoCardCorner,
            styles.artDecoCardCornerBottomLeft,
          )}
        />
        <span
          className={cn(
            styles.artDecoCardCorner,
            styles.artDecoCardCornerBottomRight,
          )}
        />
      </div>

      <div className="flex flex-col">
        <section className={cn(styles.heroPanel, 'relative px-8 pb-14 pt-10')}>
          <div aria-hidden className={styles.heroGradientLayer} />
          <div aria-hidden className={styles.heroAtmosphereLayer} />
          <div aria-hidden className={styles.heroGridLayer} />
          <div className="relative flex items-center justify-center">
            {renderImageUrl.trim() !== '' ? (
              <div
                className="relative"
                style={{
                  width: cardImageDimensions.width,
                  height: cardImageDimensions.height,
                  maxWidth: getMinimalArtworkFrameWidth(artworkAspectRatio),
                  minHeight: 220,
                  maxHeight: 390,
                }}
              >
                <Image
                  alt={artworkAltText}
                  className="object-contain drop-shadow-[0_22px_34px_rgba(7,10,22,0.34)]"
                  fill
                  sizes="(max-width: 768px) 80vw, 360px"
                  src={renderImageUrl}
                  unoptimized
                />
              </div>
            ) : (
              <div
                className="flex items-center justify-center rounded-[2rem] border border-white/14 bg-white/6 px-8 text-center text-sm font-medium tracking-[0.18em] uppercase text-white/70 backdrop-blur-sm"
                style={{
                  width: cardImageDimensions.width,
                  height: Math.max(cardImageDimensions.height, 240),
                  maxWidth: '76%',
                }}
              >
                Add artwork
              </div>
            )}
          </div>

          <div
            className={cn(
              decoBannerClassName,
              'absolute! m-0! bottom-0 left-1/2 z-20 -translate-x-1/2 translate-y-1/2 text-center',
            )}
            style={{
              width: MINIMAL_BANNER_WIDTH,
            }}
          >
            <span
              aria-hidden
              className={cn(decoBannerCapClassName, decoBannerCapLeftClassName)}
            />
            <span
              aria-hidden
              className={cn(
                decoBannerCapClassName,
                decoBannerCapRightClassName,
              )}
            />
            <span
              className={cn(
                decoBannerLabelClassName,
                'line-clamp-2 text-[0.64rem] leading-[0.95rem] font-bold tracking-[0.18em] uppercase text-black',
              )}
            >
              {bannerLabel}
            </span>
          </div>
        </section>

        <section
          className="relative flex flex-col px-8 pb-7 pt-14"
          style={{ backgroundColor: MINIMAL_PANEL_BACKGROUND }}
        >
          <div
            aria-hidden
            className="absolute inset-x-0 top-0 h-5"
            style={{
              backgroundColor: MINIMAL_PANEL_BACKGROUND,
              clipPath:
                'polygon(0 100%, 0 50%, calc(50% - 120px) 50%, calc(50% - 96px) 0, calc(50% + 96px) 0, calc(50% + 120px) 50%, 100% 50%, 100% 100%)',
            }}
          />

          <div className="relative z-10 flex flex-col">
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

            <div className="mt-4 text-left text-[0.93rem] leading-[1.45] text-slate-800 [&_p]:mb-2 [&_p:last-child]:mb-0 [&_ul]:mb-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:mb-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-0.5 [&_strong]:font-semibold [&_em]:italic [&_code]:rounded [&_code]:bg-slate-200/70 [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[0.78rem] [&_table]:my-3 [&_table]:w-full [&_table]:border-collapse [&_thead]:text-slate-600 [&_tbody_tr:not(:last-child)]:border-b [&_tbody_tr:not(:last-child)]:border-slate-300/60 [&_th]:px-2 [&_th]:py-1.5 [&_th]:text-left [&_th]:text-[0.72rem] [&_th]:font-semibold [&_th]:tracking-[0.12em] [&_th]:uppercase [&_td]:px-2 [&_td]:py-1.5 [&_td]:align-top">
              <Markdown remarkPlugins={[remarkGfm]}>
                {normalizedMechanicalDescription}
              </Markdown>
            </div>

            {requiresAttunement ? (
              <footer className="mt-4 flex min-h-[1.95rem] max-w-full items-center justify-center gap-[0.72rem] px-[1.05rem] py-[0.28rem]">
                <span
                  aria-hidden
                  className="ml-[0.08rem] size-[0.36rem] shrink-0 rotate-45 border border-[color:color-mix(in_srgb,var(--minimal-card-gold)_58%,white_42%)]"
                />
                <span className="max-w-full text-center text-[0.63rem] leading-[1.1] font-normal tracking-[0.16em] text-[color:color-mix(in_srgb,#475569_82%,#0f172a_18%)] uppercase text-balance">
                  Requires attunement
                </span>
                <span
                  aria-hidden
                  className="mr-[0.08rem] size-[0.36rem] shrink-0 rotate-45 border border-[color:color-mix(in_srgb,var(--minimal-card-gold)_58%,white_42%)]"
                />
              </footer>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}
