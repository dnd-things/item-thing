import type { ArtworkColorSwatch } from '@/features/card-renderer/lib/artwork-color-source';

export type ArtworkColorControlEntry =
  | ({
      type: 'swatch';
    } & ArtworkColorSwatch)
  | {
      type: 'custom';
    };

export function getArtworkColorControlEntries(
  swatches: ReadonlyArray<ArtworkColorSwatch>,
  showCustomColor: boolean,
): ReadonlyArray<ArtworkColorControlEntry> {
  const entries: ArtworkColorControlEntry[] = swatches.map((swatch) => ({
    type: 'swatch',
    ...swatch,
  }));

  if (showCustomColor) {
    entries.push({ type: 'custom' });
  }

  return entries;
}
