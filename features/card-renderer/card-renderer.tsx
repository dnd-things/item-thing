'use client';

import { MinimalMagicItemCard } from './components/minimal-magic-item-card';
import { PrintMagicItemCard } from './components/print-magic-item-card';
import type { MagicItemCardRendererProps } from './lib/card-renderer-options';
import { resolveCardStyle } from './lib/card-style';

export interface CardRendererProps extends MagicItemCardRendererProps {
  className?: string;
}

export function CardRenderer({ cardStyle, ...rest }: CardRendererProps) {
  const { layout } = resolveCardStyle(cardStyle);
  if (layout === 'pending') {
    return null;
  }

  switch (layout) {
    case 'minimal':
      return <MinimalMagicItemCard cardStyle={cardStyle} {...rest} />;
    default:
      return <PrintMagicItemCard cardStyle={cardStyle} {...rest} />;
  }
}
