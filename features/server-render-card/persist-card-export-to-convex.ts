import { ConvexHttpClient } from 'convex/browser';

import { api } from '@/convex/_generated/api';
import { uploadBlobToConvexStorage } from '@/features/workbench/lib/upload-blob-to-convex-storage';
import type { MagicItemWorkbenchState } from '@/features/workbench/lib/workbench-options';
import { toWorkbenchSnapshotForExport } from '@/features/workbench/lib/workbench-snapshot-for-export';

export interface PersistCardExportToConvexParams {
  convexUrl: string;
  exportFormat: 'jpg' | 'png';
  exportPixelRatio: 1 | 2;
  renderedContentType: string;
  renderedImageBuffer: Buffer;
  sourceArtworkBuffer: Buffer;
  sourceMimeType: string;
  workbenchState: MagicItemWorkbenchState;
}

function normalizeBlobMimeType(contentType: string): string {
  if (contentType.startsWith('image/')) {
    return contentType;
  }
  return 'application/octet-stream';
}

export async function persistCardExportToConvex(
  params: PersistCardExportToConvexParams,
): Promise<void> {
  const client = new ConvexHttpClient(params.convexUrl);

  const workbenchSnapshot = toWorkbenchSnapshotForExport(params.workbenchState);

  const sourceMime =
    params.sourceMimeType.trim() !== '' ? params.sourceMimeType : 'image/png';

  const uploadUrlForSource = await client.mutation(
    api.itemExports.generateUploadUrl,
    {},
  );
  const sourceBlob = new Blob([new Uint8Array(params.sourceArtworkBuffer)], {
    type: sourceMime,
  });
  const rawSourceStorageId = await uploadBlobToConvexStorage(
    uploadUrlForSource,
    sourceBlob,
  );
  const sourceImageStorageId = await client.action(
    api.optimizeSourceImage.optimizeSourceImage,
    {
      mimeType: sourceMime,
      sourceStorageId: rawSourceStorageId,
    },
  );

  const uploadUrlForExport = await client.mutation(
    api.itemExports.generateUploadUrl,
    {},
  );
  const exportedBlob = new Blob([new Uint8Array(params.renderedImageBuffer)], {
    type: normalizeBlobMimeType(params.renderedContentType),
  });
  const exportedImageStorageId = await uploadBlobToConvexStorage(
    uploadUrlForExport,
    exportedBlob,
  );

  await client.mutation(api.itemExports.createItemExport, {
    exportedImageStorageId,
    exportFormat: params.exportFormat,
    exportPixelRatio: params.exportPixelRatio,
    sourceImageStorageId,
    workbenchSnapshot,
  });
}
