'use client';

import { PrintMagicItemCard } from './components/print-magic-item-card';
import {
  isCardStyleSupported,
  type MagicItemCardRendererProps,
} from './lib/card-renderer-options';

export interface CardRendererProps extends MagicItemCardRendererProps {
  className?: string;
}

export function CardRenderer({ cardStyle, ...rest }: CardRendererProps) {
  if (!isCardStyleSupported(cardStyle)) {
    return null;
  }

  return <PrintMagicItemCard cardStyle={cardStyle} {...rest} />;
}
