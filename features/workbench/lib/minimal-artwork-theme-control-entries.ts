import type { MinimalArtworkThemeSwatch } from '@/features/card-renderer/lib/minimal-artwork-theme-source';

export type MinimalArtworkThemeControlEntry =
  | ({
      type: 'swatch';
    } & MinimalArtworkThemeSwatch)
  | {
      type: 'custom';
    };

export function getMinimalArtworkThemeControlEntries(
  swatches: ReadonlyArray<MinimalArtworkThemeSwatch>,
  showCustomColor: boolean,
): ReadonlyArray<MinimalArtworkThemeControlEntry> {
  const entries: MinimalArtworkThemeControlEntry[] = swatches.map((swatch) => ({
    type: 'swatch',
    ...swatch,
  }));

  if (showCustomColor) {
    entries.push({ type: 'custom' });
  }

  return entries;
}
