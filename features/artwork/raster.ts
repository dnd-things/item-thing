import {
  type ArtworkDrawPlan,
  type ArtworkDrawPolicy,
  fitInsideBudget,
  type IntegerCrop,
  planArtworkDraw,
} from './geometry.ts';
import {
  artworkLimitCopy,
  DISPLAY_MAX_EDGE_PX,
  DISPLAY_MAX_PIXELS,
} from './limits.ts';

export interface Drawable {
  width: number;
  height: number;
}

export interface DrawContext {
  drawImage(
    source: Drawable,
    dx: number,
    dy: number,
    dw: number,
    dh: number,
  ): void;
  drawImage(
    source: Drawable,
    sx: number,
    sy: number,
    sw: number,
    sh: number,
    dx: number,
    dy: number,
    dw: number,
    dh: number,
  ): void;
  translate(x: number, y: number): void;
  rotate(radians: number): void;
  scale(x: number, y: number): void;
  save(): void;
  restore(): void;
  getImageData(
    x: number,
    y: number,
    width: number,
    height: number,
  ): { data: Uint8ClampedArray };
}

export interface DrawCanvas {
  width: number;
  height: number;
  getContext(
    type: '2d',
    options?: { willReadFrequently?: boolean },
  ): DrawContext | null;
  toBlob(callback: (blob: Blob | null) => void, type: string): void;
}

export interface CanvasFactory {
  create(width: number, height: number): DrawCanvas;
  release(canvas: DrawCanvas): void;
}

export function paintTransformedDrawable(
  context: DrawContext,
  source: Drawable,
  plan: ArtworkDrawPlan,
): void {
  const drawnWidth = plan.logicalWidth * plan.fitScale;
  const drawnHeight = plan.logicalHeight * plan.fitScale;
  context.save();
  context.translate(plan.destinationWidth / 2, plan.destinationHeight / 2);
  context.scale(plan.flipX, plan.flipY);
  context.rotate(plan.rotationRadians);
  context.drawImage(
    source,
    -drawnWidth / 2,
    -drawnHeight / 2,
    drawnWidth,
    drawnHeight,
  );
  context.restore();
}

export function renderTransformedCanvas(
  source: Drawable,
  input: {
    logicalWidth: number;
    logicalHeight: number;
    rotationDegrees: number;
    flipHorizontal: boolean;
    flipVertical: boolean;
    policy: ArtworkDrawPolicy;
  },
  factory: CanvasFactory,
): DrawCanvas {
  const plan = planArtworkDraw(input);
  const canvas = factory.create(plan.destinationWidth, plan.destinationHeight);
  try {
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error(artworkLimitCopy.displayEncode);
    }
    paintTransformedDrawable(context, source, plan);
    return canvas;
  } catch (error) {
    factory.release(canvas);
    throw error;
  }
}

export function displayCropSize(crop: IntegerCrop): {
  width: number;
  height: number;
} {
  const fitted = fitInsideBudget(
    crop.width,
    crop.height,
    DISPLAY_MAX_EDGE_PX,
    DISPLAY_MAX_PIXELS,
    false,
  );
  return { width: fitted.width, height: fitted.height };
}

export function canvasToPngBlob(canvas: DrawCanvas): Promise<Blob> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (blob: Blob | null) => {
      if (settled) {
        return;
      }
      settled = true;
      if (!blob || blob.size === 0) {
        reject(new Error(artworkLimitCopy.encodeFailed));
        return;
      }
      resolve(blob);
    };
    try {
      canvas.toBlob(finish, 'image/png');
    } catch (error) {
      if (!settled) {
        settled = true;
        reject(
          error instanceof Error
            ? error
            : new Error(artworkLimitCopy.encodeFailed),
        );
      }
    }
  });
}

export function browserCanvasFactory(): CanvasFactory {
  return {
    create(width, height) {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const surface: DrawCanvas = {
        get width() {
          return canvas.width;
        },
        set width(value: number) {
          canvas.width = value;
        },
        get height() {
          return canvas.height;
        },
        set height(value: number) {
          canvas.height = value;
        },
        getContext(type, options) {
          const context = canvas.getContext(type, options);
          return context as DrawContext | null;
        },
        toBlob(callback, type) {
          canvas.toBlob(callback, type);
        },
      };
      return surface;
    },
    release(canvas) {
      canvas.width = 0;
      canvas.height = 0;
    },
  };
}
