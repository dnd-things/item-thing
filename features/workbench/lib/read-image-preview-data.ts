'use client';

export interface ImagePreviewData {
  previewUrl: string;
  aspectRatio: number;
}

const MIN_VISIBLE_ALPHA = 8;
const MAX_INSPECTION_DIMENSION_PX = 2048;

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

function getInspectionDimensions(
  width: number,
  height: number,
): {
  width: number;
  height: number;
} {
  const scale = Math.min(
    1,
    MAX_INSPECTION_DIMENSION_PX / Math.max(width, height),
  );

  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
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
  const inspectionDimensions = getInspectionDimensions(width, height);
  sourceCanvas.width = inspectionDimensions.width;
  sourceCanvas.height = inspectionDimensions.height;

  const sourceContext = sourceCanvas.getContext('2d', {
    willReadFrequently: true,
  });
  if (!sourceContext) {
    throw new Error('Failed to inspect image transparency.');
  }

  sourceContext.drawImage(
    image,
    0,
    0,
    inspectionDimensions.width,
    inspectionDimensions.height,
  );

  let bounds: {
    left: number;
    top: number;
    width: number;
    height: number;
  } | null;
  try {
    const imageData = sourceContext.getImageData(
      0,
      0,
      inspectionDimensions.width,
      inspectionDimensions.height,
    );
    const scaledBounds = findVisibleAlphaBounds(
      imageData.data,
      inspectionDimensions.width,
      inspectionDimensions.height,
    );

    bounds =
      scaledBounds === null
        ? null
        : {
            left: Math.max(
              0,
              Math.floor(
                (scaledBounds.left * width) / inspectionDimensions.width,
              ),
            ),
            top: Math.max(
              0,
              Math.floor(
                (scaledBounds.top * height) / inspectionDimensions.height,
              ),
            ),
            width:
              Math.min(
                width,
                Math.ceil(
                  ((scaledBounds.left + scaledBounds.width) * width) /
                    inspectionDimensions.width,
                ),
              ) -
              Math.max(
                0,
                Math.floor(
                  (scaledBounds.left * width) / inspectionDimensions.width,
                ),
              ),
            height:
              Math.min(
                height,
                Math.ceil(
                  ((scaledBounds.top + scaledBounds.height) * height) /
                    inspectionDimensions.height,
                ),
              ) -
              Math.max(
                0,
                Math.floor(
                  (scaledBounds.top * height) / inspectionDimensions.height,
                ),
              ),
          };
  } catch {
    const previewUrl = await readFileAsDataUrl(imageFile);
    return { previewUrl, aspectRatio: width / height };
  }

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
    image,
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
