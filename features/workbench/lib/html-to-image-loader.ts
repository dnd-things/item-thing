let htmlToImagePromise: Promise<typeof import('html-to-image')> | null = null;

export function loadHtmlToImage(): Promise<typeof import('html-to-image')> {
  if (!htmlToImagePromise) {
    htmlToImagePromise = import('html-to-image').catch((error) => {
      htmlToImagePromise = null;
      throw error;
    });
  }
  return htmlToImagePromise;
}
