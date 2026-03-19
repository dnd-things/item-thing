/**
 * Converts item name to a URL/filesystem-safe slug: lowercase, spaces to hyphens,
 * only [a-z0-9-]. Used for download filename: item-thing-{{slug}}.png
 */
export function slugFromItemName(itemName: string): string {
  const slug = itemName
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return slug;
}

const FILENAME_PREFIX = 'item-thing';

export type DownloadExtension = 'png' | 'jpg' | 'svg';

/**
 * Returns download filename: item-thing-{{slug}}.{{ext}}, or item-thing.{{ext}} when slug is empty.
 */
export function getCardDownloadFilename(
  itemName: string,
  extension: DownloadExtension = 'png',
): string {
  const ext =
    extension === 'jpg' ? '.jpg' : extension === 'svg' ? '.svg' : '.png';
  const slug = slugFromItemName(itemName);
  if (slug === '') {
    return `${FILENAME_PREFIX}${ext}`;
  }
  return `${FILENAME_PREFIX}-${slug}${ext}`;
}
