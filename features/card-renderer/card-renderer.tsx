'use client';

import { PrintMagicItemCard } from './components/print-magic-item-card';
import {
  isCardStyleSupported,
  type MagicItemCardRendererProps,
} from './lib/card-renderer-options';

export interface CardRendererProps extends MagicItemCardRendererProps {
  className?: string;
  /** Measured preview card height (px) for fixed image-right margin scaling; omit when unknown. */
  cardPreviewSurfaceHeightPx?: number;
}

export function CardRenderer({ cardStyle, ...rest }: CardRendererProps) {
  if (!isCardStyleSupported(cardStyle)) {
    return null;
  }

  return <PrintMagicItemCard cardStyle={cardStyle} {...rest} />;
}
