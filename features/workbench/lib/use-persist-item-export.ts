'use client';

import { useAction, useMutation } from 'convex/react';
import { useCallback } from 'react';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';

import {
  dataUrlToBlob,
  uploadBlobToConvexStorage,
} from './upload-blob-to-convex-storage';
import type { WorkbenchSnapshotForExport } from './workbench-snapshot-for-export';

export interface PersistItemExportParams {
  workbenchSnapshot: WorkbenchSnapshotForExport;
  sourceImagePreviewDataUrl: string;
  exportFormat: 'png' | 'jpg';
  exportPixelRatio: 1 | 2;
}

export function usePersistItemExport() {
  const generateUploadUrl = useMutation(api.itemExports.generateUploadUrl);
  const createItemExport = useMutation(api.itemExports.createItemExport);
  const optimizeSourceImage = useAction(
    api.optimizeSourceImage.optimizeSourceImage,
  );

  return useCallback(
    async (params: PersistItemExportParams) => {
      let sourceImageStorageId: Id<'_storage'> | undefined;
      if (params.sourceImagePreviewDataUrl.trim() !== '') {
        const uploadUrlForSource = await generateUploadUrl();
        const sourceBlob = await dataUrlToBlob(
          params.sourceImagePreviewDataUrl,
        );
        const rawStorageId = await uploadBlobToConvexStorage(
          uploadUrlForSource,
          sourceBlob,
        );
        sourceImageStorageId = await optimizeSourceImage({
          sourceStorageId: rawStorageId,
          mimeType: sourceBlob.type !== '' ? sourceBlob.type : 'image/png',
        });
      }

      await createItemExport({
        workbenchSnapshot: params.workbenchSnapshot,
        exportFormat: params.exportFormat,
        exportPixelRatio: params.exportPixelRatio,
        ...(sourceImageStorageId !== undefined ? { sourceImageStorageId } : {}),
      });
    },
    [createItemExport, generateUploadUrl, optimizeSourceImage],
  );
}
