export const DISPLAYED_CARD_SURFACE_HEIGHT_ATTR =
  'data-card-preview-surface-height';

export function readDisplayedCardPreviewSurfaceHeight(
  node: { getAttribute(name: string): string | null } | null,
): number {
  if (!node) {
    return 0;
  }
  const raw = node.getAttribute(DISPLAYED_CARD_SURFACE_HEIGHT_ATTR);
  if (raw == null || raw.trim() === '') {
    return 0;
  }
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) {
    return 0;
  }
  return value;
}
