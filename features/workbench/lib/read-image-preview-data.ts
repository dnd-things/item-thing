'use client';

export interface ImagePreviewData {
  previewUrl: string;
  aspectRatio: number;
}

const MIN_VISIBLE_ALPHA = 8;

async function readFileAsDataUrl(imageFile: File): Promise<string> {
  return await new Promise((resolve, reject) => {
    const fileReader = new FileReader();

    fileReader.onerror = () => {
      reject(new Error('Failed to read image file.'));
    };

    fileReader.onload = () => {
      if (typeof fileReader.result === 'string') {
        resolve(fileReader.result);
        return;
      }

      reject(new Error('Image preview did not produce a data URL.'));
    };

    fileReader.readAsDataURL(imageFile);
  });
}

async function loadImageElementFromObjectUrl(
  imageFile: File,
): Promise<HTMLImageElement> {
  return await new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(imageFile);
    const image = new Image();

    const cleanup = () => {
      URL.revokeObjectURL(objectUrl);
    };

    image.onerror = () => {
      cleanup();
      reject(new Error('Failed to decode image file.'));
    };

    image.onload = () => {
      cleanup();
      resolve(image);
    };

    image.src = objectUrl;
  });
}

function findVisibleAlphaBounds(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): { left: number; top: number; width: number; height: number } | null {
  let left = width;
  let right = -1;
  let top = height;
  let bottom = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = data[(y * width + x) * 4 + 3];
      if (alpha === undefined || alpha < MIN_VISIBLE_ALPHA) {
        continue;
      }
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    }
  }

  if (right < left || bottom < top) {
    return null;
  }

  return {
    left,
    top,
    width: right - left + 1,
    height: bottom - top + 1,
  };
}

export async function readImagePreviewData(
  imageFile: File,
): Promise<ImagePreviewData> {
  const image = await loadImageElementFromObjectUrl(imageFile);
  const width = image.naturalWidth;
  const height = image.naturalHeight;

  if (width <= 0 || height <= 0) {
    throw new Error('Image dimensions are invalid.');
  }

  const sourceCanvas = document.createElement('canvas');
  sourceCanvas.width = width;
  sourceCanvas.height = height;

  const sourceContext = sourceCanvas.getContext('2d', {
    willReadFrequently: true,
  });
  if (!sourceContext) {
    throw new Error('Failed to inspect image transparency.');
  }

  sourceContext.drawImage(image, 0, 0);
  const imageData = sourceContext.getImageData(0, 0, width, height);
  const bounds = findVisibleAlphaBounds(imageData.data, width, height);

  if (
    bounds === null ||
    (bounds.left === 0 &&
      bounds.top === 0 &&
      bounds.width === width &&
      bounds.height === height)
  ) {
    const previewUrl = await readFileAsDataUrl(imageFile);
    return { previewUrl, aspectRatio: width / height };
  }

  const outputCanvas = document.createElement('canvas');
  outputCanvas.width = bounds.width;
  outputCanvas.height = bounds.height;
  const outputContext = outputCanvas.getContext('2d');
  if (!outputContext) {
    throw new Error('Failed to crop image preview.');
  }

  outputContext.drawImage(
    sourceCanvas,
    bounds.left,
    bounds.top,
    bounds.width,
    bounds.height,
    0,
    0,
    bounds.width,
    bounds.height,
  );

  const previewUrl = outputCanvas.toDataURL('image/png');
  return {
    previewUrl,
    aspectRatio: bounds.width / bounds.height,
  };
}
